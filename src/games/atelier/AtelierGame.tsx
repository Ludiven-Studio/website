import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	load, save, newGame, tick, produce, move, moveKind, deliver, sell, sellValue, buyUpgrade, upgradeState,
	addEnergy, markSeen, dueTier, nextTier, claimTier, activeOrders, pickCells, parse, genOf, pieceName, energyIn, chargeIn, isFull,
	stepOf, storyOrder, storyBlocker, factKnown, currentProject, projectOf, missingGens, mapReady, solveMap, code, unitCost, CELLS, type State, type Piece,
} from './engine';
import {
	CHAINS, GENERATORS, UPGRADES, ORDERS, PROJECTS, RECAPS, COLS, ROWS, ENERGY_MAX, ENERGY_PACK,
	INTRO, EPILOGUE, SPEAKERS, FACES, FACE_EMOJI, REP_TIERS,
	type Line, type Order, type GenId, type ProjectId, type PuzzleId,
} from './data';
import { GearsPuzzle, LongueVuePuzzle, TaquinPuzzle, PeseePuzzle, PUZZLE_CSS } from './Puzzles';
import { Gesture, GESTURES, GESTURE_CSS } from './Gestures';
import Watch, { WatchBack, WATCH_CSS } from './Watch';
import Radio, { RADIO_CSS } from './Radio';
import Voilier, { VOILIER_CSS } from './Voilier';
import Boite, { MapPieces, BOITE_CSS } from './Boite';
import Fauteuil, { FAUTEUIL_CSS } from './Fauteuil';
import Malle, { MapPuzzle, MALLE_CSS } from './Malle';
import Musique, { MUSIQUE_CSS } from './Musique';
import { Boussole, Fanal, LongueVue, CoffreMousse, Canot, Cloche, SAISON2_CSS } from './Saison2';
import { CadreOvale, Travailleuse, Tabouret, CoffretBobines, CarnetRose, Valise, SAISON3_CSS } from './Saison3';
import { ValiseEtal, Presentoir, Balance, Caissette, Casier, Toupie, SAISON4_CSS } from './Saison4';
import { CHARACTERS, ERAS, FAMILIES, type Character } from './characters';
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
const FALLBACK: Record<string, string> = { outil: '🪛', soin: '🧽', meca: '⚙️', elec: '💡', bois: '🪵', tissu: '🧵', marin: '🪢', boite: '🧰', tiroir: '🗄️', caisse: '🔌', coffre: '🪚', malle: '🧺', greeur: '⚓' };

type View = 'atelier' | 'etabli';
interface Art { project: ProjectId; state: number }
type Scene =
	| { kind: 'talk'; id: string; lines: Line[]; art?: Art; title?: string }
	| { kind: 'restore'; id: string; project: ProjectId; title: string; from: number; to: number; lines: Line[]; reward?: Order['reward']; puzzle?: PuzzleId };
/** An upgrade just bought: the workshop shows the change before any scene or client steps in. */
interface Reveal { id: string; k: number; after: Scene[] }
const REVEAL_MS = 4500;
// Where each upgrade shows in the workshop picture, in % of the frame.
const REVEAL_AT: Record<string, [number, number]> = {
	etabli: [62, 82], lampe: [76, 62], photo: [51, 42], etageres: [76, 34], bureau: [68, 50],
};

/** The restored object of a project, drawn at a restoration state. */
function ObjectArt({ project, state }: Art) {
	if (project === 'radio') return <Radio state={state} size="100%" />;
	if (project === 'voilier') return <Voilier state={state} size="100%" />;
	if (project === 'boite') return <Boite state={state} size="100%" />;
	if (project === 'fauteuil') return <Fauteuil state={state} size="100%" />;
	if (project === 'malle') return <Malle state={state} size="100%" />;
	if (project === 'musique') return <Musique state={state} size="100%" />;
	if (project === 'boussole') return <Boussole state={state} size="100%" />;
	if (project === 'fanal') return <Fanal state={state} size="100%" />;
	if (project === 'longuevue') return <LongueVue state={state} size="100%" />;
	if (project === 'coffre') return <CoffreMousse state={state} size="100%" />;
	if (project === 'mouette') return <Canot state={state} size="100%" />;
	if (project === 'cloche') return <Cloche state={state} size="100%" />;
	if (project === 'cadre') return <CadreOvale state={state} size="100%" />;
	if (project === 'travailleuse') return <Travailleuse state={state} size="100%" />;
	if (project === 'tabouret') return <Tabouret state={state} size="100%" />;
	if (project === 'bobines') return <CoffretBobines state={state} size="100%" />;
	if (project === 'carnet') return <CarnetRose state={state} size="100%" />;
	if (project === 'valise') return <Valise state={state} size="100%" />;
	if (project === 'etal') return <ValiseEtal state={state} size="100%" />;
	if (project === 'presentoir') return <Presentoir state={state} size="100%" />;
	if (project === 'balance') return <Balance state={state} size="100%" />;
	if (project === 'caissette') return <Caissette state={state} size="100%" />;
	if (project === 'casier') return <Casier state={state} size="100%" />;
	if (project === 'toupie') return <Toupie state={state} size="100%" />;
	return <Watch state={state} size="100%" />;
}

interface Drag { from: number; x: number; y: number; over: number }
interface Anim { k: number; type: 'spawn' | 'pop'; dx?: number; dy?: number; isNew?: boolean }
/** One flying reward or confetti bit, in viewport pixels. */
interface Fx { k: number; kind: 'coin' | 'energy' | 'star' | 'confetti'; x: number; y: number; dx: number; dy: number; delay: number; color?: string; rot?: number }
const FOUND_KEY = 'ludiven-atelier-found';
const CONFETTI = ['#ff3d9a', '#a24dff', '#1fd6a6', '#ffc23a', '#4fb3ff'];
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
	const [puzzle, setPuzzle] = useState(false);
	const [orderSel, setOrderSel] = useState<string | null>(null);
	const [reveal, setReveal] = useState<Reveal | null>(null);
	const revealRef = useRef<Reveal | null>(null);
	const [fx, setFx] = useState<Fx[]>([]);
	const [bump, setBump] = useState(0);
	// While a delivered story step celebrates, the restoration scene (and any new client) waits.
	const [party, setParty] = useState(false);
	const coinRef = useRef<HTMLSpanElement>(null);
	const energyRef = useRef<HTMLButtonElement>(null);
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
		if (!s || scenes.length || reveal || party) return;
		const st = storyOrder(s);
		if (st && st.step === 1 && !s.seen.includes(`arrival:${st.project}`)) {
			const p = projectOf(st.project!);
			const recap = RECAPS[p.id];
			const lines: Line[] = recap ? [{ who: 'note', text: `Précédemment : ${recap}` }, ...p.arrival] : p.arrival;
			setScenes([{ kind: 'talk', id: `arrival:${p.id}`, lines, art: { project: p.id, state: 0 }, title: `Chapitre ${p.chapter} · ${p.title}` }]);
			return;
		}
		const t = dueTier(s);
		if (!t) return;
		setS(claimTier(s, t.id));
		setScenes([{ kind: 'talk', id: t.id, lines: t.lines, title: t.title }]);
		trackEvent('atelier:rep_tier', { id: t.id });
	}, [s, scenes.length, reveal, party]);

	const finishReveal = useCallback(() => {
		const r = revealRef.current;
		if (!r) return;
		revealRef.current = null;
		setReveal(null);
		if (r.after.length) setScenes((x) => [...x, ...r.after]);
	}, []);
	useEffect(() => {
		if (!reveal) return;
		const id = setTimeout(finishReveal, REVEAL_MS);
		return () => clearTimeout(id);
	}, [reveal, finishReveal]);

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

	// ---------- reward effects ----------
	const centre = (el: Element | null | undefined) => {
		const r = el?.getBoundingClientRect();
		return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
	};
	const cellEl = (cell: number) => boardRef.current?.children[cell] ?? null;
	/** Rewards fly from `from` to their counter, a few at a time; the counter bumps as they land. */
	const fly = (from: Element | null | undefined, gains: { coins?: number; energy?: number; rep?: number }) => {
		const a = centre(from);
		if (!a) return;
		const out: Fx[] = [];
		const add = (kind: Fx['kind'], to: Element | null, n: number) => {
			const b = centre(to) ?? { x: a.x, y: a.y - 120 };
			for (let i = 0; i < n; i++) {
				animK.current++;
				out.push({ k: animK.current, kind, x: a.x + (i % 3 - 1) * 10, y: a.y, dx: b.x - a.x, dy: b.y - a.y, delay: i * 0.08 });
			}
		};
		if (gains.coins) add('coin', coinRef.current, Math.min(8, Math.max(2, Math.round(gains.coins / 3))));
		if (gains.energy) add('energy', energyRef.current, Math.min(5, Math.max(2, Math.round(gains.energy / 4))));
		if (gains.rep) add('star', coinRef.current?.parentElement ?? null, Math.min(4, gains.rep));
		if (!out.length) return;
		setFx((f) => [...f, ...out]);
		const last = 900 + out.length * 80;
		setTimeout(() => setBump((b) => b + 1), 800);
		setTimeout(() => setFx((f) => f.filter((x) => !out.includes(x))), last + 200);
	};
	const confetti = (from: Element | null | undefined) => {
		const a = centre(from);
		if (!a) return;
		const out: Fx[] = Array.from({ length: 36 }, (_, i) => {
			animK.current++;
			const ang = (i / 36) * Math.PI * 2, sp = 90 + ((i * 37) % 70);
			return { k: animK.current, kind: 'confetti' as const, x: a.x, y: a.y, dx: Math.cos(ang) * sp, dy: Math.sin(ang) * sp + 120, delay: (i % 6) * 0.02, color: CONFETTI[i % CONFETTI.length], rot: (i * 47) % 360 + 180 };
		});
		setFx((f) => [...f, ...out]);
		setTimeout(() => setFx((f) => f.filter((x) => !out.includes(x))), 1500);
	};
	// Items already met: a merge into anything else shows "Nouveau !". Seeded from the bench on first run.
	const found = useRef<Set<string> | null>(null);
	const firstTime = (p: string): boolean => {
		if (!found.current) {
			let saved: string[] | null = null;
			try { saved = JSON.parse(localStorage.getItem(FOUND_KEY) ?? 'null'); } catch { /* storage blocked */ }
			found.current = new Set(saved ?? (sRef.current?.board.filter((x): x is string => !!x) ?? []));
		}
		if (found.current.has(p)) return false;
		found.current.add(p);
		try { localStorage.setItem(FOUND_KEY, JSON.stringify([...found.current])); } catch { /* storage full or blocked */ }
		return true;
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
			animate(to, { type: 'pop', isNew: firstTime(r.s.board[to]!) });
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
		const card = document.querySelector(`[data-order="${o.id}"]`);
		fly(card, { coins: o.reward.coins, energy: o.reward.energy, rep: o.reward.rep });
		setS(r.s);
		setSel(null);
		sfx.deliver();
		trackEvent('atelier:order_completed', { order: o.id.startsWith('q') ? 'local' : o.id });
		if (s.tut === 2) trackEvent('atelier:tutorial_step', { step: 3 });
		// Keyed by order: a second tab holding a stale copy of the same order cannot pay it twice.
		if (o.reward.cocoins) earnOnce(`atelier:${o.id}`, o.reward.cocoins);
		if (o.kind === 'story' && o.scene && o.project && o.step) {
			trackEvent('atelier:restoration_step', { project: o.project, step: o.step });
			const next: Scene[] = [{ kind: 'restore', id: o.id, project: o.project, title: o.scene.title, from: o.step - 1, to: o.step, lines: o.scene.lines, reward: o.reward, puzzle: o.scene.puzzle }];
			// A story step is a little party first: confetti and rewards flying, then the restoration scene.
			confetti(card);
			setParty(true);
			setTimeout(() => { setScenes((q) => [...q, ...next]); setParty(false); }, 1100);
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
		fly(cellEl(cell), { coins: sellValue(p) });
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
		finishReveal();
		const r = { id, k: Date.now(), after: q };
		revealRef.current = r;
		setReveal(r);
		sfx.restore();
	};

	const buyEnergy = () => {
		if (!s) return;
		if (!spend(ENERGY_PACK.price)) return;
		setS(addEnergy(s, ENERGY_PACK.energy));
		trackEvent('atelier:energy_bought', { project: currentProject(s).id });
		setEnergyOpen(false);
		flash(`+${ENERGY_PACK.energy} énergie`);
	};

	/** `quit`: "Passer" during a chapter replay leaves the whole replay, not just the current scene. */
	const closeScene = (quit = false) => {
		const sc = scenes[0];
		if (!sc) return;
		const replay = sc.id.startsWith('replay:');
		setScenes((q) => (replay && quit ? q.filter((x) => !x.id.startsWith('replay:')) : q.slice(1)));
		// A replay leaves the save alone.
		if (replay) return;
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
		revealRef.current = null;
		setReveal(null);
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
	const blocker = s ? storyBlocker(s) : null;
	const helpOrder = orders.find((o) => o.id === orderSel) ?? null;

	if (!s) return <div className="at-root"><style>{CSS}</style><p className="at-loading">Ouverture de l’atelier…</p></div>;

	const coach = coachFor(s, orders, view);
	const pairCells = coach?.target === 'pair' ? pairs(s) : new Set<number>();
	const selPiece = sel !== null ? s.board[sel] : null;
	const twinOf = selPiece && parse(selPiece) && parse(selPiece)!.level < parse(selPiece)!.max ? selPiece : null;
	const scene = scenes[0] ?? null;
	const chapterDone = s.seen.includes('chapter');

	return (
		<div className="at-root">
			<style>{CSS}{WATCH_CSS}{RADIO_CSS}{VOILIER_CSS}{BOITE_CSS}{FAUTEUIL_CSS}{MALLE_CSS}{MUSIQUE_CSS}{SAISON2_CSS}{SAISON3_CSS}{SAISON4_CSS}{PUZZLE_CSS}{GESTURE_CSS}{FUN_CSS}</style>

			<div className="at-hud">
				<button ref={energyRef} className="at-stat at-energy" onClick={() => setEnergyOpen(true)} aria-label="Énergie">
					<span aria-hidden="true">⚡</span>
					<strong key={`e${bump}`} className={bump ? 'at-bumpnum' : ''}>{s.energy}</strong>
					{s.energy < ENERGY_MAX ? <em>{fmt(energyIn(s, now))}</em> : <small>/{ENERGY_MAX}</small>}
					<span className="at-plus" aria-hidden="true">+</span>
				</button>
				<span ref={coinRef} className="at-stat at-coins" title="Pièces"><span aria-hidden="true">🪙</span><strong key={`c${bump}`} className={bump ? 'at-bumpnum' : ''}>{s.coins}</strong><Delta value={s.coins} /></span>
				<button className="at-stat at-snd" onClick={() => { sfx.setEnabled(!sound); setSound(!sound); }} aria-label={sound ? 'Couper le son' : 'Activer le son'} title={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
				<div className="at-tabs" role="tablist">
					<button role="tab" aria-selected={view === 'atelier'} className={`at-tab ${view === 'atelier' ? 'on' : ''} ${coach?.target === 'tab' ? 'at-pulse' : ''}`} onClick={() => setView('atelier')}>Atelier</button>
					<button role="tab" aria-selected={view === 'etabli'} className={`at-tab ${view === 'etabli' ? 'on' : ''}`} onClick={() => setView('etabli')}>Établi</button>
				</div>
			</div>

			{coach && <div className="at-coach" key={coach.text}>{coach.text}</div>}

			{view === 'etabli' ? (
				<>
					{blocker && (
						<div className="at-next">
							<span>
								{blocker.kind === 'map'
									? 'Les quatre morceaux de carte sont réunis. La suite se joue dans le bureau de Jeanne.'
									: `Pour continuer l’histoire : « ${UPGRADES.find((u) => u.id === blocker.id)!.name} », dans l’atelier (${UPGRADES.find((u) => u.id === blocker.id)!.cost} 🪙).`}
							</span>
							<button className="at-btn small at-pulse" onClick={() => { setView('atelier'); if (blocker.kind === 'map') setPuzzle(true); }}>
								{blocker.kind === 'map' ? 'Assembler la carte →' : 'Aller à l’atelier →'}
							</button>
						</div>
					)}
					<div className="at-orders">
						{orders.length === 0 && !blocker && <p className="at-noorder">Personne au comptoir pour l’instant.</p>}
						{orders.map((o) => {
							const cells = pickCells(s, o);
							const can = cells !== null;
							return (
								<div
									key={o.id}
									data-order={o.id}
									className={`at-order ${o.kind === 'story' ? 'story' : ''} ${can ? 'can' : ''} ${orderSel === o.id ? 'open' : ''}`}
									role="button"
									tabIndex={0}
									aria-expanded={orderSel === o.id}
									aria-label={`${o.client} : voir comment obtenir chaque objet`}
									onClick={() => setOrderSel((v) => (v === o.id ? null : o.id))}
									onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOrderSel((v) => (v === o.id ? null : o.id)); } }}
								>
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
									<button className={`at-give ${coach?.target === 'give' && can ? 'at-pulse' : ''}`} disabled={!can} onClick={(e) => { e.stopPropagation(); doDeliver(o); }}>
										{can ? 'Livrer' : `${o.reward.coins} 🪙`}
									</button>
								</div>
							);
						})}
					</div>

					{helpOrder && <OrderHelp s={s} o={helpOrder} onClose={() => setOrderSel(null)} />}

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
												{a?.type === 'pop' && (
													<span className="at-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ['--a' as string]: `${k * 45}deg` }} />)}</span>
												)}
												{a?.type === 'pop' && a.isNew && <b className="at-newtag">Nouveau !</b>}
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
					reveal={reveal}
					onRevealDone={finishReveal}
					onBench={() => setView('etabli')}
					onPuzzle={() => setPuzzle(true)}
					awaited={blocker?.kind === 'upgrade' ? blocker.id : null}
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
					onReplayChapter={(id) => {
						// The chapter as played: arrival, then each restoration with its puzzle or gesture. No reward, no state.
						const p = projectOf(id);
						const recap = RECAPS[p.id];
						const q: Scene[] = [{
							kind: 'talk', id: `replay:arrival:${p.id}`, art: { project: p.id, state: 0 }, title: `Chapitre ${p.chapter} · ${p.title}`,
							lines: recap ? [{ who: 'note', text: `Précédemment : ${recap}` }, ...p.arrival] : p.arrival,
						}];
						for (const o of ORDERS.filter((x) => x.kind === 'story' && x.project === p.id).sort((a, b) => a.step! - b.step!)) {
							q.push({ kind: 'restore', id: `replay:${o.id}`, project: p.id, title: o.scene!.title, from: o.step! - 1, to: o.step!, lines: o.scene!.lines, puzzle: o.scene!.puzzle });
						}
						trackEvent('atelier:chapter_replay', { project: p.id });
						setScenes((x) => [...x, ...q]);
					}}
				/>
			)}

			{drag && s.board[drag.from] && (
				<div className="at-ghost" style={{ left: drag.x, top: drag.y }}>
					<PieceImg piece={s.board[drag.from]!} />
				</div>
			)}

			{fx.length > 0 && (
				<div className="at-fx" aria-hidden="true">
					{fx.map((f) => (
						<span
							key={f.k}
							className={`at-fly ${f.kind}`}
							style={{ left: f.x, top: f.y, ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px`, ['--d' as string]: `${f.delay}s`, ['--c' as string]: f.color, ['--r' as string]: `${f.rot ?? 0}deg` }}
						>
							<i>{f.kind === 'coin' ? '🪙' : f.kind === 'energy' ? '⚡' : f.kind === 'star' ? '⭐' : ''}</i>
						</span>
					))}
				</div>
			)}

			{toast && (
				<div className="at-toast" key={toast.k} role="status">
					<span>{toast.text}</span>
					{toast.undo && <button onClick={() => { setS(toast.undo!); setToast(null); }}>Annuler</button>}
				</div>
			)}

			{/* Keyed: a replay chains restoration scenes, and a puzzle must not carry its state into the next one. */}
			{scene && <SceneView key={scene.id} scene={scene} onDone={() => closeScene()} onSkip={() => closeScene(true)} />}

			{puzzle && !scene && (
				<div className="at-modal" role="dialog" aria-modal="true">
					<MapPuzzle
						onClose={() => setPuzzle(false)}
						onSolve={() => {
							setPuzzle(false);
							setS(solveMap(s));
							sfx.restore();
							trackEvent('atelier:map_solved', {});
						}}
					/>
				</div>
			)}

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

/** Floats the last change of a counter above it: "+15", "−8". */
function Delta({ value }: { value: number }) {
	const prev = useRef(value);
	const [d, setD] = useState<{ k: number; n: number } | null>(null);
	useEffect(() => {
		const n = value - prev.current;
		prev.current = value;
		if (n) setD({ k: Date.now(), n });
	}, [value]);
	if (!d) return null;
	return <span className={`at-delta ${d.n > 0 ? 'up' : 'down'}`} key={d.k} aria-hidden="true">{d.n > 0 ? `+${d.n}` : `−${-d.n}`}</span>;
}

/** Reward chips: what an order or an upgrade brought. */
function Gains({ coins, rep, energy, cocoins }: { coins?: number; rep?: number; energy?: number; cocoins?: number }) {
	return (
		<div className="at-gains">
			{!!coins && <span>{coins > 0 ? `+${coins}` : `−${-coins}`} 🪙</span>}
			{!!rep && <span>+{rep} ⭐ réputation</span>}
			{!!energy && <span>+{energy} ⚡</span>}
			{!!cocoins && <span>+{cocoins} <Cocoin size="1em" /></span>}
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

/** French spacing: glue « » : ; ! ? to their word so a line never starts with them. */
const NBSP = String.fromCharCode(0xa0);
const frTypo = (t: string) => t.replace(/« /g, '«' + NBSP).replace(/ ([»:;!?])/g, NBSP + '$1');

/** Faces met so far; tapping one opens what the story has told about them. */
function Trombi({ s }: { s: State }) {
	const [open, setOpen] = useState<Character | null>(null);
	const [tab, setTab] = useState<'eras' | 'families'>('eras');
	const met = CHARACTERS.filter((c) => factKnown(s, c.facts[0]));
	if (!met.length) return null;
	const known = open ? open.facts.filter((f) => factKnown(s, f)) : [];
	const left = open ? open.facts.length - known.length : 0;
	// A family shows once two of its people are known to be related.
	const families = FAMILIES.map((f) => ({ ...f, rows: f.rows.map((r) => ({ ...r, kin: r.kin.filter((k) => !k.gate || factKnown(s, k.gate)) })).filter((r) => r.kin.length) }))
		.filter((f) => f.rows.length >= 2);
	const card = (c: Character) => (
		<button key={c.id} className="at-trombi-face" onClick={() => setOpen(c)} aria-label={`${c.name} : ce qu’on sait`}>
			<Face who={c.face} size={52} />
			<span>{frTypo(c.name)}</span>
		</button>
	);
	return (
		<section className="at-trombi" aria-label="Trombinoscope">
			<div className="at-trombi-top">
				<strong>Trombinoscope</strong>
				{families.length > 0 && (
					<div className="at-trombi-tabs" role="tablist">
						<button role="tab" aria-selected={tab === 'eras'} className={tab === 'eras' ? 'on' : ''} onClick={() => setTab('eras')}>Par époque</button>
						<button role="tab" aria-selected={tab === 'families'} className={tab === 'families' ? 'on' : ''} onClick={() => setTab('families')}>Familles</button>
					</div>
				)}
			</div>
			{tab === 'eras' || !families.length ? ERAS.map((e) => {
				const people = met.filter((c) => c.era === e.id);
				return people.length ? (
					<div key={e.id} className="at-trombi-era">
						<em>{e.title}</em>
						<div className="at-trombi-grid">{people.map(card)}</div>
					</div>
				) : null;
			}) : (
				<div className="at-tree">
					{families.map((f) => (
						<div key={f.title} className="at-tree-family">
							<em>{f.title}</em>
							{f.rows.map((r, i) => (
								<div key={i} className="at-tree-row">
									{i > 0 && <span className={`at-tree-link ${r.gap ? 'gap' : ''}`} aria-hidden="true">{r.gap ? '⋮' : '│'}</span>}
									<div className="at-tree-kin">
										{r.kin.map((k) => (
											<span key={k.name} className="at-tree-person">
												{/^\p{Extended_Pictographic}/u.test(k.face)
													? <span className="at-face at-face-emoji" style={{ width: 40, height: 40 }} aria-hidden="true">{k.face}</span>
													: <Face who={k.face} size={40} />}
												<span>{frTypo(k.name)}</span>
											</span>
										))}
									</div>
								</div>
							))}
						</div>
					))}
					<p className="at-small">⋮ : plusieurs générations entre les deux.</p>
				</div>
			)}
			{open && (
				<div className="at-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
					<div className="at-card at-trombi-card" role="dialog" aria-modal="true" aria-label={open.name}>
						<div className="at-trombi-head">
							<Face who={open.face} size={84} />
							<h3>{open.name}</h3>
						</div>
						<ul>{known.map((f, k) => <li key={k}>{frTypo(f.text)}</li>)}</ul>
						{left > 0 && <p className="at-small">Encore {left} chose{left > 1 ? 's' : ''} à découvrir au fil de l’histoire.</p>}
						<button className="at-btn ghost" onClick={() => setOpen(null)}>Fermer</button>
					</div>
				</div>
			)}
		</section>
	);
}

/** Tapping an order: for each item, where it comes from and how far the bench is from it. */
function OrderHelp({ s, o, onClose }: { s: State; o: Order; onClose: () => void }) {
	return (
		<div className="at-help" role="region" aria-label={`Comment obtenir la commande de ${o.client}`}>
			<div className="at-help-head">
				<strong>{o.client} · {o.kind === 'story' ? o.ask : 'commande'}</strong>
				<button className="at-link" onClick={onClose}>Fermer</button>
			</div>
			{o.needs.map((p, k) => {
				const i = parse(p)!;
				const chain = CHAINS[i.chain];
				const gen = GENERATORS[chain.gen];
				const locked = gen.unlock && !s.upgrades.includes(gen.unlock) ? UPGRADES.find((u) => u.id === gen.unlock) : null;
				// Level-1 draws already on the bench toward this item: same chain, not above it.
				const have = s.board.reduce((a, q) => {
					const j = parse(q);
					return j && j.chain === i.chain && j.level <= i.level ? a + unitCost(q!) : a;
				}, 0);
				const want = unitCost(p);
				return (
					<div className="at-help-row" key={k}>
						<PieceImg piece={p} className="at-help-img" />
						<div>
							<b>{i.name}</b> <small>niv. {i.level}</small>
							<span>
								Sort de : <PieceImg piece={`g:${chain.gen}`} className="at-help-gen" /> {gen.name}
								{locked && <em> (à débloquer : « {locked.name} »)</em>}
							</span>
							<span className="at-chainrow">
								{chain.items.slice(0, i.level).map((_, n) => (
									<span key={n} className={`at-chainstep ${n + 1 === i.level ? 'cur' : 'past'}`}>
										<PieceImg piece={code(i.chain, n + 1)} />
									</span>
								))}
							</span>
							<span>
								{i.level === 1 ? 'Directement.' : `Fusionne 2 par 2, soit ${want} × « ${chain.items[0]} ».`}
								{' '}Sur l’établi : {Math.min(have, want)}/{want}.
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

const SEASONS = [
	{ title: 'Saison 1 · Les Pirates du retour', from: 1, to: 7 },
	{ title: 'Saison 2 · Le capitaine du retour', from: 8, to: 13 },
	{ title: 'Saison 3 · Le prochain départ', from: 14, to: 19 },
	{ title: 'Saison 4 · À bientôt', from: 20, to: 25 },
];

/** Finished chapters, to play again with their puzzles and gestures; the save is left as it is. */
function Chapters({ s, onReplay, onMap }: { s: State; onReplay: (id: ProjectId) => void; onMap: () => void }) {
	const [open, setOpen] = useState(false);
	const done = PROJECTS.filter((p) => stepOf(s, p.id) >= p.steps);
	if (!done.length) return null;
	return (
		<details className="at-chapters" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
			<summary><strong>Carnet des chapitres</strong><span>Rejouer un chapitre terminé, énigmes et gestes compris. Votre partie n’est pas touchée.</span></summary>
			{SEASONS.map((season) => {
				const list = done.filter((p) => p.chapter >= season.from && p.chapter <= season.to);
				return list.length ? (
					<div key={season.title} className="at-chapters-season">
						<em>{season.title}</em>
						{list.map((p) => (
							<div key={p.id} className="at-chapters-row">
								<span className={`at-chapters-art ${p.id}`}><ObjectArt project={p.id} state={p.steps} /></span>
								<span className="at-chapters-name">{p.chapter}. {p.title}</span>
								{p.chapter === 6 && s.seen.includes('map-solved') && <button className="at-btn small ghost" onClick={onMap}>La carte</button>}
								<button className="at-btn small" onClick={() => onReplay(p.id)}>Rejouer</button>
							</div>
						))}
					</div>
				) : null;
			})}
		</details>
	);
}

function Workshop({ s, story, chapterDone, coachUp, onUpgrade, reveal, onRevealDone, onBench, onPuzzle, awaited, confirmReset, onReset, onReplay, onReplayChapter }: {
	s: State; story: Order | null; chapterDone: boolean; coachUp: boolean; awaited: string | null; reveal: Reveal | null; onRevealDone: () => void;
	onUpgrade: (id: string) => void; onBench: () => void; onPuzzle: () => void; confirmReset: boolean; onReset: () => void; onReplay: () => void;
	onReplayChapter: (id: ProjectId) => void;
}) {
	const sceneRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (reveal) sceneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [reveal]);
	const has = (u: string) => s.upgrades.includes(u);
	const fresh = (u: string) => (reveal?.id === u ? 'fresh' : '');
	const shown = reveal ? UPGRADES.find((u) => u.id === reveal.id) ?? null : null;
	const newGen = shown ? Object.values(GENERATORS).find((g) => g.unlock === shown.id) ?? null : null;
	const at = (shown && REVEAL_AT[shown.id]) ?? [50, 58];
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
			<div ref={sceneRef} className={`at-scene ${has('lampe') ? 'lit' : ''}`} style={{ ['--dust' as string]: 1 - progress }}>
				<div className="at-scene-img" />
				{/* The same room restored: a third of it from the start (player found it too gloomy), the rest with the story. */}
				<div className="at-scene-img restored" style={{ opacity: 0.3 + 0.7 * progress ** 0.6 }} />
				<div className="at-scene-dust" />
				{(!has('etabli') || reveal?.id === 'etabli') && (
					<svg className={`at-sheet ${has('etabli') ? 'off' : ''}`}viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Établi sous une bâche">
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
				{has('lampe') && <div className={`at-lamp ${fresh('lampe')}`} />}
				{has('etageres') && <div className={`at-shelves ${fresh('etageres')}`} aria-label="Les étagères de Jeanne, rouvertes" />}
				{has('bureau') && <div className={`at-door-open ${fresh('bureau')}`} aria-label="La porte du bureau, ouverte" />}
				{has('photo') && <div className="at-photo" aria-label="La photo de 1961"><img src={`${ART}/photo.jpg`} alt="" /></div>}
				{started && step < project.steps && story && !reveal && (
					<div className={`at-onbench ${project.id}`}><ObjectArt project={project.id} state={step} /></div>
				)}
				{reveal && shown && (
					<button className="at-reveal" key={reveal.k} onClick={onRevealDone} aria-label={`${shown.name} : continuer`} style={{ ['--x' as string]: `${at[0]}%`, ['--y' as string]: `${at[1]}%` }}>
						<span className="at-puff" style={{ left: `${at[0]}%`, top: `${at[1]}%` }} aria-hidden="true">
							{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ['--a' as string]: `${k * 45}deg` }} />)}
						</span>
						<span className="at-reveal-card" role="status">
							<strong>✨ {shown.name}</strong>
							<span>{shown.desc}</span>
							{newGen && (
								<span className="at-reveal-gen">
									<PieceImg piece={`g:${newGen.id}`} /> Nouveau sur l’établi : {newGen.name}
								</span>
							)}
							<Gains coins={-shown.cost} rep={shown.rep} />
							<small>Toucher pour continuer</small>
						</span>
					</button>
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
										: project.id === 'musique' ? 'Rendue aux Chen. Fin de la saison 1.' : project.id === 'cloche' ? 'Rendue au port. Fin de la saison 2.' : project.id === 'valise' ? 'Mme Garnier est partie voir Lucile. Fin de la saison 3.' : project.id === 'toupie' ? 'Fin de L’Atelier des Souvenirs. L’atelier reste ouvert.' : 'Restauré et rendu.'}
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

			<Trombi s={s} />

			<Chapters s={s} onReplay={onReplayChapter} onMap={onPuzzle} />

			{has('bureau') && s.seen.includes('map-solved') ? (
				// Solved: a souvenir now, folded to one line, the map shown whole.
				<details className="at-office done">
					<summary><div className="at-office-img small" /><span><strong>Le bureau de Jeanne</strong>La carte de Rose, assemblée.</span></summary>
					<div className="at-office-txt">
						<div className="at-map small"><MapPieces count={4} joined /></div>
						<span>Le carnet de Rose « la Pie », 1813. Retournée, la carte désignait l’atelier lui-même.</span>
					</div>
				</details>
			) : has('bureau') && (
				<section className="at-office" aria-label="Le bureau de Jeanne">
					<div className="at-office-img small" />
					<div className="at-office-txt">
						<strong>Le bureau de Jeanne</strong>
						<span>
							{stepOf(s, 'fauteuil') >= 2
								? 'Le carnet de Rose « la Pie », 1813. Les quatre morceaux de carte sont réunis ; Lucile écrit : « rien n’est jamais là où on le croit ».'
								: 'Le carnet de Rose « la Pie », 1813. Une carte marine, un îlot entouré de rouge. Une fiche : « Chercher la pie. »'}
						</span>
						<div className="at-map small"><MapPieces count={stepOf(s, 'fauteuil') >= 2 ? 4 : 3} /></div>
						{mapReady(s) && <button className="at-btn small at-pulse" onClick={onPuzzle}>Assembler la carte</button>}
					</div>
				</section>
			)}

			<ul className="at-ups">
				{UPGRADES.map((u) => {
					const st = upgradeState(s, u.id);
					return (
						<li key={u.id} className={`at-up ${st} ${awaited === u.id ? 'awaited' : ''}`}>
							<div>
								<strong>{u.name}</strong>
								<span>{st === 'locked' ? 'Se débloque plus tard dans l’histoire.' : u.desc}</span>
							</div>
							{st === 'owned' ? (
								<span className="at-done">✓</span>
							) : (
								<button className={`at-btn small ${(coachUp && u.id === 'etabli') || (awaited === u.id && st === 'ok') ? 'at-pulse' : ''}`} disabled={st !== 'ok'} onClick={() => onUpgrade(u.id)}>
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

function SceneView({ scene, onDone, onSkip }: { scene: Scene; onDone: () => void; onSkip: () => void }) {
	const [i, setI] = useState(0);
	const [after, setAfter] = useState(scene.kind !== 'restore');
	// A puzzle step: the restoration is the player's own gesture, so it replaces the timed reveal.
	const [puzzle, setPuzzle] = useState(scene.kind === 'restore' && !!scene.puzzle);
	useEffect(() => {
		setI(0);
		setAfter(scene.kind !== 'restore');
		const hasPuzzle = scene.kind === 'restore' && !!scene.puzzle;
		setPuzzle(hasPuzzle);
		if (scene.kind !== 'restore' || hasPuzzle) return;
		const id = setTimeout(() => { setAfter(true); sfx.restore(); }, 900);
		return () => clearTimeout(id);
	}, [scene]);
	if (puzzle && scene.kind === 'restore') {
		const solve = (skipped: boolean) => {
			trackEvent(skipped ? 'atelier:puzzle_skipped' : 'atelier:puzzle_solved', { puzzle: scene.puzzle!, replay: scene.id.startsWith('replay:') });
			setPuzzle(false);
			setAfter(true);
		};
		return (
			<div className="at-modal at-scene-modal" role="dialog" aria-modal="true">
				<div className="at-card at-talk">
					<p className="at-kicker">{GESTURES.has(scene.puzzle!) ? 'Geste' : 'Énigme'} · {projectOf(scene.project).object}</p>
					<h3>{scene.title}</h3>
					{scene.puzzle === 'gears' && <GearsPuzzle onSolve={() => solve(false)} />}
					{scene.puzzle === 'longuevue' && <LongueVuePuzzle onSolve={() => solve(false)} />}
					{scene.puzzle === 'taquin' && <TaquinPuzzle onSolve={() => solve(false)} />}
					{scene.puzzle === 'pesee' && <PeseePuzzle onSolve={() => solve(false)} />}
					{GESTURES.has(scene.puzzle!) && <Gesture id={scene.puzzle!} onSolve={() => solve(false)} />}
					<button className="at-link" onClick={() => solve(true)}>{GESTURES.has(scene.puzzle!) ? 'Passer' : 'Passer l’énigme'}</button>
				</div>
			</div>
		);
	}
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
						{line.show === 'piece4' && <div className="at-map"><MapPieces count={4} only={3} /></div>}
						{line.show === 'yvesnote' && (
							<div className="at-label at-dedication" role="img" aria-label="Mot d’Yves : Pour le capitaine du retour, le jour du bassin">
								<em>Pour le capitaine du retour,</em>
								<em>le jour du bassin. Y.</em>
							</div>
						)}
						{line.show === 'carnet' && (
							<div className="at-carnet" role="img" aria-label="Carnet de bord du mousse de Rose, 1813">
								<b>S. K. — 1813</b>
								<span>Le second au levant, moi au couchant. Chacun rend ce qu’il porte.</span>
								<span>La cloche reste. Là où l’île regarde le port.</span>
							</div>
						)}
						{line.show === 'jtag' && (
							<div className="at-label" role="img" aria-label="Étiquette jaunie : Réparation J.">
								<b>Atelier J.</b>
								<span>Réparation</span>
								<em>— J. —</em>
							</div>
						)}
						{line.show === 'open' && (
							<div className="at-open" role="img" aria-label="Le panneau de l’atelier, retourné sur Ouvert">
								<span>Ouvert</span>
							</div>
						)}
						{line.show === 'ticket' && (
							<div className="at-ticket" role="img" aria-label="Billet de train d’avril 1962, jamais composté">
								<b>Chemins de fer</b>
								<span>Avril 1962 · aller simple</span>
								<em>non composté</em>
							</div>
						)}
						{line.show === 'receipt' && (
							<div className="at-label at-receipt" role="img" aria-label="Reçu de 1813 : trois cents francs, Étienne Roussel, charpentier">
								<b>1813</b>
								<span>Reçu de la Pie la somme de trois cents francs.</span>
								<em>Étienne Roussel, charpentier</em>
							</div>
						)}
						{line.show === 'tag' && (
							<div className="at-label" role="img" aria-label="Étiquette de Rose : Famille Chen, 1812">
								<b>Rendre à</b>
								<span>Famille Chen</span>
								<em>1812</em>
							</div>
						)}
						{line.show === 'lucile' && (
							<div className="at-letter at-lucile" role="img" aria-label="Une enveloppe d’une écriture tremblée, signée Lucile">
								<b>À l’atelier de Jeanne</b><i />
							</div>
						)}
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
				{scene.kind === 'restore' && scene.reward && after && last && <Gains {...scene.reward} />}
				{line && (
					<div className={`at-line ${line.who}`} key={i}>
						{line.who !== 'note' && line.who !== 'moi' && <Face who={whoName(line.who)} size={44} />}
						<div>
							{line.who !== 'note' && <strong>{whoName(line.who)}</strong>}
							<p>{frTypo(line.text)}</p>
						</div>
					</div>
				)}
				<div className="at-talk-nav">
					<button className="at-btn ghost small" onClick={onSkip}>{scene.id.startsWith('replay:') ? 'Quitter' : 'Passer'}</button>
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

// Bright, flashy skin over the base styles (player feedback: "too dull, too serious", wants "flashy girly").
// One palette, used everywhere: pink = act, pink→violet = the bench, mint = ready/done, gold = story and rewards,
// plum = text. The site's gray scale is redefined inside the game only, so every panel turns light whatever the
// site theme; the story art keeps its own tones.
const FUN_CSS = `
.at-root {
	--fun-pink: #ff3d9a; --fun-pink-dark: #d3177a; --fun-pink-soft: #ffc7e3; --fun-pink-pale: #fff3f9;
	--fun-violet: #a24dff; --fun-violet-dark: #7428d6;
	--fun-mint: #1fd6a6; --fun-mint-dark: #0e9f79;
	--fun-gold: #ffc23a; --fun-gold-dark: #e0960a;
	--fun-plum: #4a1f45; --fun-plum-soft: #8e5b88;
	--gray-0: var(--fun-plum); --gray-100: #5a2a54; --gray-200: #6e3d68; --gray-300: var(--fun-plum-soft); --gray-700: #f0c2dc;
	--gray-800: #ffe3f1; --gray-900: #ffffff; --at-accent: var(--fun-pink); --accent-text-over: #fff;
	--fun-shadow: 0 3px 0 rgba(211, 23, 122, 0.16);
	/* Older names, kept so the rules below read the same. */
	--fun-orange-dark: var(--fun-pink-dark); --fun-green: var(--fun-mint); --fun-green-dark: var(--fun-mint-dark);
	--fun-teal: var(--fun-violet); --fun-teal-dark: var(--fun-violet-dark);
}
.at-root .at-stat, .at-root .at-tabs, .at-root .at-order, .at-root .at-info, .at-root .at-project, .at-root .at-up,
.at-root .at-trombi, .at-root .at-chapters, .at-root .at-help { border-color: transparent; box-shadow: var(--fun-shadow); }
.at-root .at-stat, .at-root .at-tab, .at-root .at-btn, .at-root .at-give, .at-root .at-order-who strong { font-family: var(--font-brand); }
.at-root .at-stat strong { font-size: 15px; }
.at-root .at-tab.on { box-shadow: 0 2px 0 var(--fun-orange-dark); }
.at-root .at-btn { box-shadow: 0 3px 0 var(--fun-orange-dark); text-shadow: 0 1px 0 rgba(0,0,0,0.15); }
.at-root .at-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--fun-orange-dark); }
.at-root .at-btn.ghost { background: #fff; box-shadow: 0 2px 0 rgba(140, 100, 40, 0.18); text-shadow: none; }
.at-root .at-order { border-radius: 16px; padding: 7px; }
.at-root .at-order.story { border: 2px solid var(--fun-gold); background: linear-gradient(180deg, #fff1c8, #fff 70%); }
.at-root .at-order.can { box-shadow: 0 0 0 2.5px var(--fun-mint), var(--fun-shadow); }
.at-root .at-need { background: var(--fun-pink-pale); border-radius: 10px; }
.at-root .at-need i { background: var(--fun-violet-dark); }
.at-root .at-need b, .at-root .at-tag.ready { background: var(--fun-mint-dark); }
.at-root .at-give { background: linear-gradient(180deg, #4ff0c2, var(--fun-mint)); box-shadow: 0 3px 0 var(--fun-mint-dark); color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,0.2); font-size: 13px; padding: 6px 8px; }
.at-root .at-give:disabled { background: #fff1c8; color: #a8700a; box-shadow: 0 2px 0 #f2d58a; text-shadow: none; }
.at-root .at-boardwrap { background: linear-gradient(150deg, #ff6fb5, var(--fun-violet)); border-radius: 20px; padding: 8px; box-shadow: 0 4px 0 var(--fun-violet-dark), 0 10px 22px rgba(162, 77, 255, 0.3); }
.at-root .at-cell { background: #fff9fc; border-radius: 8px; }
.at-root .at-cell:nth-child(even) { background: #ffe4f2; }
.at-root .at-cell.sel { background: #fff2c4; box-shadow: 0 0 0 3px var(--fun-gold) inset; }
.at-root .at-cell.twin { background: #d2fbef; box-shadow: 0 0 0 2.5px var(--fun-mint) inset; }
.at-root .at-cell.over.merge { background: #b5f5e2; box-shadow: 0 0 0 3px var(--fun-mint) inset; }
.at-root .at-cell.over.move { background: #f3e6ff; }
.at-root .at-piece img { filter: drop-shadow(0 3px 2px rgba(116, 40, 214, 0.22)); }
.at-root .at-lvl { background: var(--fun-violet-dark); }
.at-root .at-tag.want { background: var(--fun-pink); }
.at-root .at-charge { background: rgba(116, 40, 214, 0.2); }
.at-root .at-charge span { background: var(--fun-gold); }
.at-root .at-coach, .at-root .at-next { background: var(--fun-pink-pale); color: var(--fun-plum); border: 2px solid var(--fun-pink-soft); border-radius: 14px; box-shadow: var(--fun-shadow); }
/* Dialogs and story scenes: the same pinks, plum text. */
.at-root .at-modal { background: rgba(74, 31, 69, 0.55); }
.at-root .at-card { background: linear-gradient(180deg, #fff, var(--fun-pink-pale)); color: var(--fun-plum); border: 2px solid var(--fun-pink-soft); }
.at-root .at-card h3 { color: var(--fun-plum); }
.at-root .at-card a { color: var(--fun-pink-dark); }
.at-root .at-card .at-btn.ghost { color: var(--fun-plum); border-color: var(--fun-pink-soft); }
.at-root .at-kicker { color: var(--fun-pink-dark); }
.at-root .at-line strong { color: var(--fun-pink-dark); }
.at-root .at-line.note p { color: var(--fun-plum-soft); }
.at-root .at-line.moi p { color: var(--fun-violet-dark); }
.at-root .at-dots i { background: var(--fun-pink-soft); }
.at-root .at-dots i.on { background: var(--fun-pink); }
.at-root .at-face { border-color: var(--fun-pink-soft); background: var(--fun-pink-pale); }
/* At the bottom: on top it hid the very counters the rewards fly to. */
.at-root .at-toast { background: var(--fun-plum); top: auto; bottom: calc(env(safe-area-inset-bottom) + 20px); animation-name: at-in-up; }
@keyframes at-in-up { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
.at-root .at-toast button { background: var(--fun-gold); }
.at-root .at-trombi-era > em, .at-root .at-tree-family > em, .at-root .at-chapters-season > em { color: var(--fun-violet); }
.at-root .at-tree-family { border-left-color: var(--fun-pink-soft); }
.at-root .at-tree-link { color: var(--fun-pink); }
.at-root .at-up.owned .at-done, .at-root .at-done { color: var(--fun-mint-dark); }
/* Rewards: they fly to their counter on an arc (x eases in, y eases out), the counter bumps as they land. */
.at-fx { position: fixed; inset: 0; pointer-events: none; z-index: 95; overflow: hidden; }
.at-fly { position: absolute; width: 0; height: 0; animation: at-flyx 0.85s cubic-bezier(.55,0,.9,.5) var(--d) both; }
.at-fly > i { position: absolute; left: -13px; top: -13px; font-style: normal; font-size: 24px; line-height: 26px; filter: drop-shadow(0 2px 2px rgba(74, 31, 69, 0.35)); animation: at-flyy 0.85s cubic-bezier(.15,.75,.35,1) var(--d) both; }
@keyframes at-flyx { from { transform: translateX(0); } to { transform: translateX(var(--dx)); } }
@keyframes at-flyy { 0% { transform: translateY(0) scale(0.4); opacity: 0; } 12% { transform: translateY(-34px) scale(1.25); opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(var(--dy)) scale(0.7); opacity: 0.3; } }
.at-fly.confetti { animation: at-conf 1.3s cubic-bezier(.2,.7,.5,1) var(--d) both; }
.at-fly.confetti > i { left: -4px; top: -6px; width: 8px; height: 12px; border-radius: 2px; background: var(--c); animation: none; filter: none; }
@keyframes at-conf { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 70% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(var(--r)); opacity: 0; } }
.at-root .at-bumpnum { display: inline-block; animation: at-bumpnum 0.45s cubic-bezier(.3,1.6,.5,1); }
@keyframes at-bumpnum { 0% { transform: scale(1); } 40% { transform: scale(1.45); color: var(--fun-pink); } 100% { transform: scale(1); } }
/* Merge: a ring of sparks, and "Nouveau !" the first time an item is made. */
.at-burst { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
.at-burst i { position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--fun-gold); box-shadow: 0 0 6px var(--fun-pink); animation: at-spark2 0.55s ease-out both; }
.at-burst i:nth-child(even) { background: var(--fun-pink); box-shadow: 0 0 6px var(--fun-gold); }
@keyframes at-spark2 { from { transform: rotate(var(--a)) translateX(4px) scale(1); opacity: 1; } to { transform: rotate(var(--a)) translateX(30px) scale(0.2); opacity: 0; } }
.at-newtag { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); z-index: 3; white-space: nowrap; font-family: var(--font-brand); font-size: 11px; font-weight: 800; color: #fff; background: linear-gradient(180deg, #ff6fb5, var(--fun-pink)); border-radius: 999px; padding: 2px 8px; box-shadow: 0 2px 0 var(--fun-pink-dark); pointer-events: none; animation: at-newtag 1.8s ease both; }
@keyframes at-newtag { 0% { transform: translate(-50%, 6px) scale(0.5); opacity: 0; } 15% { transform: translate(-50%, -6px) scale(1.15); opacity: 1; } 75% { transform: translate(-50%, -10px) scale(1); opacity: 1; } 100% { transform: translate(-50%, -22px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .at-fly, .at-fly > i, .at-burst i, .at-root .at-bumpnum { animation-duration: 0.01s !important; } }
.at-root .atx-track { stroke: var(--fun-pink-soft); }
.at-root .atx-handle { fill: var(--fun-pink); stroke: var(--fun-pink-dark); }
.at-root .atx-handle.ok { fill: var(--fun-mint); stroke: var(--fun-mint-dark); }
.at-root .atx-progress { fill: var(--fun-pink); }
.at-root .at-link { color: var(--fun-pink-dark); }
/* The workshop starts a lot less gloomy: dust is a hint now, not a veil. */
.at-root .at-scene-img:not(.restored) { filter: sepia(calc(var(--dust) * 0.3)) brightness(calc(1 - var(--dust) * 0.15)) saturate(calc(1.1 - var(--dust) * 0.25)); }
.at-root .at-scene-dust { opacity: calc(var(--dust) * 0.4); }
.at-root .at-scene { border-radius: 20px; box-shadow: 0 4px 0 var(--fun-violet-dark), 0 10px 22px rgba(162, 77, 255, 0.25); }
.at-root .at-trombi-tabs { background: var(--fun-pink-pale); }
.at-root .at-trombi-tabs button.on { background: var(--fun-pink); }
`;

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
.at-order { cursor: pointer; }
.at-order.open { box-shadow: 0 0 0 2.5px #ffd76a; }
.at-next { display: flex; gap: 10px; align-items: center; justify-content: space-between; background: #fff4d6; color: #4a3212; border: 2px solid #e2b85a; border-radius: 12px; padding: 8px 10px 8px 12px; font-size: 13px; line-height: 1.35; }
.at-next .at-btn { flex: none; }
.at-up.awaited { border-color: #e2b85a; box-shadow: 0 0 0 2px rgba(226, 184, 90, 0.5); }
.at-help { background: var(--gray-900); border: 1.5px solid #e2b85a; border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; color: var(--gray-300); animation: at-coachin 0.2s ease; }
.at-help-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.at-help-head strong { color: var(--gray-0); font-size: 13.5px; }
.at-help-row { display: flex; gap: 10px; align-items: flex-start; }
.at-help-row > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.at-help-row b { color: var(--gray-0); }
.at-help-row em { color: #d9822b; font-style: normal; font-weight: 600; }
.at-help-img { width: 40px; height: 40px; object-fit: contain; flex: none; font-size: 26px; }
.at-help-gen { width: 18px; height: 18px; object-fit: contain; vertical-align: -4px; font-size: 13px; }
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
.at-board { display: grid; grid-template-columns: repeat(var(--cols), 1fr); grid-template-rows: repeat(var(--rows), 1fr); aspect-ratio: 7 / 9; gap: 3px; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
/* Only a finger on a piece is a drag; on an empty cell it scrolls the page (the board fills a phone). */
.at-board .at-piece { touch-action: none; }
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
.at-bigwatch.fauteuil { width: min(58vw, 210px); }
.at-bigwatch.malle { width: min(70vw, 260px); }
.at-bigwatch.musique { width: min(70vw, 260px); }
.at-bigwatch.boussole, .at-bigwatch.fanal, .at-bigwatch.cloche { width: min(52vw, 190px); }
.at-bigwatch.longuevue, .at-bigwatch.coffre, .at-bigwatch.mouette { width: min(74vw, 280px); }
.at-bigwatch.cadre, .at-bigwatch.tabouret, .at-bigwatch.carnet { width: min(50vw, 180px); }
.at-bigwatch.travailleuse, .at-bigwatch.bobines, .at-bigwatch.valise { width: min(64vw, 230px); }
.at-bigwatch.etal, .at-bigwatch.presentoir, .at-bigwatch.balance { width: min(66vw, 240px); }
.at-bigwatch.caissette, .at-bigwatch.casier, .at-bigwatch.toupie { width: min(52vw, 190px); }
.at-open { width: min(56vw, 200px); margin: 8px auto; position: relative; background: #3f7a4a; border: 4px solid #6b3a14; border-radius: 10px; padding: 14px 0; text-align: center; box-shadow: 0 8px 18px rgba(0,0,0,0.35); animation: at-flip 0.8s ease both; }
.at-open::before { content: ''; position: absolute; left: 50%; top: -30px; width: 2px; height: 28px; background: #6b3a14; }
.at-open span { font-family: Georgia, serif; font-size: 26px; font-weight: 700; color: #fff4d6; letter-spacing: 0.06em; }
@keyframes at-flip { from { transform: rotateY(180deg); } to { transform: rotateY(0); } }
.at-receipt { width: 100%; transform: rotate(-2deg); }
.at-ticket { width: min(70vw, 240px); margin: 0 auto; background: #e9dfc2; border: 1.5px dashed #8a6a3a; border-radius: 6px; padding: 10px 14px; display: flex; flex-direction: column; gap: 3px; color: #3b2a14; font-family: Georgia, serif; transform: rotate(2deg); box-shadow: 0 6px 14px rgba(0,0,0,0.3); }
.at-ticket b { letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; color: #6b4a12; }
.at-ticket em { color: #9c2a1a; font-weight: 700; font-style: normal; text-transform: uppercase; font-size: 11px; border: 1.5px solid #9c2a1a; align-self: flex-end; padding: 1px 6px; transform: rotate(-6deg); }
.at-carnet { width: min(78vw, 280px); margin: 0 auto; background: #efe2c4; border: 1.5px solid #b58b4a; border-radius: 4px 10px 10px 4px; box-shadow: inset 8px 0 0 #8a5f16, 0 6px 14px rgba(0,0,0,0.3); padding: 12px 14px 12px 22px; display: flex; flex-direction: column; gap: 6px; font-family: 'Segoe Script', 'Bradley Hand', cursive; color: #3b2a14; font-size: 13px; transform: rotate(-1.5deg); }
.at-carnet b { font-family: Georgia, serif; color: #6b4a12; }
.at-lucile { margin: 8px auto; width: 190px; transform: rotate(3deg); }
.at-lucile b { font-size: 14px; }
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
.at-trombi { background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.at-chapters { background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 14px; padding: 10px 12px; }
.at-chapters summary { display: flex; flex-direction: column; gap: 2px; cursor: pointer; list-style: none; }
.at-chapters summary::-webkit-details-marker { display: none; }
.at-chapters summary strong { font-size: 15px; color: var(--gray-0); }
.at-chapters summary strong::after { content: ' ▾'; color: var(--gray-300); font-size: 12px; }
.at-chapters[open] summary strong::after { content: ' ▴'; }
.at-chapters summary span { font-size: 12px; color: var(--gray-300); }
.at-chapters-season { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.at-chapters-season > em { font-size: 12px; font-weight: 700; font-style: normal; color: #c98a4a; text-transform: uppercase; letter-spacing: 0.04em; }
.at-chapters-row { display: flex; align-items: center; gap: 8px; }
.at-chapters-art { width: 34px; flex: none; display: flex; justify-content: center; }
.at-chapters-name { flex: 1; min-width: 0; font-size: 13px; color: var(--gray-200); }
.at-trombi-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.at-trombi-top > strong { font-size: 15px; color: var(--gray-0); }
.at-trombi-tabs { display: flex; gap: 2px; background: var(--gray-800); border-radius: 999px; padding: 2px; }
.at-trombi-tabs button { border: 0; background: none; font: inherit; font-size: 12px; font-weight: 700; color: var(--gray-300); padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.at-trombi-tabs button.on { background: #9c4a1f; color: #fff4d6; }
.at-trombi-era > em, .at-tree-family > em { display: block; font-size: 12px; font-weight: 700; font-style: normal; color: #c98a4a; text-transform: uppercase; letter-spacing: 0.04em; margin: 2px 0 4px; }
.at-tree { display: flex; flex-direction: column; gap: 12px; }
.at-tree-family { border-left: 3px solid #c98a4a55; padding-left: 10px; }
.at-tree-row { display: flex; flex-direction: column; align-items: flex-start; }
.at-tree-link { margin-left: 18px; color: #c98a4a; line-height: 1; font-size: 16px; }
.at-tree-link.gap { letter-spacing: 0; }
.at-tree-kin { display: flex; gap: 14px; flex-wrap: wrap; }
.at-tree-person { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--gray-200); }
.at-trombi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); gap: 8px; }
.at-trombi-face { border: 0; background: none; padding: 4px 2px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; border-radius: 10px; font: inherit; color: var(--gray-200); }
.at-trombi-face:hover, .at-trombi-face:focus-visible { background: var(--gray-800); }
.at-trombi-face span { font-size: 11px; font-weight: 600; text-align: center; line-height: 1.2; }
.at-trombi-card ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.4; }
.at-trombi-head { display: flex; align-items: center; gap: 14px; }
.at-office { display: flex; gap: 12px; align-items: flex-start; background: linear-gradient(180deg, rgba(156, 42, 26, 0.12), var(--gray-900)); border: 1.5px solid #9c6a3a; border-radius: 14px; padding: 10px 12px; }
.at-office.done { display: block; padding: 8px 12px; }
.at-office.done summary { display: flex; align-items: center; gap: 12px; cursor: pointer; list-style: none; font-size: 12.5px; color: var(--gray-300); }
.at-office.done summary::-webkit-details-marker { display: none; }
.at-office.done summary::after { content: '▾'; margin-left: auto; color: var(--gray-300); transition: transform 0.2s; }
.at-office.done[open] summary::after { transform: rotate(180deg); }
.at-office.done summary span { display: flex; flex-direction: column; }
.at-office.done summary strong { color: var(--gray-0); font-size: 15px; }
.at-office.done .at-office-img.small { width: 40px; }
.at-office.done .at-office-txt { margin-top: 10px; align-items: center; text-align: center; }
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
.at-scene .at-scene-img.restored { background-image: url('${ART}/atelier-restaure.jpg'); filter: none; transition: opacity 1.2s; }
.at-scene.lit .at-scene-img:not(.restored) { filter: sepia(calc(var(--dust) * 0.6)) brightness(calc(1.08 - var(--dust) * 0.4)) saturate(calc(1.05 - var(--dust) * 0.4)); }
.at-lamp { position: absolute; left: 76%; top: 66%; width: 70%; aspect-ratio: 1; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(255, 214, 120, 0.6), rgba(255, 190, 90, 0.18) 38%, transparent 62%); mix-blend-mode: screen; pointer-events: none; animation: at-flicker 5s ease-in-out infinite; }
@keyframes at-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.88; } }
.at-sheet { position: absolute; left: 34%; width: 62%; top: 75%; height: 19%; opacity: 0.93; filter: drop-shadow(0 5px 6px rgba(0,0,0,0.45)); }
.at-photo { position: absolute; left: 40%; top: 34%; width: 22%; transform: rotate(-3deg); background: #f4ead4; padding: 3px 3px 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); animation: at-hang 0.8s ease; }
.at-photo img { width: 100%; display: block; }
.at-sheet.off { animation: at-sheetoff 1.1s cubic-bezier(.5,0,.8,.4) 0.3s forwards; transform-origin: 80% 100%; }
@keyframes at-sheetoff { 0% { transform: none; } 25% { transform: translateY(-6%) rotate(-2deg); } 100% { transform: translate(30%, -160%) rotate(14deg); opacity: 0; } }
.at-lamp.fresh { animation: at-lampon 1.8s ease-out, at-flicker 5s ease-in-out 1.8s infinite; }
@keyframes at-lampon { 0% { opacity: 0; } 15% { opacity: 0.9; } 25% { opacity: 0.1; } 40% { opacity: 1; } 55% { opacity: 0.5; } 100% { opacity: 1; } }
.at-shelves.fresh, .at-door-open.fresh { animation: at-glowin 1.6s ease-out; }
@keyframes at-glowin { 0% { opacity: 0; } 50% { opacity: 1; filter: brightness(1.8); } 100% { opacity: 1; } }
.at-reveal { position: absolute; inset: 0; border: 0; padding: 0; margin: 0; background: transparent; cursor: pointer; font: inherit; color: inherit; }
.at-reveal::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at var(--x) var(--y), rgba(255, 226, 160, 0.55), transparent 60%); mix-blend-mode: screen; animation: at-warm 2.4s ease-out 0.3s both; pointer-events: none; }
@keyframes at-warm { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
.at-puff { position: absolute; width: 0; height: 0; }
.at-puff::before { content: ''; position: absolute; left: -60px; top: -60px; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, rgba(255, 236, 190, 0.9), rgba(255, 220, 150, 0.3) 45%, transparent 70%); animation: at-puff 1.3s ease-out 0.35s both; }
@keyframes at-puff { from { transform: scale(0.2); opacity: 1; } to { transform: scale(2.2); opacity: 0; } }
.at-puff i { position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; border-radius: 50%; background: #ffe7a8; box-shadow: 0 0 8px #ffd24a; animation: at-spark 1.1s ease-out 0.4s both; }
@keyframes at-spark { 0% { transform: rotate(var(--a)) translateX(0) scale(1); opacity: 0; } 10% { opacity: 1; } 100% { transform: rotate(var(--a)) translateX(70px) scale(0.2); opacity: 0; } }
.at-reveal-card small { font-size: 11px; color: #c9b48a; margin-top: 2px; }
.at-reveal-card { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); width: min(92%, 340px); display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; background: rgba(43, 29, 14, 0.92); color: #fff4d6; border: 1.5px solid #ffd24a; border-radius: 14px; padding: 10px 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.45); animation: at-cardup 0.5s ease 1.3s both; }
.at-reveal-card strong { font-size: 16px; }
.at-reveal-card > span { font-size: 13px; color: #f1dfb6; }
@keyframes at-cardup { from { opacity: 0; transform: translate(-50%, -14px); } to { opacity: 1; transform: translate(-50%, 0); } }
.at-reveal-gen { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #ffd24a !important; }
.at-reveal-gen img, .at-reveal-gen .at-emoji { width: 28px; height: 28px; object-fit: contain; }
.at-gains { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 2px 0; }
.at-gains > span { display: inline-flex; align-items: center; gap: 3px; background: #ffd24a; color: #2b1d0e; font-weight: 800; font-size: 13px; border-radius: 999px; padding: 3px 10px; animation: at-pop 0.45s ease both; }
.at-gains > span:nth-child(2) { animation-delay: 0.12s; }
.at-gains > span:nth-child(3) { animation-delay: 0.24s; }
.at-gains > span:nth-child(4) { animation-delay: 0.36s; }
.at-reveal-card .at-gains > span { animation-delay: 1.6s; }
.at-reveal-card .at-gains > span:nth-child(2) { animation-delay: 1.72s; }
.at-coins { position: relative; }
.at-delta { position: absolute; right: 6px; top: -4px; font-size: 13px; font-weight: 800; pointer-events: none; animation: at-delta 1.4s ease-out forwards; }
.at-delta.up { color: #5ccf7a; }
.at-delta.down { color: #ff8a5c; }
@keyframes at-delta { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-18px); } }
@keyframes at-hang { from { transform: rotate(-12deg) translateY(-12px); opacity: 0; } to { transform: rotate(-3deg); opacity: 1; } }
.at-onbench.radio { width: 16% !important; top: 75% !important; }
.at-onbench.voilier { width: 13% !important; top: 72% !important; }
.at-onbench.boite { width: 15% !important; top: 76% !important; }
.at-onbench.fauteuil { width: 13% !important; top: 72% !important; }
.at-onbench.malle { width: 16% !important; top: 78% !important; }
.at-onbench.musique { width: 15% !important; top: 76% !important; }
.at-onbench.boussole, .at-onbench.fanal, .at-onbench.cloche { width: 10% !important; top: 74% !important; }
.at-onbench.longuevue, .at-onbench.coffre, .at-onbench.mouette { width: 18% !important; top: 77% !important; }
.at-onbench.cadre, .at-onbench.tabouret, .at-onbench.carnet { width: 10% !important; top: 74% !important; }
.at-onbench.travailleuse, .at-onbench.bobines, .at-onbench.valise { width: 14% !important; top: 76% !important; }
.at-onbench.etal, .at-onbench.presentoir, .at-onbench.balance { width: 15% !important; top: 76% !important; }
.at-onbench.caissette, .at-onbench.casier, .at-onbench.toupie { width: 10% !important; top: 74% !important; }
.at-onbench { position: absolute; left: 58%; top: 77%; width: 8%; transform: translate(-50%, -50%) rotate(-12deg); filter: drop-shadow(0 3px 3px rgba(0,0,0,0.5)); }
.at-project { display: flex; gap: 12px; align-items: center; background: var(--gray-900); border: 1.5px solid var(--gray-800); border-radius: 14px; padding: 10px 12px; }
.at-project-watch { width: 54px; flex: none; }
.at-project-watch.radio { width: 84px; }
.at-project-watch.voilier { width: 64px; }
.at-project-watch.boite { width: 84px; }
.at-project-watch.fauteuil { width: 64px; }
.at-project-watch.malle { width: 84px; }
.at-project-watch.musique { width: 84px; }
.at-project-watch.boussole, .at-project-watch.fanal, .at-project-watch.cloche { width: 60px; }
.at-project-watch.longuevue, .at-project-watch.coffre, .at-project-watch.mouette { width: 90px; }
.at-project-watch.cadre, .at-project-watch.tabouret, .at-project-watch.carnet { width: 56px; }
.at-project-watch.travailleuse, .at-project-watch.bobines, .at-project-watch.valise { width: 76px; }
.at-project-watch.etal, .at-project-watch.presentoir, .at-project-watch.balance { width: 80px; }
.at-project-watch.caissette, .at-project-watch.casier, .at-project-watch.toupie { width: 58px; }
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
	.at-pulse, .at-cell.at-pulse, .at-lamp, .at-piece.spawn, .at-piece.pop, .at-clue, .at-clue > img, .at-broadcast u, .at-open, .at-puff::before, .at-puff i, .at-gains > span, .at-reveal-card, .at-reveal::before { animation: none; }
	.at-sheet.off { display: none; }
}
`;
