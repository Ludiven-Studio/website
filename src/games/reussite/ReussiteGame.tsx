import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import { useLevels } from '../../lib/useLevels';
import { reussiteLevels } from './levels';
import { fmtCentis, formatScore, encodePacked } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import {
	deal, draw as drawStock, autoMove, isRun,
	wasteToFoundation, wasteToTableau, tableauToFoundation, tableauToTableau, jokerToTableau,
	foundationCount, isWon, hasMoves, rankOf, suitOf, isRed, RANKS, SUITS,
	type State, type Src,
} from './engine';

/* =====================================================
   RÉUSSITE — Klondike card solitaire island.
   Free: unlimited deals (draw-1/3 by difficulty), undo, new deal.
   Daily: one shared deal, one attempt, ranked by cards-to-foundation then time.
   Canvas board; pure rules in ./engine (tested).
   ===================================================== */

type Status = 'playing' | 'won' | 'ended'; // 'ended' = finished a partial daily / dead end
type DiffKey = 'facile' | 'moyen' | 'difficile';
const DIFFS: Record<DiffKey, { label: string; draw: number; passes: number }> = {
	facile: { label: 'Facile', draw: 1, passes: Infinity },
	moyen: { label: 'Moyen', draw: 2, passes: Infinity },
	difficile: { label: 'Difficile', draw: 3, passes: 2 },
};
const DIFF_KEYS: DiffKey[] = ['facile', 'moyen', 'difficile'];
const LB_FMT = DAILY_LB.reussite.fmt;
const JOKERS = 3; // free "unblock" moves per game
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const bestKey = (d: DiffKey): string => `ludiven-reussite-best-${d}`;

// Score = cards to foundations (more is better) with time as tiebreak, stored inverted so it
// sorts ascending: value = (52 - cards) * 1e7 + centiseconds.
const encodeScore = (cards: number, centis: number): number =>
	encodePacked(10_000_000, [52 - cards, Math.min(9_999_999, Math.max(0, Math.round(centis)))]);

interface Geo {
	cardW: number; cardH: number; radius: number;
	stock: { x: number; y: number }; waste: { x: number; y: number };
	found: { x: number; y: number }[]; // 4
	colX: number[]; // 7
	tabTop: number;
	cardY: (col: number, idx: number) => number; // top-left y of a tableau card
}

export default function ReussiteGame({ gameId }: { gameId: string }) {
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [diffKey, setDiffKey] = useState<DiffKey>('facile');
	const [status, setStatus] = useState<Status>('playing');
	const [cards, setCards] = useState(0); // foundation count (HUD)
	const [stuck, setStuck] = useState(false);
	const [started, setStarted] = useState(false);
	const [elapsed, setElapsed] = useState(0); // ms
	const [finalScore, setFinalScore] = useState<number | null>(null);
	const [submitVal, setSubmitVal] = useState<number | undefined>(undefined);
	const [best, setBest] = useState<number | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [jokers, setJokers] = useState(JOKERS);
	const [jokerArmed, setJokerArmed] = useState(false);
	const { celebrating, showWin } = useCelebration(status === 'won');
	const lv = useLevels(gameId, reussiteLevels);
	const lvRef = useRef(lv);
	lvRef.current = lv;

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 600, h: 430 });
	const geoRef = useRef<Geo | null>(null);
	const gameRef = useRef<State>(deal(1));
	const histRef = useRef<{ s: State; j: number; m: number }[]>([]); // undo snapshots (state + jokers left + move count)
	const jokersRef = useRef(JOKERS);
	const movesRef = useRef(0); // committed moves this run (undo rewinds it) — used for level star grading
	const jokerSelRef = useRef<Src | null>(null); // joker mode: the picked source (two-tap / drag)
	const jokerArmedRef = useRef(false);
	const statusRef = useRef<Status>('playing');
	const startedRef = useRef(false);
	const clockRef = useRef(0);
	const rafRef = useRef(0);
	// drag
	const dragRef = useRef<{ src: Src; cards: number[]; dx: number; dy: number; ox: number; oy: number; moved: boolean } | null>(null);
	// daily bookkeeping
	const dailyRef = useRef(false);
	const seedRef = useRef(0);
	const diffRef = useRef(0);
	const initRef = useRef<State | null>(null);
	const timerStartRef = useRef<number | null>(null);
	const timerRunRef = useRef(false);

	/* ---------- Geometry ---------- */
	const computeGeo = useCallback((): Geo => {
		const { w, h } = dimRef.current;
		const M = Math.max(6, w * 0.018);
		const G = Math.max(4, w * 0.012);
		const cardW = (w - 2 * M - 6 * G) / 7;
		const cardH = cardW * 1.4;
		const colX = Array.from({ length: 7 }, (_, i) => M + i * (cardW + G));
		const topY = M;
		const found = [3, 4, 5, 6].map((i) => ({ x: colX[i], y: topY }));
		const tabTop = topY + cardH + G * 1.4;
		// fan gaps, shrunk so the longest column fits the available height
		const g = gameRef.current;
		const avail = h - tabTop - M;
		let downG = cardH * 0.16, upG = cardH * 0.30;
		let need = 0;
		for (const col of g.tableau) {
			const downs = col.filter((c) => !c.up).length;
			const ups = Math.max(0, col.length - downs);
			need = Math.max(need, cardH + downs * downG + Math.max(0, ups - 1) * upG);
		}
		if (need > avail && need > cardH) {
			const k = Math.max(0.35, (avail - cardH) / (need - cardH));
			downG *= k; upG *= k;
		}
		const cardY = (col: number, idx: number): number => {
			const pile = g.tableau[col];
			let y = tabTop;
			for (let i = 0; i < idx; i++) y += pile[i].up ? upG : downG;
			return y;
		};
		return { cardW, cardH, radius: Math.max(4, cardW * 0.12), stock: { x: colX[0], y: topY }, waste: { x: colX[1], y: topY }, found, colX, tabTop, cardY };
	}, []);

	/* ---------- Move application (plain fns → always see current state) ---------- */
	const sync = (): void => {
		const g = gameRef.current;
		const fc = foundationCount(g);
		setCards(fc);
		if (isWon(g)) {
			if (statusRef.current !== 'won') finish(true);
		} else {
			setStuck(startedRef.current && !hasMoves(g)); // dead end → overlay (Terminer / Nouvelle donne)
		}
	};

	const snapshot = (): void => {
		histRef.current.push({ s: gameRef.current, j: jokersRef.current, m: movesRef.current });
		if (histRef.current.length > 400) histRef.current.shift();
	};
	// commit a new state (push undo), then refresh derived state
	const commit = (next: State | null): boolean => {
		if (!next) return false;
		snapshot();
		gameRef.current = next;
		movesRef.current += 1;
		sync();
		return true;
	};
	// a joker move: same as commit but spends one joker and leaves joker mode
	const doJoker = (next: State | null): boolean => {
		if (!next) return false;
		snapshot();
		gameRef.current = next;
		movesRef.current += 1;
		jokersRef.current -= 1; setJokers(jokersRef.current);
		jokerSelRef.current = null; jokerArmedRef.current = false; setJokerArmed(false);
		sync();
		return true;
	};

	const finish = (won: boolean): void => {
		const g = gameRef.current;
		const fc = foundationCount(g);
		const centis = timerStartRef.current != null ? Math.round((clockRef.current - timerStartRef.current) / 10) : 0;
		timerRunRef.current = false;
		statusRef.current = won ? 'won' : 'ended';
		setStatus(won ? 'won' : 'ended');
		if (lvRef.current.active) {
			// Levels mode: a win grades on time (star metric) with moves as the tie-break stat.
			lvRef.current.finish({ won, score: won ? centis : 0, stat: movesRef.current, raw: { cards: fc, centis, moves: movesRef.current } });
			return;
		}
		if (dailyRef.current) {
			const value = encodeScore(fc, centis);
			setFinalScore(value);
			setSubmitVal(alreadyPlayed ? undefined : value);
			setAlreadyPlayed(true);
			saveDailyRun(gameId, { startedAt: Date.now(), seed: seedRef.current, diffIndex: diffRef.current, done: true, finalTime: value });
			trackGame(gameId, 'game_over', { cards: fc, centis, mode: 'daily' });
		} else {
			const key = bestKey(diffKey);
			const prev = Number(localStorage.getItem(key) ?? 0);
			if (fc > prev) { localStorage.setItem(key, String(fc)); setBest(fc); }
			trackGame(gameId, 'game_over', { cards: fc, mode: 'free' });
		}
	};

	/* ---------- Mode setup ---------- */
	const layEngine = (d: DiffKey, seed: number): State => {
		const cfg = DIFFS[d];
		return deal(seed, cfg.draw, cfg.passes);
	};

	const armBoard = (): void => { startedRef.current = false; setStarted(false); };
	const beginPlay = (): void => {
		if (startedRef.current) return;
		startedRef.current = true; setStarted(true);
		timerStartRef.current = clockRef.current; timerRunRef.current = true;
	};

	const resetCommon = (): void => {
		histRef.current = [];
		movesRef.current = 0;
		dragRef.current = null;
		jokersRef.current = JOKERS; setJokers(JOKERS);
		jokerSelRef.current = null; jokerArmedRef.current = false; setJokerArmed(false);
		statusRef.current = 'playing';
		setStatus('playing');
		setStuck(false);
		setFinalScore(null);
		setSubmitVal(undefined);
		setElapsed(0);
		timerStartRef.current = null;
		timerRunRef.current = false;
	};

	const startFree = useCallback((d: DiffKey): void => {
		dailyRef.current = false;
		setDaily(false); setDailyLoading(false); setAlreadyPlayed(false);
		setDiffKey(d);
		gameRef.current = layEngine(d, (Math.random() * 2 ** 31) >>> 0);
		initRef.current = null;
		resetCommon();
		startedRef.current = true; setStarted(true); // free mode has no Start gate
		setCards(foundationCount(gameRef.current));
		setBest(Number(localStorage.getItem(bestKey(d)) ?? 0) || null);
		geoRef.current = null;
		trackGame(gameId, 'game_started', { difficulty: d, mode: 'free' });
	}, [gameId]);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true);
		const apply = (seed: number, diffIndex: number, done: boolean, finalTime: number | null): void => {
			seedRef.current = seed >>> 0;
			diffRef.current = clamp(diffIndex, 0, 2);
			const d = DIFF_KEYS[diffRef.current];
			setDiffKey(d);
			gameRef.current = layEngine(d, seedRef.current);
			initRef.current = gameRef.current;
			resetCommon();
			armBoard();
			setCards(foundationCount(gameRef.current));
			setAttempt((a) => a + 1);
			setDailyLoading(false);
			geoRef.current = null;
			if (done) {
				setAlreadyPlayed(true);
				startedRef.current = true; setStarted(true);
				statusRef.current = 'ended'; setStatus(isWon(gameRef.current) ? 'won' : 'ended');
				setFinalScore(finalTime); setSubmitVal(undefined);
			} else {
				setAlreadyPlayed(false);
			}
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			apply(run.seed, run.diffIndex ?? dailyDifficultyIndex(), !!run.done, run.finalTime ?? null);
			return;
		}
		setAlreadyPlayed(false);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		apply(seed, diffIndex, false, null);
	}, [gameId]);

	/* ---------- Levels / progression ---------- */
	const startLevel = useCallback((level: number): void => {
		const cfg = lv.play(level);
		dailyRef.current = false;
		setDaily(false); setDailyLoading(false); setAlreadyPlayed(false);
		gameRef.current = deal(cfg.seed, cfg.draw, cfg.passes);
		initRef.current = null;
		resetCommon();
		startedRef.current = true; setStarted(true); // no Start gate; the chrono runs from the first move
		timerStartRef.current = clockRef.current; timerRunRef.current = true;
		setCards(foundationCount(gameRef.current));
		geoRef.current = null;
		trackGame(gameId, 'game_started', { level, mode: 'levels' });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv, gameId]);

	const armLevels = useCallback((): void => {
		dailyRef.current = false;
		setDaily(false);
		lv.enter();
	}, [lv]);

	const newDeal = (): void => { if (!dailyRef.current) startFree(diffKey); };
	const undo = (): void => {
		const prev = histRef.current.pop();
		if (!prev) return;
		gameRef.current = prev.s;
		movesRef.current = prev.m; // rewind the move counter too, so a solve's move count is honest
		jokersRef.current = prev.j; setJokers(prev.j); // a joker is refunded when its move is undone
		jokerSelRef.current = null; jokerArmedRef.current = false; setJokerArmed(false);
		dragRef.current = null;
		statusRef.current = 'playing'; setStatus('playing');
		sync();
	};
	const toggleJoker = (): void => {
		if (jokersRef.current <= 0 || !startedRef.current || statusRef.current !== 'playing') return;
		const next = !jokerArmedRef.current;
		jokerArmedRef.current = next; setJokerArmed(next);
		jokerSelRef.current = null; dragRef.current = null;
	};

	/* ---------- Pointer ---------- */
	const posFrom = (e: React.PointerEvent): { x: number; y: number } => {
		const cv = canvasRef.current!;
		const rect = cv.getBoundingClientRect();
		return { x: (e.clientX - rect.left) * (dimRef.current.w / rect.width), y: (e.clientY - rect.top) * (dimRef.current.h / rect.height) };
	};

	// Which pile/card is at (x,y)?
	type Hit = { kind: 'stock' } | { kind: 'waste' } | { kind: 'found'; suit: number } | { kind: 'tab'; col: number; idx: number };
	const hitTest = (x: number, y: number): Hit | null => {
		const geo = geoRef.current; if (!geo) return null;
		const g = gameRef.current;
		const { cardW, cardH } = geo;
		const inBox = (bx: number, by: number, bw = cardW, bh = cardH): boolean => x >= bx && x <= bx + bw && y >= by && y <= by + bh;
		if (inBox(geo.stock.x, geo.stock.y)) return { kind: 'stock' };
		const wasteW = cardW + Math.max(0, Math.min(g.drawCount, g.waste.length) - 1) * (cardW * 0.34); // cover the fan
		if (inBox(geo.waste.x, geo.waste.y, wasteW)) return { kind: 'waste' };
		for (let s = 0; s < 4; s++) if (inBox(geo.found[s].x, geo.found[s].y)) return { kind: 'found', suit: s };
		for (let col = 0; col < 7; col++) {
			const cx = geo.colX[col];
			if (x < cx || x > cx + cardW) continue;
			const pile = g.tableau[col];
			if (!pile.length) { if (y >= geo.tabTop && y <= geo.tabTop + cardH) return { kind: 'tab', col, idx: -1 }; continue; }
			for (let i = pile.length - 1; i >= 0; i--) {
				const cy = geo.cardY(col, i);
				const bottom = i === pile.length - 1 ? cy + cardH : geo.cardY(col, i + 1);
				if (y >= cy && y <= bottom) return { kind: 'tab', col, idx: i };
			}
			if (y >= geo.tabTop && y <= geo.tabTop + cardH) return { kind: 'tab', col, idx: pile.length - 1 };
		}
		return null;
	};

	// map a hit to a source we can pick up (returns src + the cards being moved), or null.
	// `loose` (joker mode) skips the valid-run requirement → any face-up card can be grabbed.
	const pickSource = (h: Hit, loose = false): { src: Src; cards: number[]; anchor: { x: number; y: number } } | null => {
		const g = gameRef.current; const geo = geoRef.current!;
		if (h.kind === 'waste') {
			if (!g.waste.length) return null;
			return { src: { kind: 'waste' }, cards: [g.waste[g.waste.length - 1]], anchor: { x: geo.waste.x, y: geo.waste.y } };
		}
		if (h.kind === 'tab' && h.idx >= 0) {
			const pile = g.tableau[h.col];
			if (!pile[h.idx].up || (!loose && !isRun(g, h.col, h.idx))) return null;
			return { src: { kind: 'tab', col: h.col, idx: h.idx }, cards: pile.slice(h.idx).map((t) => t.c), anchor: { x: geo.colX[h.col], y: geo.cardY(h.col, h.idx) } };
		}
		return null;
	};

	// Joker: relocate the selected source onto a tableau column (rules ignored). Consumes a joker.
	const applyJoker = (src: Src, target: Hit): boolean => {
		if (target.kind !== 'tab') return false;
		return doJoker(jokerToTableau(gameRef.current, src, target.col));
	};

	const applyDrop = (src: Src, target: Hit): boolean => {
		const g = gameRef.current;
		if (target.kind === 'found') {
			if (src.kind === 'waste') return commit(wasteToFoundation(g));
			if (src.kind === 'tab') return commit(tableauToFoundation(g, src.col));
		}
		if (target.kind === 'tab') {
			if (src.kind === 'waste') return commit(wasteToTableau(g, target.col));
			if (src.kind === 'tab') return commit(tableauToTableau(g, src.col, src.idx, target.col));
		}
		return false;
	};

	const onDown = (e: React.PointerEvent): void => {
		if (!startedRef.current || dailyLoading || statusRef.current !== 'playing') return;
		const p = posFrom(e);
		const h = hitTest(p.x, p.y);
		if (!h) { jokerSelRef.current = null; return; }
		if (jokerArmedRef.current) {
			// Joker: first tap picks a card, second tap picks the destination column (drag also works).
			if (jokerSelRef.current) {
				if (h.kind === 'tab') { if (applyJoker(jokerSelRef.current, h)) return; }
				jokerSelRef.current = null;
			}
			const picked = pickSource(h, true);
			if (!picked) return;
			jokerSelRef.current = picked.src;
			dragRef.current = { src: picked.src, cards: picked.cards, dx: p.x, dy: p.y, ox: p.x - picked.anchor.x, oy: p.y - picked.anchor.y, moved: false };
			canvasRef.current?.setPointerCapture(e.pointerId);
			return;
		}
		if (h.kind === 'stock') { commit(drawStock(gameRef.current)); return; }
		const picked = pickSource(h);
		if (!picked) return;
		dragRef.current = { src: picked.src, cards: picked.cards, dx: p.x, dy: p.y, ox: p.x - picked.anchor.x, oy: p.y - picked.anchor.y, moved: false };
		canvasRef.current?.setPointerCapture(e.pointerId);
	};
	const onMove = (e: React.PointerEvent): void => {
		const d = dragRef.current; if (!d) return;
		const p = posFrom(e);
		if (Math.hypot(p.x - d.dx, p.y - d.dy) > 6) d.moved = true;
		d.dx = p.x; d.dy = p.y;
	};
	const onUp = (e: React.PointerEvent): void => {
		const d = dragRef.current; dragRef.current = null;
		if (jokerArmedRef.current) {
			if (d && d.moved) { const h = hitTest(posFrom(e).x, posFrom(e).y); if (h && applyJoker(d.src, h)) return; }
			return; // tap or invalid drop → keep the source selected for a second tap
		}
		if (!d) return;
		const p = posFrom(e);
		if (d.moved) {
			const h = hitTest(p.x, p.y);
			if (h && applyDrop(d.src, h)) return;
			// dropped nowhere valid → fall back to an auto-move (feels forgiving)
			commit(autoMove(gameRef.current, d.src));
		} else {
			commit(autoMove(gameRef.current, d.src)); // tap
		}
	};

	/* ---------- Loop + sizing ---------- */
	useEffect(() => {
		startFree('facile');
		const resize = (): void => {
			const wrap = wrapRef.current, cv = canvasRef.current;
			if (!wrap || !cv) return;
			const fs = document.fullscreenElement != null || document.querySelector('.game-page.gf-full') != null;
			const w = clamp(wrap.clientWidth, 280, fs ? 1400 : 720);
			const h = fs ? Math.max(320, wrap.clientHeight) : Math.round(w * 0.66);
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h };
			cv.style.height = `${h}px`;
			cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			geoRef.current = null;
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		document.addEventListener('fullscreenchange', resize);
		let last = performance.now();
		const frame = (now: number): void => {
			clockRef.current += Math.min(now - last, 100); last = now;
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => { ro.disconnect(); document.removeEventListener('fullscreenchange', resize); cancelAnimationFrame(rafRef.current); };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// live chrono (daily + levels — both time the run)
	useEffect(() => {
		if (!daily && !lv.active) return;
		const id = setInterval(() => { if (timerRunRef.current && timerStartRef.current != null) setElapsed(clockRef.current - timerStartRef.current); }, 60);
		return () => clearInterval(id);
	}, [daily, lv.active]);

	/* ---------- Draw ---------- */
	const drawCardShape = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	};
	const drawCard = (ctx: CanvasRenderingContext2D, x: number, y: number, c: number, up: boolean): void => {
		const geo = geoRef.current!; const { cardW: w, cardH: h, radius: r } = geo;
		ctx.save();
		if (!up) {
			drawCardShape(ctx, x, y, w, h, r);
			ctx.fillStyle = '#2b4a8b'; ctx.fill();
			ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, w * 0.04);
			drawCardShape(ctx, x + w * 0.12, y + h * 0.1, w * 0.76, h * 0.8, r * 0.6); ctx.stroke();
			ctx.restore(); return;
		}
		drawCardShape(ctx, x, y, w, h, r);
		ctx.fillStyle = '#fbfbf7'; ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();
		const red = isRed(c);
		ctx.fillStyle = red ? '#c62828' : '#1b1b1b';
		ctx.textAlign = 'left'; ctx.textBaseline = 'top';
		ctx.font = `700 ${Math.round(h * 0.24)}px var(--font-body, system-ui), sans-serif`;
		ctx.fillText(RANKS[rankOf(c) - 1], x + w * 0.09, y + h * 0.06);
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.font = `${Math.round(h * 0.2)}px system-ui, sans-serif`;
		ctx.fillText(SUITS[suitOf(c)], x + w * 0.26, y + h * 0.42);
		ctx.font = `${Math.round(h * 0.4)}px system-ui, sans-serif`;
		ctx.globalAlpha = 0.9;
		ctx.fillText(SUITS[suitOf(c)], x + w * 0.6, y + h * 0.62);
		ctx.restore();
	};
	const drawSlot = (ctx: CanvasRenderingContext2D, x: number, y: number, label = ''): void => {
		const geo = geoRef.current!; const { cardW: w, cardH: h, radius: r } = geo;
		drawCardShape(ctx, x, y, w, h, r);
		ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
		ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
		if (label) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(h * 0.34)}px system-ui, sans-serif`; ctx.fillText(label, x + w / 2, y + h / 2); }
	};

	const draw = (): void => {
		const cv = canvasRef.current; if (!cv) return;
		const ctx = cv.getContext('2d'); if (!ctx) return;
		geoRef.current = computeGeo(); // recompute each frame so positions track the live game state
		const geo = geoRef.current; const g = gameRef.current;
		const { w, h } = dimRef.current;
		ctx.clearRect(0, 0, w, h);
		// felt
		ctx.fillStyle = '#1f7a46';
		drawCardShape(ctx, 0, 0, w, h, 14); ctx.fill();
		ctx.fillStyle = 'rgba(255,255,255,0.03)';
		for (let i = 0; i < 7; i++) { drawCardShape(ctx, geo.colX[i], geo.tabTop, geo.cardW, geo.cardH, geo.radius); ctx.fill(); }

		// stock
		if (g.stock.length) drawCard(ctx, geo.stock.x, geo.stock.y, 0, false);
		else drawSlot(ctx, geo.stock.x, geo.stock.y, g.passesLeft > 0 && g.waste.length ? '↻' : '∅');
		// waste (show up to 3 fanned when draw-3)
		if (g.waste.length) {
			const showN = Math.min(g.drawCount, g.waste.length); // fan the cards just drawn
			const off = geo.cardW * 0.34;
			for (let i = showN - 1; i >= 0; i--) drawCard(ctx, geo.waste.x + (showN - 1 - i) * off, geo.waste.y, g.waste[g.waste.length - 1 - i], true);
		} else drawSlot(ctx, geo.waste.x, geo.waste.y);
		// foundations
		for (let s = 0; s < 4; s++) {
			const f = g.foundations[s];
			if (f.length) drawCard(ctx, geo.found[s].x, geo.found[s].y, f[f.length - 1], true);
			else drawSlot(ctx, geo.found[s].x, geo.found[s].y, SUITS[s]);
		}
		// tableau (skip the cards currently being dragged)
		const drag = dragRef.current;
		for (let col = 0; col < 7; col++) {
			const pile = g.tableau[col];
			for (let i = 0; i < pile.length; i++) {
				if (drag && drag.moved && drag.src.kind === 'tab' && drag.src.col === col && i >= drag.src.idx) break;
				drawCard(ctx, geo.colX[col], geo.cardY(col, i), pile[i].c, pile[i].up);
			}
		}
		// joker mode: glow the picked source (two-tap), and outline every column as a drop target
		const jsel = jokerArmedRef.current ? jokerSelRef.current : null;
		if (jokerArmedRef.current) {
			ctx.strokeStyle = 'rgba(255,209,102,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
			for (let col = 0; col < 7; col++) { drawCardShape(ctx, geo.colX[col], geo.tabTop, geo.cardW, geo.cardH, geo.radius); ctx.stroke(); }
			ctx.setLineDash([]);
		}
		if (jsel && !(drag && drag.moved)) {
			const a = jsel.kind === 'waste' ? { x: geo.waste.x, y: geo.waste.y, n: 1 } : { x: geo.colX[jsel.col], y: geo.cardY(jsel.col, jsel.idx), n: g.tableau[jsel.col].length - jsel.idx };
			const pulse = 0.55 + 0.35 * Math.abs(Math.sin(clockRef.current / 240));
			ctx.strokeStyle = `rgba(255,209,102,${pulse})`; ctx.lineWidth = 3;
			drawCardShape(ctx, a.x - 2, a.y - 2, geo.cardW + 4, geo.cardH + (a.n - 1) * geo.cardH * 0.30 + 4, geo.radius); ctx.stroke();
		}
		// dragged stack follows the pointer
		if (drag && drag.moved) {
			const x = drag.dx - drag.ox, y = drag.dy - drag.oy;
			const step = geo.cardH * 0.30;
			drag.cards.forEach((c, i) => drawCard(ctx, x, y + i * step, c, true));
		}
	};

	/* ---------- Render ---------- */
	const centis = elapsed > 0 ? Math.round(elapsed / 10) : 0;
	const chrono = daily && finalScore != null ? fmtCentis(finalScore % 10_000_000) : fmtCentis(centis);
	const won = status === 'won';
	const lvCfg = lv.active ? reussiteLevels.config(lv.level) : null;

	return (
		<div className="reu-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); startFree(diffKey); } else startFree(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active ? (
				<div className="reu-dailytag">
					{lv.menu ? 'Progression — réussis une donne pour débloquer la suivante' : `Niveau ${lv.level} · ${lvCfg?.label}`}
				</div>
			) : daily ? (
				<div className="reu-dailytag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} (pioche ${DIFFS[diffKey].draw}) — un seul essai`}
				</div>
			) : (
				<div className="reu-pills" role="tablist" aria-label="Difficulté">
					{DIFF_KEYS.map((d) => (
						<button key={d} role="tab" aria-selected={diffKey === d} className={`reu-pill ${diffKey === d ? 'active' : ''}`} onClick={() => startFree(d)}>
							{DIFFS[d].label}
						</button>
					))}
				</div>
			)}

			{!(lv.active && lv.menu) && (
			<div className="reu-hud">
				<span className="reu-stat">Fondations <strong>{cards}/52</strong></span>
				{daily || lv.active ? (
					<span className="reu-stat">Chrono <strong>{chrono}</strong></span>
				) : (
					<span className="reu-stat">Record <strong>{best == null ? '—' : `${best}/52`}</strong></span>
				)}
			</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="reu-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className={`reu-canvas${started ? '' : ' reu-blur'}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
				{celebrating && <Celebration />}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={reussiteLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Résolu en ${fmtCentis(centis)} · ${movesRef.current} coups` : `${cards}/52 cartes montées`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}

				{dailyLoading && <div className="reu-overlay"><div className="reu-card">Préparation du défi…</div></div>}

				{!started && !dailyLoading && !lv.active && (
					<div className="reu-overlay">
						<div className="reu-card">
							<h3>Prêt&nbsp;?</h3>
							<p>Le chrono démarre dès que tu commences — un seul essai&nbsp;!</p>
							<button className="reu-btn primary" onClick={beginPlay}>▶ Commencer</button>
						</div>
					</div>
				)}

				{!lv.active && (showWin || (alreadyPlayed && (won || status === 'ended'))) && (
					<div className="reu-overlay">
						<div className="reu-card">
							{daily ? (
								<>
									<h3>{alreadyPlayed && !won ? '✓ Défi terminé' : won ? '🎉 Réussite !' : '✓ Défi relevé'}</h3>
									<p>
										<strong>{cards}/52</strong> cartes · <strong>{chrono}</strong>{jokers < JOKERS ? ` · 🃏${JOKERS - jokers}` : ''}.<br />
										Un seul essai&nbsp;: ton score est classé — reviens demain&nbsp;!
									</p>
								</>
							) : (
								<>
									<h3>🎉 Réussite&nbsp;!</h3>
									<p>Les 52 cartes sont rangées. Bravo&nbsp;!</p>
									<button className="reu-btn primary" onClick={newDeal}>↻ Nouvelle donne</button>
								</>
							)}
						</div>
					</div>
				)}

				{stuck && jokers === 0 && status === 'playing' && (
					<div className="reu-overlay">
						<div className="reu-card">
							<h3>Plus de coups possibles</h3>
							<p>Il reste <strong>{cards}/52</strong> cartes montées. {lv.active ? 'Annule pour tenter une autre voie, ou abandonne la donne.' : daily ? 'Annule pour tenter une autre voie, ou termine le défi.' : 'Annule pour retenter, ou relance une donne.'}</p>
							<div className="reu-cardbtns">
								<button className="reu-btn" onClick={undo}>↶ Annuler</button>
								{lv.active
									? <button className="reu-btn primary" onClick={() => finish(false)}>Abandonner</button>
									: daily
										? <button className="reu-btn primary" onClick={() => finish(false)}>Terminer &amp; classer</button>
										: <button className="reu-btn primary" onClick={newDeal}>↻ Nouvelle donne</button>}
							</div>
						</div>
					</div>
				)}
			</div>
			)}

			{!(lv.active && (lv.menu || lv.done)) && (
			<div className="reu-controls">
				<button className="reu-btn" onClick={undo} disabled={won || !started || alreadyPlayed}>↶ Annuler</button>
				<button className={`reu-btn ${jokerArmed ? 'armed' : ''}`} onClick={toggleJoker} disabled={jokers === 0 || won || !started || alreadyPlayed} title="Déplacement libre : pose une carte où tu veux (règles ignorées)">
					🃏 Joker ({jokers})
				</button>
				{lv.active
					? <button className="reu-btn" onClick={lv.backToMenu} disabled={won}>🗺 Carte</button>
					: daily
						? <button className="reu-btn" onClick={() => finish(false)} disabled={!started || won || alreadyPlayed}>🏁 Terminer</button>
						: <button className="reu-btn" onClick={newDeal}>🎴 Nouvelle donne</button>}
			</div>
			)}
			{jokerArmed && <p className="reu-jokerhint">🃏 Joker&nbsp;: choisis une carte, puis une colonne où la poser (couleur/rang ignorés).</p>}
			{stuck && !jokerArmed && jokers > 0 && status === 'playing' && <p className="reu-jokerhint">Bloqué&nbsp;? Utilise un joker 🃏 pour te débloquer.</p>}

			<p className="reu-help">
				{lv.active
					? 'Progression : chaque niveau est une donne graine. Range les 52 cartes pour valider le niveau ; les étoiles récompensent la rapidité (et un jeu net). La difficulté monte (pioche 1 → 3, passes limitées sur la fin).'
					: daily
						? 'Défi du jour : la même donne pour tout le monde, un seul essai. Monte un maximum de cartes aux fondations — le temps départage les ex æquo.'
						: 'Touche une carte pour l’envoyer automatiquement (une fondation en priorité), ou fais-la glisser. Empile en descendant et en alternant les couleurs ; une colonne vide n’accueille qu’un Roi.'}
			</p>

			{daily ? (
				<Leaderboard key={`lb-${gameId}-${attempt}`} game={`${gameId}-t`} metric="time" submitValue={submitVal} format={(v) => formatScore(LB_FMT, v)} />
			) : !lv.active ? (
				<LeaderboardCorner game={`${gameId}-t`} metric="time" format={(v) => formatScore(LB_FMT, v)} />
			) : null}
		</div>
	);
}

const CSS = `
.reu-root { --reu: var(--accent-regular); width: 100%; max-width: 720px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.game-page.gf-full .reu-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .reu-playwrap { flex: 1; min-height: 0; max-width: none; }
.game-page.gf-full .reu-help { display: none; }
.reu-dailytag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.55rem; }
.reu-pills { display: flex; gap: 6px; margin-bottom: 0.55rem; }
.reu-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer; }
.reu-pill.active { background: var(--reu); color: var(--accent-text-over); border-color: var(--reu); }
.reu-hud { display: flex; gap: 0.5rem; font-size: 14px; font-weight: 600; margin-bottom: 0.6rem; }
.reu-stat { background: var(--gray-900); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.reu-stat strong { margin-left: 4px; color: var(--reu); }
.reu-playwrap { position: relative; width: 100%; max-width: 720px; display: flex; justify-content: center; }
.reu-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 14px; box-shadow: var(--shadow-md); cursor: pointer; }
.reu-canvas.reu-blur { filter: blur(7px); cursor: default; }
.reu-overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.42); backdrop-filter: blur(3px); border-radius: 14px; }
.reu-card { background: var(--gray-999); border: 2px solid var(--reu); border-radius: 16px; padding: 18px 22px; max-width: 20rem; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0); }
.reu-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.reu-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.5; margin: 0 0 0.9rem; }
.reu-cardbtns { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.reu-controls { display: flex; gap: 8px; margin-top: 0.8rem; flex-wrap: wrap; justify-content: center; }
.reu-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
.reu-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.reu-btn.primary { background: var(--reu); color: var(--accent-text-over); border-color: var(--reu); }
.reu-btn.armed { background: #ffd166; color: #3a2c00; border-color: #ffd166; box-shadow: 0 0 0 3px rgba(255,209,102,0.35); }
.reu-jokerhint { text-align: center; color: #ffd166; font-size: 12.5px; font-weight: 600; margin-top: 0.5rem; }
.reu-help { max-width: 640px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
