import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	load, save, newGame, tick, produce, move, moveKind, deliver, sell, sellValue, buyUpgrade, upgradeState,
	addEnergy, markSeen, dueTier, nextTier, claimTier, activeOrders, pickCells, parse, genOf, pieceName, energyIn, chargeIn, isFull,
	stepOf, storyOrder, currentProject, projectOf, missingGens, code, CELLS, type State, type Piece,
} from './engine';
import {
	CHAINS, GENERATORS, UPGRADES, ORDERS, PROJECTS, COLS, ROWS, ENERGY_MAX, ENERGY_PACK,
	INTRO, EPILOGUE, SPEAKERS, FACES, FACE_EMOJI, REP_TIERS,
	type Line, type Order, type GenId, type ProjectId,
} from './data';
import Watch, { WatchBack, WATCH_CSS } from './Watch';
import Radio, { RADIO_CSS } from './Radio';
import Voilier, { VOILIER_CSS } from './Voilier';
import Boite, { MapPieces, BOITE_CSS } from './Boite';
import * as sfx from './sfx';
import { usePointerDrag } from '../usePointerDrag';
import { useWallet } from '../../lib/useWallet';
import { spend, earnOnce } from '../../lib/wallet';
import { trackGame, trackEvent } from '../../lib/analytics';
import Cocoin from '../../components/Cocoin';

/* =====================================================
   L'Atelier des Souvenirs — merge-2 + restoration vertical slice.
   Turn-based island: the engine is pure, the clock only refills energy and charges.
   Saved to localStorage after every change, so a session can stop at any moment.
   ===================================================== */

const SAVE_KEY = 'ludiven-atelier';
const ART = '/assets/jeux/atelier';
const FALLBACK: Record<string, string> = { outil: '🪛', soin: '🧽', meca: '⚙️', elec: '💡', bois: '🪵', boite: '🧰', tiroir: '🗄️', caisse: '🔌', coffre: '🪚' };

type View = 'atelier' | 'etabli';
interface Art { project: ProjectId; state: number }
type Scene =
	| { kind: 'talk'; id: string; lines: Line[]; art?: Art; title?: string }
	| { kind: 'restore'; id: string; project: ProjectId; title: string; from: number; to: number; lines: Line[] };

/** The restored object of a project, drawn at a restoration state. */
function ObjectArt({ project, state }: Art) {
	if (project === 'radio') return <Radio state={state} size="100%" />;
	if (project === 'voilier') return <Voilier state={state} size="100%" />;
	if (project === 'boite') return <Boite state={state} size="100%" />;
	return <Watch state={state} size="100%" />;
}

interface Drag { from: number; x: number; y: number; over: number }
interface Anim { k: number; type: 'spawn' | 'pop'; dx?: number; dy?: number }
interface Toast { k: number; text: string; undo?: State }

const fmt = (ms: number): string => {
	const s = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const imgOf = (p: Piece): string => {
	const g = genOf(p);
	if (g) return `${ART}/gen-${g}.png`;
	const i = parse(p)!;
	return `${ART}/${i.chain}-${i.level}.png`;
};

function PieceImg({ piece, className }: { piece: Piece; className?: string }) {
	const [broken, setBroken] = useState(false);
	const g = genOf(piece);
	const i = parse(piece);
	if (broken) {
		return <span className={`at-emoji ${className ?? ''}`} aria-hidden="true">{FALLBACK[g ?? i?.chain ?? 'outil']}</span>;
	}
	return <img className={className} src={imgOf(piece)} alt="" draggable={false} onError={() => setBroken(true)} />;
}

function Face({ who, size = 40 }: { who: string; size?: number }) {
	const [broken, setBroken] = useState(false);
	const f = FACES[who];
	if (f && !broken) return <img className="at-face" src={`${ART}/${f}.jpg`} alt="" width={size} height={size} onError={() => setBroken(true)} />;
	return <span className="at-face at-face-emoji" style={{ width: size, height: size }} aria-hidden="true">{FACE_EMOJI[who] ?? '🙂'}</span>;
}

const whoName = (w: Line['who']): string => SPEAKERS[w];

export default function AtelierGame({ gameId }: { gameId: string }) {
	const [s, setS] = useState<State | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [view, setView] = useState<View>('etabli');
	const [sel, setSel] = useState<number | null>(null);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [anims, setAnims] = useState<Record<number, Anim>>({});
	const [toast, setToast] = useState<Toast | null>(null);
	const [scenes, setScenes] = useState<Scene[]>([]);
	const [energyOpen, setEnergyOpen] = useState(false);
	const [confirmSell, setConfirmSell] = useState<number | null>(null);
	const [confirmReset, setConfirmReset] = useState(false);
	const [sound, setSound] = useState(true);
	const boardRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ from: number; x0: number; y0: number; moved: boolean } | null>(null);
	const animK = useRef(0);
	const sRef = useRef<State | null>(null);
	sRef.current = s;
	const wallet = useWallet();

	// ---------- load / save / clock ----------
	useEffect(() => {
		let raw: string | null = null;
		try { raw = localStorage.getItem(SAVE_KEY); } catch { /* storage blocked */ }
		const st = load(raw, Date.now());
		setS(st);
		if (!st.seen.includes('intro')) setScenes([{ kind: 'talk', id: 'intro', lines: INTRO }]);
		setView(st.upgrades.includes('etabli') || st.tut < 3 ? 'etabli' : 'atelier');
		setSound(sfx.isEnabled());
		trackGame(gameId, 'game_started');
	}, [gameId]);

	useEffect(() => {
		if (!s) return;
		try { localStorage.setItem(SAVE_KEY, save(s)); } catch { /* storage full or blocked */ }
	}, [s]);

	// Another tab played: take its save, so this one never overwrites newer progress.
	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key !== SAVE_KEY || !e.newValue) return;
			setS(load(e.newValue, Date.now()));
			setSel(null);
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, []);

	useEffect(() => {
		const beat = () => {
			const t = Date.now();
			setNow(t);
			setS((prev) => (prev ? tick(prev, t) : prev));
		};
		const id = setInterval(beat, 1000);
		const onVis = () => { if (!document.hidden) beat(); };
		document.addEventListener('visibilitychange', onVis);
		const onHide = () => {
			const st = sRef.current;
			if (st) trackEvent('atelier:session_end', { ...st.progress, delivered: st.stats.delivered, produced: st.stats.produced });
		};
		window.addEventListener('pagehide', onHide);
		return () => {
			clearInterval(id);
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('pagehide', onHide);
		};
	}, []);

	// Once the scene queue is empty: a client arriving with a new object, else a reputation visit.
	useEffect(() => {
		if (!s || scenes.length) return;
		const st = storyOrder(s);
		if (st && st.step === 1 && !s.seen.includes(`arrival:${st.project}`)) {
			const p = projectOf(st.project!);
			setScenes([{ kind: 'talk', id: `arrival:${p.id}`, lines: p.arrival, art: { project: p.id, state: 0 }, title: `Chapitre ${p.chapter} · ${p.title}` }]);
			return;
		}
		const t = dueTier(s);
		if (!t) return;
		setS(claimTier(s, t.id));
		setScenes([{ kind: 'talk', id: t.id, lines: t.lines, title: t.title }]);
		trackEvent('atelier:rep_tier', { id: t.id });
	}, [s, scenes.length]);

	const flash = useCallback((text: string, undo?: State) => {
		setToast({ k: Date.now(), text, undo });
	}, []);
	useEffect(() => {
		if (!toast) return;
		const id = setTimeout(() => setToast(null), toast.undo ? 5000 : 3200);
		return () => clearTimeout(id);
	}, [toast]);

	const animate = (cell: number, a: Omit<Anim, 'k'>) => {
		animK.current++;
		setAnims((m) => ({ ...m, [cell]: { ...a, k: animK.current } }));
	};

	// ---------- actions ----------
	const tapGenerator = (cell: number) => {
		if (!s) return;
		const r = produce(s, cell, Date.now());
		if (!r.ok) {
			sfx.refuse();
			if (r.why === 'energy') { setEnergyOpen(true); trackEvent('atelier:energy_empty', { project: currentProject(s).id }); }
			else if (r.why === 'full') { flash('Établi plein : fusionne des objets, ou touche-en un pour le vendre.'); trackEvent('atelier:board_full', { project: currentProject(s).id }); }
			else if (r.why === 'charges') flash(`${GENERATORS[genOf(s.board[cell])!].name} : rechargement…`);
			return;
		}
		sfx.produce();
		if (s.tut === 0) trackEvent('atelier:tutorial_step', { step: 1 });
		const dc = (cell % COLS) - (r.at % COLS), dr = Math.floor(cell / COLS) - Math.floor(r.at / COLS);
		animate(r.at, { type: 'spawn', dx: dc, dy: dr });
		setS(r.s);
		setSel(cell);
	};

	const drop = (from: number, to: number) => {
		if (!s) return;
		const kind = moveKind(s, from, to);
		if (kind === 'none') return;
		const r = move(s, from, to);
		if (kind === 'merge') {
			animate(to, { type: 'pop' });
			sfx.merge(parse(r.s.board[to])!.level);
			if (s.tut === 1) trackEvent('atelier:tutorial_step', { step: 2 });
			setSel(to);
		} else setSel(to);
		setS(r.s);
	};

	const doDeliver = (o: Order) => {
		if (!s) return;
		const r = deliver(s, o.id);
		if (!r.ok) return;
		setS(r.s);
		setSel(null);
		sfx.deliver();
		trackEvent('atelier:order_completed', { order: o.id.startsWith('q') ? 'local' : o.id });
		if (s.tut === 2) trackEvent('atelier:tutorial_step', { step: 3 });
		// Keyed by order: a second tab holding a stale copy of the same order cannot pay it twice.
		if (o.reward.cocoins) earnOnce(`atelier:${o.id}`, o.reward.cocoins);
		if (o.kind === 'story' && o.scene && o.project && o.step) {
			trackEvent('atelier:restoration_step', { project: o.project, step: o.step });
			const next: Scene[] = [{ kind: 'restore', id: o.id, project: o.project, title: o.scene.title, from: o.step - 1, to: o.step, lines: o.scene.lines }];
			setScenes((q) => [...q, ...next]);
		} else {
			const bits = [`+${o.reward.coins} pièces`];
			if (o.reward.rep) bits.push(`+${o.reward.rep} réputation`);
			flash(`${o.client} est ravi·e ! ${bits.join(' · ')}`);
		}
	};

	const doSell = (cell: number) => {
		if (!s) return;
		const p = s.board[cell];
		if (!p || !parse(p)) return;
		const inOrder = activeOrders(s).some((o) => o.needs.includes(p));
		if (inOrder && confirmSell !== cell) { setConfirmSell(cell); return; }
		setConfirmSell(null);
		const before = s;
		setS(sell(s, cell));
		setSel(null);
		flash(`${pieceName(p)} vendu · +${sellValue(p)} pièce${sellValue(p) > 1 ? 's' : ''}`, before);
	};

	const doUpgrade = (id: string) => {
		if (!s) return;
		const n = buyUpgrade(s, id);
		if (n === s) return;
		trackEvent('atelier:upgrade', { id });
		if (s.tut === 3 && id === 'etabli') trackEvent('atelier:tutorial_step', { step: 4 });
		let st = n;
		const q: Scene[] = [];
		const up = UPGRADES.find((u) => u.id === id);
		if (up?.scene && !st.seen.includes(`up:${id}`)) q.push({ kind: 'talk', id: `up:${id}`, lines: up.scene.lines, title: up.scene.title });
		if (id === 'photo' && !st.seen.includes('epilogue')) {
			q.push({ kind: 'talk', id: 'epilogue', lines: EPILOGUE, title: 'Fin du chapitre 1' });
			st = markSeen(st, 'chapter');
		}
		setS(st);
		if (q.length) setScenes((x) => [...x, ...q]);
	};

	const buyEnergy = () => {
		if (!s) return;
		if (!spend(ENERGY_PACK.price)) return;
		setS(addEnergy(s, ENERGY_PACK.energy));
		trackEvent('atelier:energy_bought', { project: currentProject(s).id });
		setEnergyOpen(false);
		flash(`+${ENERGY_PACK.energy} énergie`);
	};

	const closeScene = () => {
		const sc = scenes[0];
		if (!sc) return;
		setScenes((q) => q.slice(1));
		if (s) setS(markSeen(s, sc.id));
		if (sc.id === 'intro' || sc.id.startsWith('arrival')) setView('etabli');
		if (sc.kind === 'restore' && sc.to >= projectOf(sc.project).steps) setView('atelier');
	};

	const reset = () => {
		const st = newGame(Date.now());
		setS(st);
		setScenes([{ kind: 'talk', id: 'intro', lines: INTRO }]);
		setSel(null);
		setView('etabli');
		setConfirmReset(false);
	};

	// ---------- pointer ----------
	const cellAt = (x: number, y: number): number => {
		const el = boardRef.current;
		if (!el) return -1;
		const r = el.getBoundingClientRect();
		const c = Math.floor(((x - r.left) / r.width) * COLS);
		const rr = Math.floor(((y - r.top) / r.height) * ROWS);
		if (c < 0 || c >= COLS || rr < 0 || rr >= ROWS) return -1;
		return rr * COLS + c;
	};

	const { onPointerDown } = usePointerDrag(
		(x, y) => {
			const st = sRef.current;
			const cell = cellAt(x, y);
			if (!st || cell < 0) { dragRef.current = null; return; }
			dragRef.current = st.board[cell] ? { from: cell, x0: x, y0: y, moved: false } : null;
			if (!st.board[cell]) { setSel(null); setConfirmSell(null); }
		},
		(x, y) => {
			const d = dragRef.current;
			if (!d) return;
			if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 8) return;
			d.moved = true;
			setDrag({ from: d.from, x, y, over: cellAt(x, y) });
		},
		(x, y) => {
			const d = dragRef.current;
			dragRef.current = null;
			setDrag(null);
			if (!d) return;
			if (!d.moved) {
				const st = sRef.current;
				if (!st) return;
				setConfirmSell(null);
				if (genOf(st.board[d.from])) { setSel(d.from); tapGenerator(d.from); return; }
				// Tap one item, then its twin: the same merge as a drag, for whoever finds dragging hard.
				if (sel !== null && sel !== d.from && moveKind(st, sel, d.from) === 'merge') { drop(sel, d.from); return; }
				setSel((v) => (v === d.from ? null : d.from));
				return;
			}
			const to = cellAt(x, y);
			if (to >= 0) drop(d.from, to);
		},
	);

	// ---------- derived ----------
	const orders = useMemo(() => (s ? activeOrders(s) : []), [s]);
	const need = useMemo(() => new Set(orders.flatMap((o) => o.needs)), [orders]);
	const ready = useMemo(() => {
		const set = new Set<number>();
		if (!s) return set;
		for (const o of orders) for (const c of pickCells(s, o) ?? []) set.add(c);
		return set;
	}, [s, orders]);
	const story = orders.find((o) => o.kind === 'story') ?? null;

	if (!s) return <div className="at-root"><style>{CSS}</style><p className="at-loading">Ouverture de l’atelier…</p></div>;

	const coach = coachFor(s, orders, view);
	const pairCells = coach?.target === 'pair' ? pairs(s) : new Set<number>();
	const selPiece = sel !== null ? s.board[sel] : null;
	const twinOf = selPiece && parse(selPiece) && parse(selPiece)!.level < parse(selPiece)!.max ? selPiece : null;
	const scene = scenes[0] ?? null;
	const chapterDone = s.seen.includes('chapter');

	return (
		<div className="at-root">
			<style>{CSS}{WATCH_CSS}{RADIO_CSS}{VOILIER_CSS}{BOITE_CSS}</style>

			<div className="at-hud">
				<button className="at-stat at-energy" onClick={() => setEnergyOpen(true)} aria-label="Énergie">
					<span aria-hidden="true">⚡</span>
					<strong>{s.energy}</strong>
					{s.energy < ENERGY_MAX ? <em>{fmt(energyIn(s, now))}</em> : <small>/{ENERGY_MAX}</small>}
					<span className="at-plus" aria-hidden="true">+</span>
				</button>
				<span className="at-stat" title="Pièces"><span aria-hidden="true">🪙</span><strong>{s.coins}</strong></span>
				<button className="at-stat at-snd" onClick={() => { sfx.setEnabled(!sound); setSound(!sound); }} aria-label={sound ? 'Couper le son' : 'Activer le son'} title={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
				<div className="at-tabs" role="tablist">
					<button role="tab" aria-selected={view === 'atelier'} className={`at-tab ${view === 'atelier' ? 'on' : ''} ${coach?.target === 'tab' ? 'at-pulse' : ''}`} onClick={() => setView('atelier')}>Atelier</button>
					<button role="tab" aria-selected={view === 'etabli'} className={`at-tab ${view === 'etabli' ? 'on' : ''}`} onClick={() => setView('etabli')}>Établi</button>
				</div>
			</div>

			{coach && <div className="at-coach" key={coach.text}>{coach.text}</div>}

			{view === 'etabli' ? (
				<>
					<div className="at-orders">
						{orders.length === 0 && <p className="at-noorder">Personne au comptoir pour l’instant.</p>}
						{orders.map((o) => {
							const cells = pickCells(s, o);
							const can = cells !== null;
							return (
								<div key={o.id} className={`at-order ${o.kind === 'story' ? 'story' : ''} ${can ? 'can' : ''}`}>
									<div className="at-order-head">
										<Face who={o.client} size={30} />
										<div className="at-order-who">
											<strong>{o.client}</strong>
											<span>{o.kind === 'story' ? `${projectOf(o.project!).object} · étape ${o.step}/${projectOf(o.project!).steps}` : o.ask}</span>
										</div>
									</div>
									<div className="at-needs">
										{o.needs.map((p, k) => {
											const have = s.board.includes(p);
											return (
												<span key={k} className={`at-need ${have ? 'have' : ''}`} title={pieceName(p)}>
													<PieceImg piece={p} />
													<i>{parse(p)!.level}</i>
													{have && <b aria-label="disponible">✓</b>}
												</span>
											);
										})}
									</div>
									<button className={`at-give ${coach?.target === 'give' && can ? 'at-pulse' : ''}`} disabled={!can} onClick={() => doDeliver(o)}>
										{can ? 'Livrer' : `${o.reward.coins} 🪙`}
									</button>
								</div>
							);
						})}
					</div>

					<div className="at-boardwrap">
						<div ref={boardRef} className="at-board" onPointerDown={onPointerDown} style={{ ['--cols' as string]: COLS, ['--rows' as string]: ROWS }}>
							{Array.from({ length: CELLS }, (_, i) => {
								const p = s.board[i];
								const g = genOf(p);
								const a = anims[i];
								const isOver = drag && drag.over === i && drag.from !== i;
								const mk = isOver ? moveKind(s, drag.from, i) : null;
								const hint = (coach?.target === 'gen' && g === 'boite') || pairCells.has(i);
								return (
									<div
										key={i}
										className={[
											'at-cell',
											sel === i ? 'sel' : '',
											twinOf && i !== sel && p === twinOf ? 'twin' : '',
											isOver ? `over ${mk}` : '',
											drag?.from === i ? 'lifted' : '',
											hint ? 'at-pulse' : '',
										].join(' ')}
									>
										{p && (
											<div
												key={a ? `${i}-${a.k}` : i}
												className={`at-piece ${g ? 'gen' : ''} ${a?.type === 'spawn' ? 'spawn' : ''} ${a?.type === 'pop' ? 'pop' : ''}`}
												style={a?.type === 'spawn' ? { ['--dx' as string]: a.dx, ['--dy' as string]: a.dy } : undefined}
											>
												<PieceImg piece={p} />
												{g ? (
													<GenBadge s={s} g={g} now={now} />
												) : (
													<>
														<i className="at-lvl">{parse(p)!.level}</i>
														{ready.has(i) ? <b className="at-tag ready" aria-label="prêt à livrer">✓</b>
															: need.has(p) ? <b className="at-tag want" aria-label="demandé">!</b> : null}
													</>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>

					<Info
						s={s}
						cell={sel}
						piece={selPiece}
						need={need}
						now={now}
						confirm={confirmSell === sel}
						onSell={() => sel !== null && doSell(sel)}
					/>
				</>
			) : (
				<Workshop
					s={s}
					story={story}
					chapterDone={chapterDone}
					coachUp={coach?.target === 'up'}
					onUpgrade={doUpgrade}
					onBench={() => setView('etabli')}
					confirmReset={confirmReset}
					onReset={() => (confirmReset ? reset() : setConfirmReset(true))}
					onReplay={() => {
						const p = currentProject(s);
						const lines = [
							...p.arrival,
							...ORDERS.filter((o) => o.project === p.id && o.step! <= stepOf(s, p.id)).flatMap((o) => o.scene!.lines),
							...(p.id === 'montre' ? REP_TIERS.filter((t) => s.seen.includes(t.id)).flatMap((t) => t.lines) : []),
						];
						setScenes((q) => [...q, { kind: 'talk', id: 'replay', lines, art: { project: p.id, state: stepOf(s, p.id) }, title: `Carnet · ${p.title}` }]);
					}}
				/>
			)}

			{drag && s.board[drag.from] && (
				<div className="at-ghost" style={{ left: drag.x, top: drag.y }}>
					<PieceImg piece={s.board[drag.from]!} />
				</div>
			)}

			{toast && (
				<div className="at-toast" key={toast.k} role="status">
					<span>{toast.text}</span>
					{toast.undo && <button onClick={() => { setS(toast.undo!); setToast(null); }}>Annuler</button>}
				</div>
			)}

			{scene && <SceneView scene={scene} onDone={closeScene} />}

			{energyOpen && (
				<div className="at-modal" onClick={(e) => { if (e.target === e.currentTarget) setEnergyOpen(false); }}>
					<div className="at-card">
						<h3>⚡ Énergie</h3>
						<p>Chaque objet sorti d’un générateur coûte 1 énergie. Elle revient toute seule : +1 toutes les 2 minutes, jusqu’à {ENERGY_MAX}, même quand le jeu est fermé.</p>
						<p className="at-big"><strong>{s.energy}</strong> / {ENERGY_MAX}{s.energy < ENERGY_MAX && <> · prochaine dans {fmt(energyIn(s, now))}</>}</p>
						<div className="at-pack">
							<span>Échanger <strong>{ENERGY_PACK.price} <Cocoin size="1em" /></strong> contre <strong>{ENERGY_PACK.energy} ⚡</strong></span>
							<button className="at-btn" disabled={!wallet.ready || wallet.balance < ENERGY_PACK.price} onClick={buyEnergy}>Échanger</button>
						</div>
						<p className="at-small">Tu as {wallet.balance} cocoin{wallet.balance > 1 ? 's' : ''}. {wallet.balance < ENERGY_PACK.price ? 'Gagne-en avec les étoiles des niveaux et les ' : 'Tu en gagnes aussi avec les '}<a href="/jeux/defi">défis du jour</a> de tous les jeux.</p>
						<button className="at-btn ghost" onClick={() => setEnergyOpen(false)}>Fermer</button>
					</div>
				</div>
			)}
		</div>
	);
}

function GenBadge({ s, g, now }: { s: State; g: GenId; now: number }) {
	const max = GENERATORS[g].charges;
	const c = s.gens[g].charges;
	return (
		<>
			<span className="at-charge" aria-label={`${c} charges sur ${max}`}>
				<span style={{ width: `${(c / max) * 100}%` }} />
			</span>
			{c === 0 && <span className="at-wait">{fmt(chargeIn(s, g, now))}</span>}
		</>
	);
}

function Info({ s, cell, piece, need, now, confirm, onSell }: {
	s: State; cell: number | null; piece: Piece | null; need: Set<Piece>; now: number; confirm: boolean; onSell: () => void;
}) {
	if (cell === null || !piece) {
		return (
			<div className="at-info idle">
				{isFull(s)
					? 'Établi plein : fusionne deux objets identiques, ou touche un objet pour le vendre.'
					: 'Touche un générateur pour produire. Glisse un objet sur son jumeau (ou touche l’un puis l’autre) pour les fusionner.'}
			</div>
		);
	}
	const g = genOf(piece);
	if (g) {
		const gen = GENERATORS[g];
		const fams = [...new Set(gen.out.map((o) => CHAINS[o.chain].family))].join(' ou ');
		const c = s.gens[g].charges;
		return (
			<div className="at-info">
				<PieceImg piece={piece} className="at-info-img" />
				<div>
					<strong>{gen.name}</strong>
					<span>Produit : {fams} · 1 ⚡ par objet</span>
					<span>Charges {c}/{gen.charges}{c < gen.charges && ` · +1 dans ${fmt(chargeIn(s, g, now))}`}</span>
				</div>
			</div>
		);
	}
	const i = parse(piece)!;
	const chain = CHAINS[i.chain];
	const nextName = i.level < i.max ? chain.items[i.level] : null;
	return (
		<div className="at-info">
			<PieceImg piece={piece} className="at-info-img" />
			<div>
				<strong>{i.name} <small>niv. {i.level}/{i.max}</small></strong>
				<span>{chain.family} · vient de : {GENERATORS[chain.gen].name}</span>
				<span className="at-chainrow" aria-label="Chaîne">
					{chain.items.map((_, k) => (
						<span key={k} className={`at-chainstep ${k + 1 === i.level ? 'cur' : ''} ${k + 1 < i.level ? 'past' : ''}`}>
							<PieceImg piece={code(i.chain, k + 1)} />
						</span>
					))}
				</span>
				<span>{nextName ? `2 identiques → ${nextName}` : 'Niveau maximum'}{need.has(piece) && ' · demandé par une commande'}</span>
			</div>
			<button className={`at-btn small ${confirm ? 'warn' : 'ghost'}`} onClick={onSell}>
				{confirm ? 'Vendre quand même ?' : `Vendre +${sellValue(piece)} 🪙`}
			</button>
		</div>
	);
}

function Workshop({ s, story, chapterDone, coachUp, onUpgrade, onBench, confirmReset, onReset, onReplay }: {
	s: State; story: Order | null; chapterDone: boolean; coachUp: boolean;
	onUpgrade: (id: string) => void; onBench: () => void; confirmReset: boolean; onReset: () => void; onReplay: () => void;
}) {
	const has = (u: string) => s.upgrades.includes(u);
	const project = currentProject(s);
	const step = stepOf(s, project.id);
	// Dust thins out as the story and the workshop move forward.
	const told = PROJECTS.reduce((a, p) => a + stepOf(s, p.id), 0);
	const total = PROJECTS.reduce((a, p) => a + p.steps, 0);
	const progress = Math.min(1, (s.upgrades.length + told) / (UPGRADES.length + total));
	const started = has('etabli');
	const lost = missingGens(s);
	return (
		<div className="at-shop">
			<div className={`at-scene ${has('lampe') ? 'lit' : ''}`} style={{ ['--dust' as string]: 1 - progress }}>
				<div className="at-scene-img" />
				<div className="at-scene-dust" />
				{!has('etabli') && (
					<svg className="at-sheet" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Établi sous une bâche">
						<defs>
							<linearGradient id="at-cloth" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0" stopColor="#d8d0bd" />
								<stop offset="1" stopColor="#8e8573" />
							</linearGradient>
						</defs>
						<path d="M4 10 C14 4 30 7 42 5 C56 3 64 8 76 5 C86 3 94 7 97 9 L99 30 C95 34 91 29 86 35 C81 30 77 37 70 33 C64 38 58 31 52 36 C46 31 41 38 34 33 C28 37 22 31 16 36 C11 32 6 36 1 31z" fill="url(#at-cloth)" />
						<path d="M14 8 C16 18 12 26 15 34 M30 7 C28 17 33 25 31 35 M47 5 C49 15 45 26 49 35 M63 7 C61 17 66 26 63 35 M80 5 C82 15 78 25 83 33" stroke="#5f584b" strokeWidth="1.2" opacity="0.35" fill="none" />
						<path d="M6 11 C18 6 30 9 42 7 C56 5 66 10 78 7 C88 5 94 9 96 10" stroke="#efe9dc" strokeWidth="1.2" opacity="0.5" fill="none" />
					</svg>
				)}
				{has('lampe') && <div className="at-lamp" />}
				{has('etageres') && <div className="at-shelves" aria-label="Les étagères de Jeanne, rouvertes" />}
				{has('bureau') && <div className="at-door-open" aria-label="La porte du bureau, ouverte" />}
				{has('photo') && <div className="at-photo" aria-label="La photo de 1961"><img src={`${ART}/photo.jpg`} alt="" /></div>}
				{started && step < project.steps && story && (
					<div className={`at-onbench ${project.id}`}><ObjectArt project={project.id} state={step} /></div>
				)}
			</div>

			<div className="at-project">
				{started ? (
					<>
						<div className={`at-project-watch ${project.id}`}><ObjectArt project={project.id} state={step} /></div>
						<div className="at-project-txt">
							<strong>Chapitre {project.chapter} · {project.title}</strong>
							{story ? (
								<span>Étape {story.step}/{project.steps} : {story.ask}</span>
							) : step >= project.steps ? (
								<span>
									{project.id === 'montre'
										? `Restaurée et rendue. ${chapterDone ? 'La photo de 1961 est au mur.' : 'Accroche la photo de 1961 pour clore le chapitre.'}`
										: 'Restaurée et rendue. La suite de l’histoire arrive bientôt.'}
								</span>
							) : stepOf(s, project.id) > 0 ? (
								<span>En attente : {UPGRADES.find((u) => ORDERS.some((o) => o.project === project.id && o.step === step + 1 && o.after === u.id))?.name ?? 'une amélioration de l’atelier'}.</span>
							) : (
								<span>En attente.</span>
							)}
							{lost.length > 0 && <span className="at-warn">Libère une case de l’établi : {GENERATORS[lost[0]].name} attend sa place.</span>}
							<div className="at-project-btns">
								{story && <button className="at-btn small" onClick={onBench}>À l’établi</button>}
								<button className="at-btn small ghost" onClick={onReplay}>Relire</button>
							</div>
						</div>
					</>
				) : (
					<div className="at-project-txt">
						<strong>Un atelier sous la poussière</strong>
						<span>Dégage l’établi pour accueillir les clients.</span>
					</div>
				)}
			</div>

			{has('bureau') && (
				<section className="at-office" aria-label="Le bureau de Jeanne">
					<div className="at-office-img small" />
					<div className="at-office-txt">
						<strong>Le bureau de Jeanne</strong>
						<span>Le carnet de Rose « la Pie », 1813. Une carte marine, un îlot entouré de rouge. Une fiche : « Chercher la pie. »</span>
						<div className="at-map small"><MapPieces count={3} /></div>
					</div>
				</section>
			)}

			<ul className="at-ups">
				{UPGRADES.map((u) => {
					const st = upgradeState(s, u.id);
					return (
						<li key={u.id} className={`at-up ${st}`}>
							<div>
								<strong>{u.name}</strong>
								<span>{st === 'locked' ? 'Se débloque plus tard dans l’histoire.' : u.desc}</span>
							</div>
							{st === 'owned' ? (
								<span className="at-done">✓</span>
							) : (
								<button className={`at-btn small ${coachUp && u.id === 'etabli' ? 'at-pulse' : ''}`} disabled={st !== 'ok'} onClick={() => onUpgrade(u.id)}>
									{u.cost} 🪙
								</button>
							)}
						</li>
					);
				})}
			</ul>

			{nextTier(s) && (
				<p className="at-tier">⭐ Réputation {s.rep}/{nextTier(s)!.at} · prochain palier : {nextTier(s)!.title}</p>
			)}
			<p className="at-foot">
				Réputation {s.rep} · {s.stats.delivered} commande{s.stats.delivered > 1 ? 's' : ''} livrée{s.stats.delivered > 1 ? 's' : ''}
				<button className="at-link" onClick={onReset}>{confirmReset ? 'Tout effacer, vraiment ?' : 'Recommencer'}</button>
			</p>
		</div>
	);
}

function SceneView({ scene, onDone }: { scene: Scene; onDone: () => void }) {
	const [i, setI] = useState(0);
	const [after, setAfter] = useState(scene.kind !== 'restore');
	useEffect(() => {
		setI(0);
		setAfter(scene.kind !== 'restore');
		if (scene.kind !== 'restore') return;
		const id = setTimeout(() => { setAfter(true); sfx.restore(); }, 900);
		return () => clearTimeout(id);
	}, [scene]);
	const lines = scene.lines;
	const line = lines[i];
	const last = i >= lines.length - 1;
	const art: Art | undefined = scene.kind === 'restore' ? { project: scene.project, state: after ? scene.to : scene.from } : scene.art;
	const next = () => (last ? onDone() : setI(i + 1));
	return (
		<div className="at-modal at-scene-modal" role="dialog" aria-modal="true">
			<div className="at-card at-talk">
				{scene.kind === 'restore' && <p className="at-kicker">Restauration · étape {scene.to}/{projectOf(scene.project).steps}</p>}
				{scene.id === 'intro' && <div className="at-intro-img" role="img" aria-label="L’atelier poussiéreux" />}
				{(scene.kind === 'restore' || scene.title) && <h3>{scene.kind === 'restore' ? scene.title : scene.title}</h3>}
				{line?.show ? (
					<div className="at-clue" key={`clue-${i}`}>
						{line.show === 'back' && <WatchBack size="100%" />}
						{line.show === 'mechanism' && <img src={`${ART}/meca-5.png`} alt="Le mécanisme de la montre, remonté" />}
						{line.show === 'postcard' && (
							<div className="at-postcard" role="img" aria-label="Carte postale de Jeanne, mars 1962">
								<p>L’atelier restera ouvert.<br />Le bureau, je le ferme.<br />Ne me demande pas pourquoi.</p>
								<span>J.</span>
								<i>Mars 1962</i>
							</div>
						)}
						{line.show === 'photo' && <div className="at-clue-photo"><img src={`${ART}/photo.jpg`} alt="La photo de 1961 : Henri et Jeanne devant l’atelier" /></div>}
						{line.show === 'label' && (
							<div className="at-label" role="img" aria-label="Étiquette de l’atelier : Réparation J., à finir">
								<b>Atelier J.</b>
								<span>Réparation</span>
								<em>— à finir —</em>
							</div>
						)}
						{line.show === 'dedication' && (
							<div className="at-label at-dedication" role="img" aria-label="Dédicace au crayon : Au capitaine du retour">
								<em>Au capitaine</em>
								<em>du retour</em>
							</div>
						)}
						{line.show === 'box' && (
							<div className="at-box" role="img" aria-label="La boîte à ouvrage de Lucile, en marqueterie, le tiroir bloqué">
								<span className="at-box-lid" />
								<span className="at-box-body"><i /></span>
								<b>Lucile</b>
							</div>
						)}
						{line.show === 'key' && (
							<div className="at-keyletter" role="img" aria-label="Une lettre cachetée pour Lucile et une petite clé étiquetée bureau">
								<span className="at-letter"><b>Pour Lucile</b><i /></span>
								<span className="at-key" aria-hidden="true">🗝️<em>bureau</em></span>
							</div>
						)}
						{line.show === 'office' && <div className="at-office-img" role="img" aria-label="Le bureau de Jeanne, rangé, poussiéreux" />}
						{line.show === 'map' && <div className="at-map"><MapPieces count={3} /></div>}
						{line.show === 'broadcast' && (
							<div className="at-broadcast" role="img" aria-label="Émission Mémoires du port, archive de 1961">
								<b>Mémoires du port</b>
								<span>Archive · été 1961</span>
								<i aria-hidden="true">{Array.from({ length: 24 }, (_, k) => <u key={k} style={{ height: `${20 + ((k * 37) % 70)}%` }} />)}</i>
							</div>
						)}
					</div>
				) : art && (
					<div className={`at-bigwatch ${art.project} ${scene.kind === 'restore' && after ? 'shine' : ''}`}>
						<ObjectArt {...art} />
					</div>
				)}
				{line && (
					<div className={`at-line ${line.who}`} key={i}>
						{line.who !== 'note' && line.who !== 'moi' && <Face who={whoName(line.who)} size={44} />}
						<div>
							{line.who !== 'note' && <strong>{whoName(line.who)}</strong>}
							<p>{line.text}</p>
						</div>
					</div>
				)}
				<div className="at-talk-nav">
					<button className="at-btn ghost small" onClick={onDone}>Passer</button>
					<span className="at-dots">{lines.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
					<button className="at-btn" onClick={next} disabled={scene.kind === 'restore' && !after}>{last ? 'Continuer' : 'Suite'}</button>
				</div>
			</div>
		</div>
	);
}

function pairs(s: State): Set<number> {
	const byPiece = new Map<Piece, number[]>();
	s.board.forEach((p, i) => {
		const inf = parse(p);
		if (inf && inf.level < inf.max) byPiece.set(p!, [...(byPiece.get(p!) ?? []), i]);
	});
	const out = new Set<number>();
	for (const cells of byPiece.values()) if (cells.length >= 2) { out.add(cells[0]); out.add(cells[1]); }
	return out;
}

function coachFor(s: State, orders: Order[], view: View): { text: string; target: 'gen' | 'pair' | 'give' | 'tab' | 'up' | null } | null {
	if (s.tut >= 4) return null;
	if (s.tut === 0) return { text: 'Touche la boîte à outils : elle sort un objet sur l’établi, contre 1 ⚡.', target: 'gen' };
	if (s.tut === 1) {
		return pairs(s).size
			? { text: 'Glisse un objet sur son jumeau : deux objets identiques fusionnent en un objet plus élaboré.', target: 'pair' }
			: { text: 'Touche encore la boîte à outils pour avoir deux objets identiques.', target: 'gen' };
	}
	if (s.tut === 2) {
		const o = orders[0];
		if (o && pickCells(s, o)) return { text: `${o.client} attend : touche « Livrer ».`, target: 'give' };
		return { text: `${o?.client ?? 'Le client'} veut un jeu de tournevis : fusionne deux petits tournevis.`, target: 'pair' };
	}
	return view === 'atelier'
		? { text: 'Dépense tes pièces pour dégager l’établi : les clients pourront entrer.', target: 'up' }
		: { text: 'Passe à l’atelier : il est temps d’y faire un peu de place.', target: 'tab' };
}

const CSS = `
.at-root { --at-wood: #7a4f2a; --at-accent: var(--accent-regular); width: 100%; max-width: 480px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; gap: 10px; position: relative; }
.at-loading { text-align: center; color: var(--gray-300); padding: 3rem 0; }
.at-hud { display: flex; align-items: center; gap: 5px; }
.at-stat { white-space: nowrap; display: inline-flex; align-items: baseline; gap: 4px; background: var(--gray-900); color: var(--gray-0); border: 1.5px solid var(--gray-800); border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; }
.at-stat strong { font-weight: 800; }
.at-stat small { color: var(--gray-300); font-size: 11px; }
.at-stat em { font-style: normal; font-size: 11px; color: var(--gray-300); margin-left: 2px; }
.at-energy, .at-snd { cursor: pointer; }
.at-snd { padding: 5px 8px; }
.at-plus { margin-left: 4px; background: var(--at-accent); color: var(--accent-text-over); border-radius: 50%; width: 16px; height: 16px; font-size: 13px; line-height: 16px; text-align: center; font-weight: 800; align-self: center; }
.at-tabs { margin-left: auto; display: inline-flex; background: var(--gray-900); border-radius: 999px; padding: 3px; border: 1.5px solid var(--gray-800); }
.at-tab { border: 0; background: transparent; color: var(--gray-300); font: inherit; font-weight: 600; font-size: 13px; padding: 5px 10px; border-radius: 999px; cursor: pointer; }
.at-tab.on { background: var(--at-accent); color: var(--accent-text-over); }
.at-coach { background: #fff4d6; color: #4a3212; border: 2px solid #e2b85a; border-radius: 12px; padding: 8px 12px; font-size: 13.5px; line-height: 1.35; animation: at-in 0.3s ease; }
.at-orders { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; }
.at-noorder { grid-column: 1 / -1; text-align: center; color: var(--gray-300); font-size: 13px; margin: 6px 0; }
.at-order { background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 12px; padding: 6px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.at-order.story { border-color: #d9a441; background: linear-gradient(180deg, rgba(217,164,65,0.18), var(--gray-900)); }
.at-order.can { border-color: #4caf6a; }
.at-order-head { display: flex; gap: 6px; align-items: center; min-width: 0; }
.at-order-who { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.at-order-who strong { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.at-order-who span { font-size: 10.5px; color: var(--gray-300); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.at-face { border-radius: 50%; object-fit: cover; flex: none; background: #f3e6cf; border: 1.5px solid #caa56a; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }
.at-needs { display: flex; gap: 4px; justify-content: center; }
.at-need { position: relative; width: 38px; height: 38px; background: rgba(0,0,0,0.12); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.at-need img, .at-need .at-emoji { width: 34px; height: 34px; object-fit: contain; font-size: 22px; line-height: 34px; text-align: center; }
.at-need i { position: absolute; bottom: -3px; left: -3px; font-style: normal; font-size: 10px; font-weight: 800; background: #3b2a14; color: #fff; border-radius: 999px; min-width: 15px; height: 15px; line-height: 15px; text-align: center; }
.at-need b { position: absolute; top: -4px; right: -4px; background: #3f9a5a; color: #fff; border-radius: 50%; width: 16px; height: 16px; font-size: 11px; line-height: 16px; text-align: center; }
.at-give { border: 0; border-radius: 999px; padding: 5px 8px; font: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; background: #3f9a5a; color: #fff; }
.at-give:disabled { background: var(--gray-800); color: var(--gray-300); cursor: default; font-weight: 600; }
.at-boardwrap { width: min(100%, calc((100dvh - 360px) * 7 / 9), 480px); min-width: min(100%, 280px); margin-inline: auto; background: linear-gradient(180deg, #8a5a30, #6b4222); border-radius: 14px; padding: 6px; box-shadow: inset 0 2px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(0,0,0,0.25); }
.at-board { display: grid; grid-template-columns: repeat(var(--cols), 1fr); grid-template-rows: repeat(var(--rows), 1fr); aspect-ratio: 7 / 9; gap: 3px; touch-action: none; user-select: none; -webkit-user-select: none; }
.at-cell { position: relative; background: rgba(255, 236, 200, 0.16); border-radius: 7px; min-width: 0; min-height: 0; }
.at-cell.sel { box-shadow: 0 0 0 2.5px #ffd76a inset; background: rgba(255, 236, 200, 0.3); }
.at-cell.twin { box-shadow: 0 0 0 2px rgba(127, 224, 154, 0.9) inset; background: rgba(127, 224, 154, 0.22); }
.at-cell.over.move { background: rgba(255, 255, 255, 0.3); }
.at-cell.over.merge { background: rgba(120, 220, 140, 0.55); box-shadow: 0 0 0 2.5px #7fe09a inset; }
.at-cell.over.swap { background: rgba(255, 200, 120, 0.4); }
.at-cell.lifted .at-piece { opacity: 0.3; }
.at-piece { position: absolute; inset: 1px; display: flex; align-items: center; justify-content: center; }
.at-piece img { width: 92%; height: 92%; object-fit: contain; pointer-events: none; filter: drop-shadow(0 2px 1px rgba(0,0,0,0.35)); }
.at-piece.gen img { width: 100%; height: 100%; }
.at-emoji { font-size: 26px; line-height: 1; }
.at-piece.spawn { animation: at-spawn 0.32s cubic-bezier(.2,.9,.3,1.2); }
.at-piece.pop { animation: at-pop 0.34s ease; }
@keyframes at-spawn { from { transform: translate(calc(var(--dx) * 100%), calc(var(--dy) * 100%)) scale(0.3); opacity: 0.4; } to { transform: none; opacity: 1; } }
@keyframes at-pop { 0% { transform: scale(0.6); } 55% { transform: scale(1.22); } 100% { transform: scale(1); } }
.at-lvl { position: absolute; left: 1px; bottom: 1px; font-style: normal; font-size: 10px; font-weight: 800; background: rgba(40, 26, 10, 0.82); color: #fff; border-radius: 999px; min-width: 14px; height: 14px; line-height: 14px; text-align: center; padding: 0 3px; }
.at-tag { position: absolute; right: 1px; top: 1px; font-size: 10px; border-radius: 50%; width: 15px; height: 15px; line-height: 15px; text-align: center; color: #fff; }
.at-tag.ready { background: #3f9a5a; }
.at-tag.want { background: #d9822b; }
.at-charge { position: absolute; left: 12%; right: 12%; bottom: 2px; height: 4px; background: rgba(0,0,0,0.45); border-radius: 3px; overflow: hidden; }
.at-charge span { display: block; height: 100%; background: #ffd24a; transition: width 0.3s; }
.at-wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(20, 12, 4, 0.55); color: #fff; font-size: 11px; font-weight: 700; border-radius: 7px; font-variant-numeric: tabular-nums; }
.at-ghost { position: fixed; width: 58px; height: 58px; transform: translate(-50%, -60%) scale(1.1); pointer-events: none; z-index: 60; filter: drop-shadow(0 6px 6px rgba(0,0,0,0.4)); }
.at-ghost img, .at-ghost .at-emoji { width: 100%; height: 100%; object-fit: contain; font-size: 40px; }
.at-info { display: flex; gap: 10px; align-items: center; background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 12px; padding: 8px 10px; min-height: 64px; font-size: 12.5px; }
.at-info.idle { color: var(--gray-300); justify-content: center; text-align: center; line-height: 1.4; }
.at-info > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.at-info strong { font-size: 14px; }
.at-info strong small { font-weight: 500; color: var(--gray-300); font-size: 11px; }
.at-info span { color: var(--gray-300); }
.at-info-img { width: 48px; height: 48px; object-fit: contain; flex: none; font-size: 32px; }
.at-chainrow { display: flex; gap: 2px; margin: 2px 0; }
.at-chainstep { width: 22px; height: 22px; border-radius: 5px; background: rgba(0,0,0,0.12); display: inline-flex; align-items: center; justify-content: center; opacity: 0.45; }
.at-chainstep.past { opacity: 0.75; }
.at-chainstep.cur { opacity: 1; box-shadow: 0 0 0 2px #ffd76a; }
.at-chainstep img, .at-chainstep .at-emoji { width: 20px; height: 20px; object-fit: contain; font-size: 13px; }
.at-btn { border: 0; background: var(--at-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 14px; border-radius: 999px; padding: 8px 18px; cursor: pointer; }
.at-btn:disabled { opacity: 0.45; cursor: default; }
.at-btn.small { font-size: 12.5px; padding: 6px 12px; flex: none; }
.at-btn.ghost { background: transparent; color: var(--gray-200); border: 1.5px solid var(--gray-700); }
.at-btn.warn { background: #c2502e; color: #fff; }
.at-link { border: 0; background: none; color: var(--gray-300); text-decoration: underline; font: inherit; font-size: 12px; cursor: pointer; margin-left: 8px; }
.at-pulse { animation: at-pulse 1.3s ease-in-out infinite; }
@keyframes at-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 210, 74, 0.9); } 50% { box-shadow: 0 0 0 6px rgba(255, 210, 74, 0); } }
.at-cell.at-pulse { box-shadow: 0 0 0 2px #ffd24a inset; animation: at-cellpulse 1.1s ease-in-out infinite; }
@keyframes at-cellpulse { 0%, 100% { background: rgba(255, 210, 74, 0.2); } 50% { background: rgba(255, 210, 74, 0.55); } }
.at-toast { position: fixed; left: 50%; top: max(14px, env(safe-area-inset-top)); transform: translateX(-50%); z-index: 70; background: #2b1d0e; color: #fff4d6; border-radius: 999px; padding: 9px 16px; font-size: 13.5px; box-shadow: var(--shadow-lg); display: flex; gap: 12px; align-items: center; max-width: calc(100vw - 32px); animation: at-in 0.25s ease; }
.at-toast button { border: 0; background: #ffd24a; color: #2b1d0e; font: inherit; font-weight: 700; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
@keyframes at-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
.at-coach { animation-name: at-coachin; }
@keyframes at-coachin { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.at-modal { position: fixed; inset: 0; z-index: 80; background: rgba(20, 12, 4, 0.62); display: flex; align-items: center; justify-content: center; padding: 16px; }
.at-card { background: #fbf3e2; color: #3b2a14; border-radius: 18px; padding: 18px; max-width: 420px; width: 100%; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 10px; max-height: calc(100dvh - 32px); overflow: auto; }
.at-card h3 { margin: 0; font-size: 20px; color: #3b2a14; }
.at-card p { margin: 0; line-height: 1.45; font-size: 14.5px; }
.at-card a { color: #9c4a1f; font-weight: 700; }
.at-card .at-btn.ghost { color: #5a4020; border-color: #caa56a; }
.at-big { font-size: 18px !important; }
.at-small { font-size: 12.5px !important; color: #6b5335; }
.at-pack { display: flex; gap: 10px; align-items: center; justify-content: space-between; background: #fff; border: 1.5px solid #e2c98f; border-radius: 12px; padding: 10px 12px; font-size: 14px; }
.at-kicker { font-size: 12px !important; text-transform: uppercase; letter-spacing: 0.08em; color: #9c6a1f; font-weight: 700; }
.at-talk { gap: 12px; }
.at-intro-img { aspect-ratio: 16 / 10; border-radius: 12px; background: url('${ART}/atelier.jpg') center 30% / cover; filter: sepia(0.6) brightness(0.6) saturate(0.6); box-shadow: inset 0 0 40px rgba(0,0,0,0.6); }
.at-bigwatch { width: min(46vw, 170px); margin: 0 auto; position: relative; }
.at-bigwatch.radio { width: min(72vw, 270px); }
.at-bigwatch.voilier { width: min(58vw, 210px); }
.at-bigwatch.boite { width: min(70vw, 260px); }
.at-keyletter { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 10px 0; }
.at-letter { position: relative; width: 140px; aspect-ratio: 3 / 2; background: #f4ead4; border: 1.5px solid #b58b4a; border-radius: 4px; transform: rotate(-4deg); box-shadow: 0 5px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
.at-letter b { font-family: 'Segoe Script', 'Bradley Hand', cursive; font-weight: 400; color: #3b3a6b; font-size: 16px; }
.at-letter i { position: absolute; right: 12px; bottom: 10px; width: 20px; height: 20px; border-radius: 50%; background: #9c2a1a; box-shadow: inset 0 0 0 3px #b8321a; }
.at-key { display: flex; flex-direction: column; align-items: center; font-size: 42px; transform: rotate(12deg); }
.at-key em { font-size: 11px; font-style: normal; background: #f4ead4; color: #5a3b0c; border: 1px solid #b58b4a; padding: 1px 6px; border-radius: 3px; margin-top: -4px; }
.at-office-img { aspect-ratio: 3 / 4; max-height: 38vh; margin: 0 auto; border-radius: 12px; background: url('${ART}/bureau.jpg') center / cover, linear-gradient(160deg, #6b4a2a, #2a1a0e); box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
.at-office-img.small { width: 76px; max-height: none; flex: none; border-radius: 10px; }
.at-map { width: min(70vw, 260px); margin: 0 auto; }
.at-map.small { width: 150px; margin: 4px 0 0; }
.at-office { display: flex; gap: 12px; align-items: flex-start; background: linear-gradient(180deg, rgba(156, 42, 26, 0.12), var(--gray-900)); border: 1.5px solid #9c6a3a; border-radius: 14px; padding: 10px 12px; }
.at-office-txt { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--gray-300); }
.at-office-txt strong { color: var(--gray-0); font-size: 15px; }
.at-door-open { position: absolute; left: 60%; top: 30%; width: 16%; height: 40%; background: linear-gradient(90deg, rgba(255, 220, 150, 0.45), transparent); mix-blend-mode: screen; pointer-events: none; }
.at-dedication { background: linear-gradient(180deg, #d9a66b, #b47a3e); border-color: #7a4a1c; color: #3b2a14; border-radius: 6px; }
.at-dedication em { color: #3b2a14 !important; font-size: 18px !important; }
.at-box { position: relative; width: 62%; margin: 8px auto 0; aspect-ratio: 5 / 3; }
.at-box-lid { position: absolute; left: 0; right: 0; top: 0; height: 32%; border-radius: 10px 10px 4px 4px; background: repeating-linear-gradient(90deg, #a0602c 0 14px, #c98a4a 14px 28px); border: 2px solid #5a2e0e; }
.at-box-body { position: absolute; left: 3%; right: 3%; top: 30%; bottom: 0; border-radius: 4px 4px 8px 8px; background: linear-gradient(180deg, #b0703a, #7a4418); border: 2px solid #5a2e0e; }
.at-box-body i { position: absolute; left: 30%; right: 30%; top: 40%; height: 26%; border: 2px solid #3a1c06; border-radius: 3px; background: #8a5226; }
.at-box b { position: absolute; left: 0; right: 0; top: 8%; text-align: center; font-family: 'Segoe Script', 'Bradley Hand', cursive; color: #fff4d6; font-size: 15px; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.at-label { width: 70%; margin: 0 auto; background: #f6ecd2; border: 1.5px solid #b58b4a; border-radius: 6px 22px 6px 6px; padding: 12px 16px; transform: rotate(-3deg); box-shadow: 0 5px 12px rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; gap: 2px; font-family: 'Segoe Script', 'Bradley Hand', cursive; color: #3b3a6b; }
.at-label b { font-family: Georgia, serif; color: #6b4a12; letter-spacing: 0.1em; font-size: 13px; }
.at-label em { font-style: normal; font-size: 16px; color: #9c2a1a; }
.at-broadcast { background: #2b1d0e; color: #ffe2a0; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
.at-broadcast b { font-size: 16px; }
.at-broadcast span { font-size: 12px; opacity: 0.75; }
.at-broadcast i { display: flex; align-items: center; gap: 3px; height: 38px; margin-top: 6px; }
.at-broadcast u { flex: 1; background: #ffb13b; border-radius: 2px; animation: at-eq 1.1s ease-in-out infinite alternate; }
.at-broadcast u:nth-child(odd) { animation-delay: -0.5s; }
@keyframes at-eq { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }
.at-bigwatch.shine::after { content: ''; position: absolute; inset: -10%; background: radial-gradient(circle, rgba(255,240,180,0.9), rgba(255,240,180,0) 60%); animation: at-shine 1.2s ease-out forwards; pointer-events: none; }
@keyframes at-shine { from { opacity: 1; transform: scale(0.4); } to { opacity: 0; transform: scale(1.4); } }
.at-clue { width: min(56vw, 210px); margin: 0 auto; animation: at-clue 0.45s ease; }
.at-clue > img { width: 100%; display: block; animation: at-gear 6s ease-in-out infinite; }
.at-postcard { position: relative; aspect-ratio: 3 / 2; background: linear-gradient(135deg, #fbf1dc, #efdcb4); border-radius: 6px; box-shadow: 0 6px 16px rgba(0,0,0,0.3); padding: 19% 10% 8%; transform: rotate(2deg); font-family: 'Segoe Script', 'Bradley Hand', cursive; color: #3b3a6b; }
.at-postcard p { margin: 0; font-size: 14px; line-height: 1.5; }
.at-postcard span { position: absolute; right: 12%; bottom: 10%; font-size: 20px; }
.at-postcard i { position: absolute; right: 6%; top: 5%; font-size: 11px; color: #8a6a3a; border: 1.5px dashed #b58b4a; padding: 4px 6px; transform: rotate(-4deg); font-style: normal; }
.at-clue-photo { background: #f4ead4; padding: 6px 6px 22px; transform: rotate(-2deg); box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
.at-clue-photo img { width: 100%; display: block; }
@keyframes at-clue { from { opacity: 0; transform: scale(0.85) rotate(-4deg); } to { opacity: 1; transform: none; } }
@keyframes at-gear { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
.at-line { display: flex; gap: 10px; align-items: flex-start; animation: at-coachin 0.25s ease; min-height: 64px; }
.at-line strong { font-size: 13px; color: #9c4a1f; }
.at-line.note p { font-style: italic; color: #5a4020; }
.at-line.moi p { color: #2c3f63; }
.at-talk-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.at-dots { display: flex; gap: 4px; }
.at-dots i { width: 6px; height: 6px; border-radius: 50%; background: #d9c39a; }
.at-dots i.on { background: #9c4a1f; }
.at-shop { display: flex; flex-direction: column; gap: 10px; }
.at-scene { position: relative; aspect-ratio: 3 / 4; max-height: 56vh; margin-inline: auto; width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,0.3); background: #2a1c10; }
.at-scene-img { position: absolute; inset: 0; background: url('${ART}/atelier.jpg') center / cover; filter: sepia(calc(var(--dust) * 0.6)) brightness(calc(1 - var(--dust) * 0.45)) saturate(calc(1 - var(--dust) * 0.4)); transition: filter 1.2s; }
.at-scene-dust { position: absolute; inset: 0; opacity: var(--dust); transition: opacity 1.2s; background:
	radial-gradient(circle at 0 0, rgba(210,200,180,0.55), transparent 28%),
	radial-gradient(circle at 100% 0, rgba(210,200,180,0.5), transparent 26%),
	linear-gradient(180deg, rgba(40,30,20,0.25), rgba(40,30,20,0.45)); pointer-events: none; }
.at-scene.lit .at-scene-img { filter: sepia(calc(var(--dust) * 0.6)) brightness(calc(1.08 - var(--dust) * 0.4)) saturate(calc(1.05 - var(--dust) * 0.4)); }
.at-lamp { position: absolute; left: 76%; top: 66%; width: 70%; aspect-ratio: 1; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(255, 214, 120, 0.6), rgba(255, 190, 90, 0.18) 38%, transparent 62%); mix-blend-mode: screen; pointer-events: none; animation: at-flicker 5s ease-in-out infinite; }
@keyframes at-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.88; } }
.at-sheet { position: absolute; left: 34%; width: 62%; top: 75%; height: 19%; opacity: 0.93; filter: drop-shadow(0 5px 6px rgba(0,0,0,0.45)); }
.at-photo { position: absolute; left: 40%; top: 34%; width: 22%; transform: rotate(-3deg); background: #f4ead4; padding: 3px 3px 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); animation: at-hang 0.8s ease; }
.at-photo img { width: 100%; display: block; }
@keyframes at-hang { from { transform: rotate(-12deg) translateY(-12px); opacity: 0; } to { transform: rotate(-3deg); opacity: 1; } }
.at-onbench.radio { width: 16% !important; top: 75% !important; }
.at-onbench.voilier { width: 13% !important; top: 72% !important; }
.at-onbench.boite { width: 15% !important; top: 76% !important; }
.at-onbench { position: absolute; left: 58%; top: 77%; width: 8%; transform: translate(-50%, -50%) rotate(-12deg); filter: drop-shadow(0 3px 3px rgba(0,0,0,0.5)); }
.at-project { display: flex; gap: 12px; align-items: center; background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 14px; padding: 10px 12px; }
.at-project-watch { width: 54px; flex: none; }
.at-project-watch.radio { width: 84px; }
.at-project-watch.voilier { width: 64px; }
.at-project-watch.boite { width: 84px; }
.at-warn { color: #d9822b !important; font-weight: 600; }
.at-shelves { position: absolute; left: 52%; top: 6%; width: 48%; height: 62%; background: radial-gradient(ellipse at 60% 40%, rgba(255, 214, 140, 0.35), transparent 65%); mix-blend-mode: screen; pointer-events: none; }
.at-project-txt { display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: var(--gray-300); min-width: 0; flex: 1; }
.at-project-txt strong { color: var(--gray-0); font-size: 15px; }
.at-project-btns { display: flex; gap: 6px; margin-top: 4px; }
.at-ups { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.at-up { display: flex; align-items: center; gap: 10px; background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 12px; padding: 8px 12px; }
.at-up > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.at-up strong { font-size: 14px; }
.at-up span { font-size: 12px; color: var(--gray-300); }
.at-up.locked { opacity: 0.55; }
.at-up.owned { opacity: 0.8; }
.at-done { color: #3f9a5a; font-weight: 800; font-size: 18px; }
.at-tier { text-align: center; font-size: 13px; color: var(--gray-200); margin: 0; }
.at-foot { text-align: center; font-size: 12px; color: var(--gray-300); margin: 0; }
@media (max-width: 400px) {
	.at-stat { padding: 4px 8px; font-size: 13px; }
	.at-tab { padding: 5px 8px; font-size: 12.5px; }
}
@media (max-width: 370px) {
	.at-order-who span { display: none; }
	.at-stat em { display: none; }
}
@media (prefers-reduced-motion: reduce) {
	.at-pulse, .at-cell.at-pulse, .at-lamp, .at-piece.spawn, .at-piece.pop, .at-clue, .at-clue > img, .at-broadcast u { animation: none; }
}
`;
