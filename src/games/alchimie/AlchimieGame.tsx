import { useState, useEffect, useRef, useCallback } from 'react';
import { ELEMENTS, BASE_IDS, TOTAL, SECRET_TOTAL, combine, getElement, dailyTarget, dailyPalette, type Element } from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { encodePacked, formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import { useLevels } from '../../lib/useLevels';
import { alchimieLevels } from './levels';

/* =====================================================
   ALCHIMIE — React island. Libre : combine ~150 éléments depuis 5 bases (glisser une carte sur
   une autre). Défi du jour : fabrique l'élément secret du jour en un minimum de fusions (chrono
   départage). Indices auto toutes les 30 s sans progrès. Engine pur/testé dans ./engine.
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

/* Next element to craft on the path to `target`: an unowned ancestor whose ingredients
   are all already owned (craftable right now). null = every ingredient of the target is owned. */
const dailyNextStep = (have: Set<string>, target: string): Element | null => {
	const needed = new Set<string>();
	const stack = [target];
	while (stack.length) {
		const el = getElement(stack.pop()!);
		if (!el?.recipe) continue;
		for (const r of el.recipe) if (!have.has(r) && !needed.has(r)) { needed.add(r); stack.push(r); }
	}
	for (const id of needed) { const el = getElement(id)!; if (el.recipe!.every((r) => have.has(r))) return el; }
	return null;
};
const stepText = (have: Set<string>, target: string): string => {
	const step = dailyNextStep(have, target);
	if (step) return `💡 Essaie ${step.recipe!.map((r) => getElement(r)!.emoji).join(' + ')} → ${step.emoji}`;
	const t = getElement(target);
	return t ? `💡 Tu as tout — assemble ${t.recipe!.map((r) => getElement(r)!.emoji).join(' + ')}` : '💡 Assemble tes éléments';
};

export default function AlchimieGame({ gameId }: { gameId: string }) {
	const [mode, setMode] = useState<'free' | 'daily' | 'level'>('free');
	const lv = useLevels(gameId, alchimieLevels);
	const [lvDiscovered, setLvDiscovered] = useState<string[]>([...BASE_IDS]);
	const [lvCombos, setLvCombos] = useState(0);
	const [lvTarget, setLvTarget] = useState('');
	const [discovered, setDiscovered] = useState<string[]>(() => (typeof window === 'undefined' ? [...BASE_IDS] : loadDiscovered()));
	const [dDiscovered, setDDiscovered] = useState<string[]>([...BASE_IDS]);
	const [dTarget, setDTarget] = useState('');
	const [dDiff, setDDiff] = useState(0);
	const [dDone, setDDone] = useState(false);
	const [dElapsed, setDElapsed] = useState(0);
	const [dLoading, setDLoading] = useState(false);

	const [tokens, setTokens] = useState<Token[]>([]);
	const [catalog, setCatalog] = useState(false);
	const [search, setSearch] = useState('');
	const [reveal, setReveal] = useState<Element | null>(null);
	const [toast, setToast] = useState('');
	const [draggingTid, setDraggingTid] = useState<number | null>(null);
	const [pulseId, setPulseId] = useState('');

	const boardRef = useRef<HTMLDivElement | null>(null);
	const floatRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{ id: string; sourceTid: number | null } | null>(null);
	const tokenSeq = useRef(1);
	const tokensRef = useRef<Token[]>([]);
	const modeRef = useRef<'free' | 'daily' | 'level'>('free');
	const freeSet = useRef(new Set(discovered));
	const lvSet = useRef(new Set(BASE_IDS));
	const lvArr = useRef<string[]>([...BASE_IDS]);
	const lvCombosRef = useRef(0);
	const lvTargetRef = useRef('');
	const lvDoneRef = useRef(false);
	const dArr = useRef<string[]>([...BASE_IDS]);
	const dSet = useRef(new Set(BASE_IDS));
	const dTargetRef = useRef('');
	const dDoneRef = useRef(false);
	const dStartRef = useRef(0);
	const dSeedRef = useRef(0);
	const dDiffRef = useRef(0);
	const dPaletteLen = useRef(BASE_IDS.length);
	const dFinalRef = useRef(0);
	const lastProgressRef = useRef(0); // ms of the last discovery — drives the 30s auto-hint
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

	// Daily auto-hint: nudge toward the next useful fusion after 30s without a discovery.
	useEffect(() => {
		if (mode !== 'daily' || dDone || dLoading || dStartRef.current === 0) return;
		const id = setInterval(() => {
			if (Date.now() - lastProgressRef.current < 30000) return;
			lastProgressRef.current = Date.now();
			flash(stepText(dSet.current, dTargetRef.current));
		}, 2000);
		return () => clearInterval(id);
	}, [mode, dDone, dLoading, flash]);
	const showReveal = useCallback((el: Element) => {
		if (revealTimer.current) clearTimeout(revealTimer.current);
		setReveal(el);
		revealTimer.current = setTimeout(() => setReveal(null), 2200);
	}, []);

	const activeSet = () => (modeRef.current === 'daily' ? dSet.current : modeRef.current === 'level' ? lvSet.current : freeSet.current);
	const persistDaily = (arr: string[], done: boolean, finalTime?: number) => {
		saveDailyRun(DAILY_ID, { startedAt: dStartRef.current, done, seed: dSeedRef.current, diffIndex: dDiffRef.current, finalTime, state: { discovered: arr, done } satisfies DailyState });
	};

	/* Record a product: reveal if new, add to the active album, check the daily win. */
	const registerDiscovery = useCallback((productId: string) => {
		const el = getElement(productId)!;
		if (activeSet().has(productId)) { flash(`${el.emoji} ${el.name} · déjà connu`); return; }
		activeSet().add(productId);
		lastProgressRef.current = Date.now(); // reset the auto-hint countdown
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
		} else if (modeRef.current === 'level') {
			const combos = lvCombosRef.current + 1; // each new discovery = one fusion used
			lvCombosRef.current = combos; setLvCombos(combos);
			const nd = [...lvArr.current, productId];
			lvArr.current = nd; setLvDiscovered(nd);
			if (productId === lvTargetRef.current && !lvDoneRef.current) {
				lvDoneRef.current = true;
				lv.finish({ won: true, score: combos, raw: { target: productId, combos } });
			}
		} else {
			setDiscovered((d) => [...d, productId]);
		}
		setPulseId(productId); setTimeout(() => setPulseId(''), 950);
		// In levels mode, hitting the target opens the outcome card — skip the reveal so it doesn't cover it.
		if (!(modeRef.current === 'level' && productId === lvTargetRef.current)) showReveal(el);
		trackGame(gameId, 'discovery', { element: productId, mode: modeRef.current });
	}, [flash, showReveal, gameId, lv]);

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

	/* ---- Pointer drag (mouse + touch), routed on drop to the board ---- */
	const startDrag = useCallback((id: string, sourceTid: number | null, ev: React.PointerEvent) => {
		// Touch on a palette card (sourceTid == null): don't hijack the gesture — let the
		// list scroll (touch-action: pan-y) and let the tap fire onClick → spawnToBoard.
		// Dragging stays available for mouse/pen, and for board tokens (which don't scroll).
		if (ev.pointerType === 'touch' && sourceTid == null) return;
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
			const rect = boardRef.current?.getBoundingClientRect();
			const inside = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
			if (inside && rect) resolveBoardDrop(drag.id, drag.sourceTid, e.clientX - rect.left, e.clientY - rect.top);
			else if (drag.sourceTid != null) setTokens((cur) => cur.filter((t) => t.tid !== drag.sourceTid)); // off the board → remove
		};
		window.addEventListener('pointermove', move, { passive: false });
		window.addEventListener('pointerup', up);
	}, [resolveBoardDrop]);

	const spawnToBoard = useCallback((id: string) => {
		const rect = boardRef.current?.getBoundingClientRect();
		const w = rect?.width ?? 320, h = rect?.height ?? 360, n = tokenSeq.current;
		setTokens((prev) => [...prev, { tid: tokenSeq.current++, id, x: Math.max(TOKEN / 2, w / 2 + ((n * 37) % 120) - 60), y: Math.max(TOKEN / 2, h / 2 + ((n * 53) % 100) - 50) }]);
	}, []);

	/* ---- Modes ---- */
	const newFree = useCallback(() => { modeRef.current = 'free'; setMode('free'); setTokens([]); setReveal(null); setSearch(''); }, []);

	/* Levels: each level seeds the workspace with the 5 bases and asks to craft one target. */
	const armLevels = useCallback(() => { modeRef.current = 'level'; setMode('level'); setTokens([]); setReveal(null); setSearch(''); lv.enter(); }, [lv]);

	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		modeRef.current = 'level'; setMode('level');
		lvTargetRef.current = cfg.target; setLvTarget(cfg.target);
		lvSet.current = new Set(BASE_IDS);
		lvArr.current = [...BASE_IDS]; setLvDiscovered([...BASE_IDS]);
		lvCombosRef.current = 0; setLvCombos(0);
		lvDoneRef.current = false;
		setTokens([]); setReveal(null); setSearch('');
	}, [lv]);

	const startDaily = useCallback(async () => {
		modeRef.current = 'daily'; setMode('daily'); setCatalog(false); setTokens([]); setReveal(null); setSearch(''); lastProgressRef.current = Date.now();
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
		if (modeRef.current === 'daily') { lastProgressRef.current = Date.now(); flash(stepText(set, dTargetRef.current)); return; }
		if (modeRef.current === 'level') { flash(stepText(set, lvTargetRef.current)); return; }
		const options = ELEMENTS.filter((el) => el.recipe && !set.has(el.id) && el.recipe.every((r) => set.has(r)));
		if (!options.length) { flash(discovered.length >= TOTAL ? 'Tout est découvert ! 🎉' : 'Combine encore pour ouvrir des pistes'); return; }
		const pick = options[Math.floor(Math.random() * options.length)];
		flash(`💡 Essaie ${pick.recipe!.map((r) => getElement(r)!.emoji).join(' + ')}`);
	}, [discovered.length, flash]);

	const clearBoard = useCallback(() => { setTokens([]); }, []);
	const resetFree = useCallback(() => {
		if (!window.confirm('Effacer toutes tes découvertes libres et repartir des 5 bases ?')) return;
		setTokens([]); setDiscovered([...BASE_IDS]); freeSet.current = new Set(BASE_IDS); setSearch('');
	}, []);

	useEffect(() => { trackGame(gameId, 'game_started'); }, [gameId]);

	const daily = mode === 'daily';
	const levels = mode === 'level';
	const invIds = daily ? dDiscovered : levels ? lvDiscovered : discovered;
	const q = search.trim().toLowerCase();
	const invList = invIds.map((id) => getElement(id)!).filter((el) => !q || el.name.toLowerCase().includes(q));
	const dMoves = Math.max(0, dDiscovered.length - dPaletteLen.current);
	const dScore = encodePacked(10_000_000, [dMoves, Math.min(9_999_999, Math.round((dDone ? dFinalRef.current : dElapsed) * 100))]);
	const targetEl = dTarget ? getElement(dTarget) : null;
	const lvTargetEl = lvTarget ? getElement(lvTarget) : null;
	const lvCfg = levels ? alchimieLevels.config(lv.level) : null;

	// Catalog (free mode): discovered → shown; frontier (both ingredients known) → faded emoji + recipe; else "?".
	const discSet = new Set(discovered);
	const catList = ELEMENTS.map((el) => {
		const has = discSet.has(el.id);
		const frontier = !has && !!el.recipe && el.recipe.every((r) => discSet.has(r));
		return { el, has, frontier };
	});
	const frontierCount = catList.filter((c) => c.frontier).length;

	return (
		<div className="al-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newFree(); } else if (daily) newFree(); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

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
			) : levels ? (
				lv.menu ? (
					<div className="al-dailybar"><span className="al-difftag">Progression — découvre la cible pour débloquer le niveau suivant</span></div>
				) : (
					<div className="al-dailybar">
						<span className="al-difftag">Niveau {lv.level}</span>
						<span className="al-obj">Objectif&nbsp;: <b>{lvTargetEl?.emoji} {lvTargetEl?.name}</b></span>
						<span className="al-chip">🧪 {lvCombos} combinaison{lvCombos > 1 ? 's' : ''}</span>
						{lvCfg && <span className="al-chip" title="Seuils d'étoiles">⭐ {lvCfg.threeStar} / {lvCfg.twoStar}</span>}
						<button className="al-btn" onClick={hint}>💡</button>
						<button className="al-btn" onClick={clearBoard}>🧹</button>
					</div>
				)
			) : (
				<>
					<div className="al-bar">
						<span className="al-count"><b>{discovered.length}</b> / {TOTAL} découverts</span>
						<div className="al-viewseg">
							<button className={catalog ? '' : 'on'} onClick={() => setCatalog(false)}>🧪 Établi</button>
							<button className={catalog ? 'on' : ''} onClick={() => setCatalog(true)}>📖 Catalogue</button>
						</div>
						{!catalog && (
							<div className="al-actions">
								<button className="al-btn" onClick={hint}>💡 Indice</button>
								<button className="al-btn" onClick={clearBoard}>🧹 Vider l'établi</button>
								<button className="al-btn ghost" onClick={resetFree}>↻</button>
							</div>
						)}
					</div>
					<div className="al-progress"><span style={{ width: `${(discovered.length / TOTAL) * 100}%` }} /></div>
				</>
			)}

			{levels && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : !daily && !levels && catalog ? (
				<div className="al-catalog">
					<div className="al-catbar"><b>{discovered.length}</b> / {TOTAL} découverts · <span className="al-catfrontier">{frontierCount} à portée</span></div>
					<div className="al-catgrid">
						{catList.map(({ el, has, frontier }) => has ? (
							<div key={el.id} className={`al-cat has${BASE_IDS.includes(el.id) ? ' base' : ''}`} title={el.recipe ? `${el.name} = ${el.recipe.map((r) => getElement(r)!.name).join(' + ')}` : el.name}>
								<span className="al-emo">{el.emoji}</span>
								<span className="al-name">{el.name}</span>
								{el.recipe && <span className="al-cat-recipe">{el.recipe.map((r) => getElement(r)!.emoji).join(' + ')}</span>}
							</div>
						) : frontier ? (
							<div key={el.id} className="al-cat frontier" title="À portée — à toi de trouver la recette !">
								<span className="al-emo faded">{el.emoji}</span>
							</div>
						) : (
							<div key={el.id} className="al-cat locked" title="Mystère">
								<span className="al-cat-q">?</span>
							</div>
						))}
					</div>
				</div>
			) : (
			<div className="al-stage">
				<div className="al-left">
					<div className="al-board" ref={boardRef}>
						{tokens.length === 0 && <div className="al-board-hint">Lâche une carte sur une autre pour fusionner ✨</div>}
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
						{lv.done && (
							<LevelOutcome
								level={lv.level}
								lastLevel={alchimieLevels.count}
								won={lv.won}
								stars={lv.stars}
								detail={lv.won ? `Découvert en ${lvCombos} combinaison${lvCombos > 1 ? 's' : ''}` : undefined}
								onNext={() => startLevel(lv.level + 1)}
								onReplay={() => startLevel(lv.level)}
								onMenu={lv.backToMenu}
							/>
						)}
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
			)}

			<div ref={floatRef} className="al-float" style={{ display: 'none' }} />

			{daily && !dLoading && (
				<Leaderboard game={LB_ID} metric="time" submitValue={dDone ? dScore : undefined} format={(v) => formatScore(DAILY_LB.alchimie.fmt, v)} />
			)}

			<p className="al-help">
				{daily
					? <>On te donne une dizaine d'éléments : <strong>lâche une carte sur une autre</strong> pour trouver la combinaison qui mène à l'objectif, en <strong>un minimum de fusions</strong> (le chrono départage). Bloqué ? Un <strong>indice</strong> apparaît toutes les 30 s. {SECRET_TOTAL} défis, un par jour.</>
					: levels
						? <>Chaque niveau te lance un <strong>élément cible</strong> à découvrir depuis les 5 bases : <strong>lâche une carte sur une autre</strong> pour fusionner. Moins tu fais de combinaisons, plus tu gagnes d'étoiles. Réussir un niveau débloque le suivant. {alchimieLevels.count} niveaux, du plus court au plus profond.</>
						: <>Combine ~{TOTAL} éléments depuis les 5 bases : <strong>lâche une carte sur une autre</strong> pour les fusionner. Le <strong>Catalogue</strong> montre ta progression : les éléments trouvés avec leur recette, les prochains à portée en transparence, le reste en «&nbsp;?&nbsp;». Le <strong>Défi du jour</strong> te lance un objectif secret.</>}
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

.al-token, .al-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); border-radius: 14px; cursor: grab; font: inherit; user-select: none; -webkit-user-select: none; touch-action: none; }
/* Palette/catalogue cards live in a scrollable list: allow vertical panning so touch
   can scroll (drag-to-board is mouse/pen or the tap-to-add onClick on touch). */
.al-card { touch-action: pan-y; }
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

/* View switch (Établi / Catalogue) */
.al-viewseg { display: inline-flex; background: var(--gray-900); border: 1px solid var(--gray-800); border-radius: 999px; padding: 2px; }
.al-viewseg button { border: none; background: transparent; color: var(--gray-300); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 5px 14px; cursor: pointer; }
.al-viewseg button.on { background: var(--al-accent); color: var(--accent-text-over); }

/* Catalogue */
.al-catalog { border: 1px solid var(--gray-800); border-radius: 18px; background: linear-gradient(160deg, #241b3a, #1a1730 60%, #201a37); padding: 12px; }
.al-catbar { text-align: center; color: var(--gray-300); font-size: 13px; margin-bottom: 10px; }
.al-catbar b { color: var(--al-accent); font-size: 16px; font-variant-numeric: tabular-nums; }
.al-catfrontier { color: #c8b6ff; font-weight: 600; }
.al-catgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 7px; max-height: 560px; overflow-y: auto; padding: 2px; }
.al-cat { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; aspect-ratio: 1; border-radius: 14px; border: 1.5px solid var(--gray-800); background: rgba(255,255,255,0.03); padding: 4px; }
.al-cat.has { border-color: var(--gray-700); background: var(--gray-999); }
.al-cat.has.base { border-color: var(--al-accent); }
.al-cat-recipe { font-size: 10px; opacity: 0.6; line-height: 1; margin-top: 1px; }
.al-cat.locked { border-style: dashed; }
.al-cat.frontier { border-style: dashed; border-color: var(--al-accent); }
.al-cat.frontier .al-emo.faded { opacity: 0.4; filter: grayscale(0.35); }
.al-cat-q { font-size: 24px; font-weight: 700; color: rgba(255,255,255,0.22); }

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
@media (prefers-reduced-motion: reduce) { .al-token, .al-card.pulse, .al-reveal-card, .al-spark i, .al-toast { animation: none; } }
`;
