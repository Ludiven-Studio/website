import { useState, useEffect, useRef, useCallback } from 'react';
import { ELEMENTS, BASE_IDS, TOTAL, SECRET_TOTAL, combine, getElement, dailyTarget, dailyPalette, type Element } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { encodePacked, formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   ALCHIMIE — React island. Libre : combine ~150 éléments depuis 5 bases (glisser une carte sur
   une autre, ou le creuset à 3 emplacements). Défi du jour : fabrique l'élément secret du jour en
   un minimum de fusions (chrono départage), à partir des bases. Engine pur/testé dans ./engine.
   ===================================================== */

const STORE_KEY = 'ludiven-alchimie-discovered';
const TOKEN = 74; // token diameter (px)
const HIT = 52; // drop-overlap radius (px)
const DAILY_ID = 'alchimie';
const LB_ID = 'alchimie-t';
const fmtTime = (s: number) => fmtCentis(Math.round(s * 100));

interface Token { tid: number; id: string; x: number; y: number; }
interface DailyState { discovered: string[]; done: boolean; }

const loadDiscovered = (): string[] => {
	try {
		const arr = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') as string[];
		const seen = new Set<string>();
		const out: string[] = [];
		for (const id of [...BASE_IDS, ...arr]) if (getElement(id) && !seen.has(id)) { seen.add(id); out.push(id); }
		return out;
	} catch { return [...BASE_IDS]; }
};

export default function AlchimieGame({ gameId }: { gameId: string }) {
	const [mode, setMode] = useState<'free' | 'daily'>('free');
	const [discovered, setDiscovered] = useState<string[]>(() => (typeof window === 'undefined' ? [...BASE_IDS] : loadDiscovered()));
	const [dDiscovered, setDDiscovered] = useState<string[]>([...BASE_IDS]);
	const [dTarget, setDTarget] = useState('');
	const [dDiff, setDDiff] = useState(0);
	const [dDone, setDDone] = useState(false);
	const [dElapsed, setDElapsed] = useState(0);
	const [dLoading, setDLoading] = useState(false);

	const [tokens, setTokens] = useState<Token[]>([]);
	const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
	const [search, setSearch] = useState('');
	const [reveal, setReveal] = useState<Element | null>(null);
	const [toast, setToast] = useState('');
	const [draggingTid, setDraggingTid] = useState<number | null>(null);
	const [pulseId, setPulseId] = useState('');
	const [shakeCauldron, setShakeCauldron] = useState(false);

	const boardRef = useRef<HTMLDivElement | null>(null);
	const floatRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{ id: string; sourceTid: number | null } | null>(null);
	const tokenSeq = useRef(1);
	const tokensRef = useRef<Token[]>([]);
	const modeRef = useRef<'free' | 'daily'>('free');
	const freeSet = useRef(new Set(discovered));
	const dArr = useRef<string[]>([...BASE_IDS]);
	const dSet = useRef(new Set(BASE_IDS));
	const dTargetRef = useRef('');
	const dDoneRef = useRef(false);
	const dStartRef = useRef(0);
	const dSeedRef = useRef(0);
	const dDiffRef = useRef(0);
	const dPaletteLen = useRef(BASE_IDS.length);
	const dFinalRef = useRef(0);
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => { tokensRef.current = tokens; }, [tokens]);
	useEffect(() => { freeSet.current = new Set(discovered); }, [discovered]);
	useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(discovered)); } catch { /* ignore */ } }, [discovered]);

	// Live timer while solving the daily.
	useEffect(() => {
		if (mode !== 'daily' || dDone || dLoading || dStartRef.current === 0) return;
		const id = setInterval(() => setDElapsed((Date.now() - dStartRef.current) / 1000), 250);
		return () => clearInterval(id);
	}, [mode, dDone, dLoading]);

	const flash = useCallback((text: string) => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		setToast(text);
		toastTimer.current = setTimeout(() => setToast(''), 1600);
	}, []);
	const showReveal = useCallback((el: Element) => {
		if (revealTimer.current) clearTimeout(revealTimer.current);
		setReveal(el);
		revealTimer.current = setTimeout(() => setReveal(null), 2200);
	}, []);

	const activeSet = () => (modeRef.current === 'daily' ? dSet.current : freeSet.current);
	const persistDaily = (arr: string[], done: boolean, finalTime?: number) => {
		saveDailyRun(DAILY_ID, { startedAt: dStartRef.current, done, seed: dSeedRef.current, diffIndex: dDiffRef.current, finalTime, state: { discovered: arr, done } satisfies DailyState });
	};

	/* Record a product: reveal if new, add to the active album, check the daily win. */
	const registerDiscovery = useCallback((productId: string) => {
		const el = getElement(productId)!;
		if (activeSet().has(productId)) { flash(`${el.emoji} ${el.name} · déjà connu`); return; }
		activeSet().add(productId);
		if (modeRef.current === 'daily') {
			const nd = [...dArr.current, productId];
			dArr.current = nd; setDDiscovered(nd);
			const won = productId === dTargetRef.current;
			if (won) {
				dDoneRef.current = true; setDDone(true);
				const t = (Date.now() - dStartRef.current) / 1000; dFinalRef.current = t; setDElapsed(t);
				trackGame(gameId, 'daily_done', { element: productId });
			}
			persistDaily(nd, won, won ? dFinalRef.current : undefined);
		} else {
			setDiscovered((d) => [...d, productId]);
		}
		setPulseId(productId); setTimeout(() => setPulseId(''), 950);
		showReveal(el);
		trackGame(gameId, 'discovery', { element: productId, mode: modeRef.current });
	}, [flash, showReveal, gameId]);

	/* Drop a board token onto another → 2-combo (the v1 mechanic, kept). */
	const resolveBoardDrop = useCallback((dragId: string, sourceTid: number | null, bx: number, by: number) => {
		const cur = tokensRef.current;
		const target = cur.find((t) => t.tid !== sourceTid && Math.hypot(t.x - bx, t.y - by) < HIT);
		if (!target) {
			if (sourceTid != null) setTokens(cur.map((t) => (t.tid === sourceTid ? { ...t, x: bx, y: by } : t)));
			else setTokens([...cur, { tid: tokenSeq.current++, id: dragId, x: bx, y: by }]);
			return;
		}
		const product = combine([dragId, target.id], modeRef.current === 'daily');
		if (!product) {
			flash('Rien ne se passe…');
			if (sourceTid != null) setTokens(cur.map((t) => (t.tid === sourceTid ? { ...t, x: bx, y: by } : t)));
			return;
		}
		setTokens([...cur.filter((t) => t.tid !== sourceTid && t.tid !== target.tid), { tid: tokenSeq.current++, id: product, x: target.x, y: target.y }]);
		registerDiscovery(product);
	}, [flash, registerDiscovery]);

	const fillSlot = useCallback((index: number, id: string, sourceTid: number | null) => {
		setSlots((prev) => { const n = [...prev]; n[index] = id; return n; });
		if (sourceTid != null) setTokens((cur) => cur.filter((t) => t.tid !== sourceTid));
	}, []);

	const fuseCauldron = useCallback(() => {
		const ids = slots.filter((s): s is string => !!s);
		if (ids.length < 2) { flash('Mets 2 ou 3 éléments dans le creuset'); return; }
		const product = combine(ids, modeRef.current === 'daily');
		if (!product) { flash('Rien ne se passe…'); setShakeCauldron(true); setTimeout(() => setShakeCauldron(false), 400); return; }
		const rect = boardRef.current?.getBoundingClientRect();
		const x = (rect?.width ?? 300) / 2, y = (rect?.height ?? 300) / 2;
		setTokens((cur) => [...cur, { tid: tokenSeq.current++, id: product, x, y }]);
		setSlots([null, null, null]);
		registerDiscovery(product);
	}, [slots, flash, registerDiscovery]);

	/* ---- Pointer drag (mouse + touch), routed on drop to a cauldron slot or the board ---- */
	const startDrag = useCallback((id: string, sourceTid: number | null, ev: React.PointerEvent) => {
		ev.preventDefault();
		dragRef.current = { id, sourceTid };
		if (sourceTid != null) setDraggingTid(sourceTid);
		const fl = floatRef.current;
		if (fl) { fl.textContent = getElement(id)!.emoji; fl.style.display = 'flex'; fl.style.left = `${ev.clientX}px`; fl.style.top = `${ev.clientY}px`; }
		const move = (e: PointerEvent) => { if (floatRef.current) { floatRef.current.style.left = `${e.clientX}px`; floatRef.current.style.top = `${e.clientY}px`; } };
		const up = (e: PointerEvent) => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			if (floatRef.current) floatRef.current.style.display = 'none';
			const drag = dragRef.current; dragRef.current = null; setDraggingTid(null);
			if (!drag) return;
			// Dropped on a cauldron slot? (rect hit-test — reliable across z-order/reflow)
			let hitSlot = -1;
			document.querySelectorAll('.al-slot').forEach((el) => {
				const r = el.getBoundingClientRect();
				if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hitSlot = Number(el.getAttribute('data-slot'));
			});
			if (hitSlot >= 0) { fillSlot(hitSlot, drag.id, drag.sourceTid); return; }
			const rect = boardRef.current?.getBoundingClientRect();
			const inside = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
			if (inside && rect) resolveBoardDrop(drag.id, drag.sourceTid, e.clientX - rect.left, e.clientY - rect.top);
			else if (drag.sourceTid != null) setTokens((cur) => cur.filter((t) => t.tid !== drag.sourceTid)); // off the board → remove
		};
		window.addEventListener('pointermove', move, { passive: false });
		window.addEventListener('pointerup', up);
	}, [fillSlot, resolveBoardDrop]);

	const spawnToBoard = useCallback((id: string) => {
		const rect = boardRef.current?.getBoundingClientRect();
		const w = rect?.width ?? 320, h = rect?.height ?? 360, n = tokenSeq.current;
		setTokens((prev) => [...prev, { tid: tokenSeq.current++, id, x: Math.max(TOKEN / 2, w / 2 + ((n * 37) % 120) - 60), y: Math.max(TOKEN / 2, h / 2 + ((n * 53) % 100) - 50) }]);
	}, []);

	/* ---- Modes ---- */
	const newFree = useCallback(() => { modeRef.current = 'free'; setMode('free'); setTokens([]); setSlots([null, null, null]); setReveal(null); setSearch(''); }, []);

	const startDaily = useCallback(async () => {
		modeRef.current = 'daily'; setMode('daily'); setTokens([]); setSlots([null, null, null]); setReveal(null); setSearch('');
		const run = loadDailyRun(DAILY_ID);
		if (run && run.seed != null) {
			const diff = run.diffIndex ?? 0;
			dSeedRef.current = run.seed; dDiffRef.current = diff; setDDiff(diff); dStartRef.current = run.startedAt;
			const target = dailyTarget(run.seed); dTargetRef.current = target; setDTarget(target);
			const palette = dailyPalette(run.seed, target, diff); dPaletteLen.current = palette.length;
			const st = (run.state as DailyState) ?? { discovered: palette, done: false };
			const disc = st.discovered?.length ? st.discovered : palette;
			dArr.current = disc; dSet.current = new Set(disc); setDDiscovered(disc);
			dDoneRef.current = !!run.done; setDDone(!!run.done);
			if (run.done) { dFinalRef.current = run.finalTime ?? 0; setDElapsed(run.finalTime ?? 0); } else setDElapsed((Date.now() - run.startedAt) / 1000);
			setDLoading(false);
			return;
		}
		setDLoading(true); setDDone(false); dDoneRef.current = false;
		const { seed, diffIndex } = await getDaily(DAILY_ID);
		dSeedRef.current = seed; dDiffRef.current = diffIndex; setDDiff(diffIndex);
		const target = dailyTarget(seed); dTargetRef.current = target; setDTarget(target);
		const palette = dailyPalette(seed, target, diffIndex); dPaletteLen.current = palette.length;
		dArr.current = palette; dSet.current = new Set(palette); setDDiscovered(palette);
		dStartRef.current = Date.now(); setDElapsed(0); setDLoading(false);
		persistDaily(palette, false);
		trackGame(gameId, 'daily_played');
	}, [gameId]);

	const hint = useCallback(() => {
		const set = activeSet();
		if (modeRef.current === 'daily') {
			const rec = getElement(dTargetRef.current)?.recipe ?? [];
			const missing = rec.filter((r) => !set.has(r)).map((r) => getElement(r)!);
			const need = missing[0] ?? getElement(rec[0]!);
			flash(need ? `💡 Il te faut ${need.emoji} ${need.name}` : '💡 Tu as tous les ingrédients — assemble-les !');
			return;
		}
		const options = ELEMENTS.filter((el) => el.recipe && !set.has(el.id) && el.recipe.every((r) => set.has(r)));
		if (!options.length) { flash(discovered.length >= TOTAL ? 'Tout est découvert ! 🎉' : 'Combine encore pour ouvrir des pistes'); return; }
		const pick = options[Math.floor(Math.random() * options.length)];
		flash(`💡 Essaie ${pick.recipe!.map((r) => getElement(r)!.emoji).join(' + ')}`);
	}, [discovered.length, flash]);

	const clearBoard = useCallback(() => { setTokens([]); setSlots([null, null, null]); }, []);
	const resetFree = useCallback(() => {
		if (!window.confirm('Effacer toutes tes découvertes libres et repartir des 5 bases ?')) return;
		setTokens([]); setDiscovered([...BASE_IDS]); freeSet.current = new Set(BASE_IDS); setSearch('');
	}, []);

	useEffect(() => { trackGame(gameId, 'game_started'); }, [gameId]);

	const daily = mode === 'daily';
	const invIds = daily ? dDiscovered : discovered;
	const q = search.trim().toLowerCase();
	const invList = invIds.map((id) => getElement(id)!).filter((el) => !q || el.name.toLowerCase().includes(q));
	const dMoves = Math.max(0, dDiscovered.length - dPaletteLen.current);
	const dScore = encodePacked(10_000_000, [dMoves, Math.min(9_999_999, Math.round((dDone ? dFinalRef.current : dElapsed) * 100))]);
	const targetEl = dTarget ? getElement(dTarget) : null;

	return (
		<div className="al-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newFree()} onDaily={startDaily} />

			{daily ? (
				<div className="al-dailybar">
					{dLoading ? <span>Préparation du défi…</span> : (
						<>
							<span className="al-difftag">{dailyWeekdayLabel()} · {['Facile', 'Moyen', 'Difficile'][dDiff]}</span>
							<span className="al-obj">Objectif&nbsp;: <b>{targetEl?.emoji} {targetEl?.name}</b></span>
							<span className="al-chip">🧪 {dMoves} fusions</span>
							<span className="al-chip">⏱ {fmtTime(dElapsed)}</span>
							<button className="al-btn" onClick={hint}>💡</button>
							<button className="al-btn" onClick={clearBoard}>🧹</button>
						</>
					)}
				</div>
			) : (
				<>
					<div className="al-bar">
						<span className="al-count"><b>{discovered.length}</b> / {TOTAL} découverts</span>
						<div className="al-actions">
							<button className="al-btn" onClick={hint}>💡 Indice</button>
							<button className="al-btn" onClick={clearBoard}>🧹 Vider l'établi</button>
							<button className="al-btn ghost" onClick={resetFree}>↻</button>
						</div>
					</div>
					<div className="al-progress"><span style={{ width: `${(discovered.length / TOTAL) * 100}%` }} /></div>
				</>
			)}

			<div className="al-stage">
				<div className="al-left">
					<div className="al-board" ref={boardRef}>
						{tokens.length === 0 && <div className="al-board-hint">Lâche une carte sur une autre pour fusionner ✨ — ou utilise le creuset ci-dessous</div>}
						{tokens.map((t) => {
							const el = getElement(t.id)!;
							return (
								<button
									key={t.tid}
									className={`al-token${draggingTid === t.tid ? ' dragging' : ''}${pulseId === t.id ? ' pulse' : ''}`}
									style={{ left: t.x, top: t.y }}
									onPointerDown={(ev) => startDrag(t.id, t.tid, ev)}
									onDoubleClick={() => setTokens((prev) => prev.filter((x) => x.tid !== t.tid))}
									title={`${el.name} — double-clic pour retirer`}
								>
									<span className="al-emo">{el.emoji}</span><span className="al-name">{el.name}</span>
								</button>
							);
						})}
						{reveal && (
							<div className="al-reveal" onClick={() => setReveal(null)}>
								<div className="al-reveal-card">
									<div className="al-spark">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 30}deg` }} />)}</div>
									<div className="al-reveal-emo">{reveal.emoji}</div>
									<div className="al-reveal-new">Nouveau&nbsp;!</div>
									<div className="al-reveal-name">{reveal.name}</div>
								</div>
							</div>
						)}
						{daily && dDone && (
							<div className="al-reveal">
								<div className="al-reveal-card win">
									<div className="al-reveal-emo">{targetEl?.emoji}</div>
									<div className="al-reveal-new">Défi réussi&nbsp;!</div>
									<div className="al-reveal-name">{targetEl?.name}</div>
									<div className="al-win-stats">{dMoves} fusions · {fmtTime(dFinalRef.current)}</div>
								</div>
							</div>
						)}
						{toast && <div className="al-toast">{toast}</div>}
					</div>

					<div className={`al-cauldron${shakeCauldron ? ' shake' : ''}`}>
						{slots.map((s, i) => (
							<button key={i} className={`al-slot${s ? ' filled' : ''}`} data-slot={i} onClick={() => setSlots((prev) => { const n = [...prev]; n[i] = null; return n; })} title={s ? 'Cliquer pour vider' : 'Glisse un élément ici'}>
								{s ? <span className="al-emo">{getElement(s)!.emoji}</span> : <span className="al-slot-plus">+</span>}
							</button>
						))}
						<button className="al-fuse" onClick={fuseCauldron} disabled={slots.filter(Boolean).length < 2}>Fusionner</button>
					</div>
				</div>

				<div className="al-inv">
					<input className="al-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un élément…" />
					<div className="al-grid">
						{invList.map((el) => (
							<button
								key={el.id}
								className={`al-card${pulseId === el.id ? ' pulse' : ''}${BASE_IDS.includes(el.id) ? ' base' : ''}`}
								onPointerDown={(ev) => startDrag(el.id, null, ev)}
								onClick={() => spawnToBoard(el.id)}
								title={el.name}
							>
								<span className="al-emo">{el.emoji}</span><span className="al-name">{el.name}</span>
							</button>
						))}
						{invList.length === 0 && <p className="al-empty">Aucun élément ne correspond.</p>}
					</div>
				</div>
			</div>

			<div ref={floatRef} className="al-float" style={{ display: 'none' }} />

			{daily && !dLoading && (
				<Leaderboard game={LB_ID} metric="time" submitValue={dDone ? dScore : undefined} format={(v) => formatScore(DAILY_LB.alchimie.fmt, v)} />
			)}

			<p className="al-help">
				{daily
					? <>On te donne une dizaine d'éléments : trouve la bonne <strong>combinaison</strong> (glisse 2 cartes, ou le creuset pour 3) qui mène à l'objectif, en <strong>un minimum de fusions</strong> (le chrono départage). La difficulté du jour dépend du nombre d'intermédiaires à reconstruire. {SECRET_TOTAL} défis, un par jour.</>
					: <>Combine ~{TOTAL} éléments depuis les 5 bases : <strong>lâche une carte sur une autre</strong>, ou remplis le <strong>creuset</strong> (2-3 éléments) puis Fusionner. Le <strong>Défi du jour</strong> te lance un objectif secret.</>}
			</p>
		</div>
	);
}

const CSS = `
.al-root { --al-accent: var(--accent-regular); width: 100%; max-width: 900px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; }
.al-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
.al-count { font-size: 15px; font-weight: 600; color: var(--gray-100); }
.al-count b { color: var(--al-accent); font-size: 20px; font-variant-numeric: tabular-nums; }
.al-actions { display: flex; gap: 6px; }
.al-dailybar { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 0.7rem; font-size: 14px; }
.al-obj { font-weight: 600; color: var(--gray-100); } .al-obj b { color: var(--al-accent); }
.al-chip { background: var(--gray-900); border-radius: 999px; padding: 4px 12px; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
.al-difftag { background: var(--gray-900); color: var(--gray-300); border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; }
.al-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.al-btn:hover { border-color: var(--al-accent); color: var(--al-accent); }
.al-btn.ghost { padding: 6px 12px; }
.al-progress { height: 6px; background: var(--gray-900); border-radius: 999px; overflow: hidden; margin-bottom: 0.8rem; }
.al-progress span { display: block; height: 100%; background: linear-gradient(90deg, var(--al-accent), #c8b6ff); border-radius: 999px; transition: width 0.4s ease; }

.al-stage { display: grid; grid-template-columns: 1fr 320px; gap: 14px; }
@media (max-width: 720px) { .al-stage { grid-template-columns: 1fr; } }
.al-left { display: flex; flex-direction: column; gap: 10px; }

.al-board {
  position: relative; min-height: 380px; border-radius: 18px; overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(160,140,255,0.16), transparent 60%),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 26px),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 26px),
    linear-gradient(160deg, #241b3a, #1a1730 60%, #201a37);
  border: 1px solid var(--gray-800); touch-action: none;
}
.al-board-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 30px; color: rgba(255,255,255,0.6); font-size: 14px; pointer-events: none; }

.al-cauldron { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 16px; background: linear-gradient(160deg, #2a2150, #201a37); border: 1px solid var(--gray-800); }
.al-cauldron.shake { animation: al-shake 0.4s; }
.al-slot { width: 56px; height: 56px; border-radius: 12px; border: 2px dashed var(--gray-700); background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; cursor: pointer; touch-action: none; }
.al-slot.filled { border-style: solid; border-color: var(--al-accent); background: var(--gray-999); }
.al-slot-plus { color: rgba(255,255,255,0.35); font-size: 22px; }
.al-fuse { margin-left: auto; border: none; background: var(--al-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 14px; border-radius: 999px; padding: 10px 22px; cursor: pointer; box-shadow: var(--shadow-sm); }
.al-fuse:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

.al-token, .al-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); border-radius: 14px; cursor: grab; font: inherit; user-select: none; -webkit-user-select: none; touch-action: none; }
.al-token { position: absolute; width: ${TOKEN}px; height: ${TOKEN}px; transform: translate(-50%, -50%); box-shadow: 0 4px 14px rgba(0,0,0,0.4); animation: al-pop 0.22s ease; z-index: 1; }
.al-token.dragging { opacity: 0; }
.al-token.pulse, .al-card.pulse { animation: al-pulse 0.9s ease; border-color: #c8b6ff; }
.al-emo { font-size: 26px; line-height: 1; }
.al-name { font-size: 10.5px; font-weight: 600; color: var(--gray-200); max-width: 68px; text-align: center; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.al-inv { display: flex; flex-direction: column; min-height: 0; }
.al-search { width: 100%; box-sizing: border-box; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-size: 14px; border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; }
.al-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 7px; max-height: 470px; overflow-y: auto; padding: 2px; align-content: start; }
@media (max-width: 720px) { .al-grid { max-height: 300px; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); } }
.al-card { width: 100%; aspect-ratio: 1; padding: 4px; }
.al-card.base { border-color: var(--al-accent); }
.al-card:hover { border-color: var(--al-accent); transform: translateY(-1px); }
.al-empty { grid-column: 1 / -1; color: var(--gray-400); font-size: 13px; text-align: center; padding: 20px 0; }

.al-float { position: fixed; z-index: 50; width: ${TOKEN}px; height: ${TOKEN}px; margin-left: -${TOKEN / 2}px; margin-top: -${TOKEN / 2}px; align-items: center; justify-content: center; font-size: 30px; pointer-events: none; border-radius: 14px; background: var(--gray-999); border: 1.5px solid var(--al-accent); box-shadow: 0 8px 22px rgba(0,0,0,0.5); }

.al-toast { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: rgba(20,16,34,0.92); border: 1px solid rgba(255,255,255,0.25); color: #fff; font-size: 13.5px; font-weight: 600; padding: 7px 16px; border-radius: 999px; white-space: nowrap; animation: al-pop 0.2s ease; }

.al-reveal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 20; background: rgba(10,8,20,0.5); backdrop-filter: blur(2px); cursor: pointer; }
.al-reveal-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px 34px; border-radius: 20px; background: linear-gradient(160deg, #2a2150, #1c1836); border: 2px solid var(--al-accent); box-shadow: 0 0 44px rgba(160,140,255,0.5); animation: al-reveal 0.5s cubic-bezier(0.2,1.4,0.4,1); }
.al-reveal-card.win { border-color: #f5d76e; box-shadow: 0 0 44px rgba(245,215,110,0.5); }
.al-reveal-emo { font-size: 62px; line-height: 1; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
.al-reveal-new { font-family: var(--font-brand); font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #c8b6ff; }
.al-reveal-name { font-family: var(--font-brand); font-weight: 700; font-size: 24px; color: #fff; }
.al-win-stats { color: #f5d76e; font-weight: 700; font-size: 14px; margin-top: 4px; font-variant-numeric: tabular-nums; }
.al-spark { position: absolute; inset: 0; pointer-events: none; }
.al-spark i { position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; border-radius: 50%; background: #f5d76e; transform: rotate(var(--a)) translateY(0); animation: al-spark 0.7s ease-out forwards; }

.al-help { max-width: 640px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.6; margin: 1rem auto 0; }

@keyframes al-pop { from { transform: translate(-50%, -50%) scale(0.6); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
@keyframes al-pulse { 0% { transform: scale(1); } 40% { transform: scale(1.18); box-shadow: 0 0 18px rgba(200,182,255,0.7); } 100% { transform: scale(1); } }
@keyframes al-reveal { from { transform: scale(0.5) rotate(-6deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes al-spark { to { transform: rotate(var(--a)) translateY(-70px) scale(0.2); opacity: 0; } }
@keyframes al-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@media (prefers-reduced-motion: reduce) { .al-token, .al-card.pulse, .al-reveal-card, .al-spark i, .al-toast, .al-cauldron.shake { animation: none; } }
`;
