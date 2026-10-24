import { useState, useEffect, useRef, useCallback } from 'react';
import {
	COLS,
	ROWS,
	around,
	createGame,
	dropDistance,
	endTurn,
	fall,
	groundAt,
	hardDrop,
	lockPiece,
	move,
	nextPiece,
	pieceCells,
	pileHeight,
	resolveWave,
	rotate,
	spawn,
	toggleFlag,
	digPioche,
	scanRadar,
	spendSablier,
	type Booster,
	type Dig,
	type EclatsCfg,
	type Gem,
	type GemKind,
	type Piece,
	type State,
	type Wave,
} from './engine';
import { eclatsLevels, TIERS, TIER_ORDER, WORLDS, worldOf, type TierKey } from './levels';
import { encodePacked, fmtCentis, formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import { trackGame } from '../../lib/analytics';
import { isTypingTarget } from '../../lib/keyboard';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun, type DailyRun } from '../../lib/leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import DailyDone from '../../components/DailyDone';
import GiveUp from '../../components/GiveUp';
import { useLevels } from '../../lib/useLevels';
import { usePlayClock } from '../../lib/usePlayClock';
import { usePointerDrag } from '../usePointerDrag';
import { useHoldButton } from '../useHoldButton';
import { withExpert } from '../../lib/difficulty';

/* =====================================================
   ÉCLATS — React island (SVG + rAF loop).
   Steer the falling gems, line up three, dig the ground below, read its numbers and unearth
   every treasure before the pile reaches the top. Engine lives in ./engine (pure, tested).
   Niveaux: five worlds, stars by pieces. Défi du jour: one shared ground, one attempt, ranked
   by pieces then time. Libre: endless, a new ground each time one is cleared, scored in points.
   ===================================================== */

type Mode = 'levels' | 'daily' | 'free';
type Phase = 'ready' | 'fall' | 'resolve' | 'over';

const U = 10; // SVG units per cell
const GRASS = 3; // strip between the board and the ground
const LAND_MS = 90; // pause between a piece landing and its first burst
const WAVE_MS = 300; // one wave of bursts, then the fall
const STONE_MS = 380;
const SABLIER_MS = 20_000;
const REPEAT_DELAY = 170;
const REPEAT_MS = 70;
const LB_ID = (gameId: string): string => `${gameId}-t`;
const recordKey = (t: TierKey): string => `eclats-libre-${t}`;

/** Gem colours, each with its own cut so they read without the colours. */
const GEMS = [
	{ fill: '#ec4f73', dark: '#a3203f', name: 'rubis' },
	{ fill: '#3f91f2', dark: '#1d4f9e', name: 'saphir' },
	{ fill: '#33c27a', dark: '#167444', name: 'émeraude' },
	{ fill: '#f6b92e', dark: '#a56d09', name: 'topaze' },
	{ fill: '#a970f2', dark: '#5b2ea6', name: 'améthyste' },
];
const NUM_COLOURS = ['', '#58b0ff', '#4fd17c', '#ff6b6b', '#c08cff', '#ffb347', '#ff7ad9', '#ffffff', '#ffffff'];
const BOOSTER_INFO: Record<Booster, { icon: string; label: string; tip: string }> = {
	pioche: { icon: '⛏️', label: 'Pioche', tip: 'Touche une case du sol : elle est creusée, même tout au fond.' },
	radar: { icon: '📡', label: 'Radar', tip: 'Touche une case cachée : elle montre ce qu’elle contient, sans être creusée.' },
	sablier: { icon: '⏳', label: 'Sablier', tip: 'La chute est deux fois plus lente pendant 20 secondes.' },
};

const star = (r: number, n: number, inner: number): string => {
	const pts: string[] = [];
	for (let i = 0; i < n * 2; i++) {
		const a = (Math.PI * i) / n - Math.PI / 2;
		const rad = i % 2 === 0 ? r : inner;
		pts.push(`${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`);
	}
	return `M${pts.join('L')}Z`;
};
const poly = (r: number, n: number, rot: number): string => {
	const pts: string[] = [];
	for (let i = 0; i < n; i++) {
		const a = (Math.PI * 2 * i) / n + rot;
		pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
	}
	return `M${pts.join('L')}Z`;
};
const CUTS = [
	'', // the ruby is a plain round stone (circle)
	'M0,-4.6L4.6,0L0,4.6L-4.6,0Z',
	poly(4.4, 6, Math.PI / 6),
	'M0,-4.4L4.5,3.4L-4.5,3.4Z',
	star(4.8, 5, 2.3),
];

/* ---------- Daily save ---------- */

const GEN_V = 1;
const KINDS: GemKind[] = ['gem', 'bomb', 'rainbow', 'stone'];

interface SavedRun {
	v: number;
	board: ([number, number, number, number] | null)[];
	dug: number[];
	seen: number[];
	flag: number[];
	hard: number[];
	found: number;
	score: number;
	pieceIndex: number;
	placed: number;
	boosters: Record<Booster, number>;
	bag: number;
	stones: number;
}

function packRun(s: State, placed: number): SavedRun {
	return {
		v: GEN_V,
		board: s.board.map((g) => (g ? [g.color, KINDS.indexOf(g.kind), g.ice ? 1 : 0, g.lock ? 1 : 0] : null)),
		dug: Array.from(s.ground.dug),
		seen: Array.from(s.ground.seen),
		flag: Array.from(s.ground.flag),
		hard: Array.from(s.ground.hard),
		found: s.found,
		score: s.score,
		pieceIndex: s.pieceIndex,
		placed,
		boosters: { ...s.boosters },
		bag: s.boosterBag,
		stones: s.pendingStones,
	};
}

/** Rebuild a saved attempt on its own ground. Null if it belongs to another version or ground. */
function unpackRun(saved: unknown, cfg: EclatsCfg): { s: State; placed: number } | null {
	const o = saved as SavedRun | null;
	if (!o || o.v !== GEN_V || !Array.isArray(o.board) || o.board.length !== COLS * ROWS) return null;
	const s = createGame(cfg);
	if (o.dug.length !== s.ground.dug.length) return null;
	s.board = o.board.map((g) => (g ? { id: s.nextId++, color: g[0], kind: KINDS[g[1]] ?? 'gem', ice: !!g[2], lock: !!g[3] } : null));
	s.ground.dug.set(o.dug);
	s.ground.seen.set(o.seen);
	s.ground.flag.set(o.flag);
	s.ground.hard.set(o.hard);
	s.found = o.found;
	s.score = o.score;
	s.boosters = { ...o.boosters };
	s.boosterBag = o.bag;
	s.pendingStones = o.stones;
	s.pieceIndex = Math.max(0, o.pieceIndex - 1);
	spawn(s);
	return { s, placed: o.placed };
}

/* ---------- Drawing ---------- */

function GemShape({ g, x, y, ghost = false }: { g: Pick<Gem, 'color' | 'kind' | 'ice' | 'lock'>; x: number; y: number; ghost?: boolean }) {
	const cx = x + U / 2;
	const cy = y + U / 2;
	if (g.kind === 'stone') {
		return (
			<g transform={`translate(${cx} ${cy})`}>
				<rect className="ec-stone" x={-4.6} y={-4.6} width={9.2} height={9.2} rx={2} />
				<circle cx={-1.6} cy={-1.2} r={0.9} className="ec-stone-dot" />
				<circle cx={1.8} cy={1.6} r={1.2} className="ec-stone-dot" />
			</g>
		);
	}
	const c = GEMS[g.color % GEMS.length];
	const cut = CUTS[g.color % CUTS.length];
	const body = g.kind === 'rainbow' ? (
		<g>
			{GEMS.map((k, i) => {
				const a0 = (i / GEMS.length) * Math.PI * 2 - Math.PI / 2;
				const a1 = ((i + 1) / GEMS.length) * Math.PI * 2 - Math.PI / 2;
				return (
					<path
						key={i}
						d={`M0,0L${(Math.cos(a0) * 4.5).toFixed(2)},${(Math.sin(a0) * 4.5).toFixed(2)}A4.5,4.5 0 0 1 ${(Math.cos(a1) * 4.5).toFixed(2)},${(Math.sin(a1) * 4.5).toFixed(2)}Z`}
						fill={k.fill}
					/>
				);
			})}
			<circle r={4.5} className="ec-rim" />
			<path d={star(2.2, 4, 0.7)} fill="#fff" />
		</g>
	) : cut ? (
		<path d={cut} fill={c.fill} stroke={c.dark} strokeWidth={0.55} strokeLinejoin="round" />
	) : (
		<circle r={4.4} fill={c.fill} stroke={c.dark} strokeWidth={0.55} />
	);
	return (
		<g transform={`translate(${cx} ${cy})`} className={ghost ? 'ec-ghost' : undefined}>
			{body}
			{!ghost && g.kind !== 'rainbow' && <ellipse cx={-1.4} cy={-1.7} rx={1.6} ry={0.9} fill="#fff" opacity={0.55} transform="rotate(-30 -1.4 -1.7)" />}
			{g.kind === 'bomb' && (
				<g className="ec-bomb">
					<circle r={2.1} fill="#1d1d24" stroke="#fff" strokeWidth={0.45} />
					<path d={star(1.3, 4, 0.45)} fill="#ffe27a" transform="translate(1.6 -1.9)" />
				</g>
			)}
			{g.ice && <rect className="ec-ice" x={-4.9} y={-4.9} width={9.8} height={9.8} rx={2.2} />}
			{g.lock && (
				<g className="ec-lock">
					<rect x={-4.9} y={-4.9} width={9.8} height={9.8} rx={2.2} className="ec-lock-ring" />
					<path d="M1.6,1.1v-1a1.6,1.6 0 0 1 3.2,0v1" fill="none" transform="translate(-1.6 0)" />
					<rect x={-1.6} y={1} width={3.2} height={2.6} rx={0.5} />
				</g>
			)}
		</g>
	);
}

function Chest({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x + U / 2} ${y + U / 2})`} className="ec-chest">
			<rect x={-3.6} y={-1.2} width={7.2} height={4.4} rx={0.8} fill="#c98a2b" stroke="#6b4310" strokeWidth={0.5} />
			<path d="M-3.6,-1.2a3.6,2.4 0 0 1 7.2,0z" fill="#e6a93a" stroke="#6b4310" strokeWidth={0.5} />
			<rect x={-0.7} y={-0.5} width={1.4} height={1.8} rx={0.3} fill="#ffe27a" />
			<path d={star(1.4, 4, 0.4)} fill="#fff7c2" transform="translate(2.6 -3)" />
		</g>
	);
}

function Spikes({ x, y, faint = false }: { x: number; y: number; faint?: boolean }) {
	return (
		<g transform={`translate(${x + U / 2} ${y + U / 2})`} opacity={faint ? 0.75 : 1}>
			<path d="M-4,3L-2.4,-2.6L-0.8,3L0.8,-3.4L2.4,3L4,-1.8L4,3.4L-4,3.4Z" fill="#e5484d" stroke="#7a1418" strokeWidth={0.45} strokeLinejoin="round" />
		</g>
	);
}

/** Pebbles scattered on each earth cell, the same every render. */
const pebbles = (i: number): { x: number; y: number; r: number }[] => {
	const h = (k: number): number => (((i + 1) * 2654435761 + k * 40503) >>> 0) % 1000 / 1000;
	return [0, 1, 2].map((k) => ({ x: 1.5 + h(k) * 7, y: 1.5 + h(k + 7) * 7, r: 0.45 + h(k + 13) * 0.6 }));
};

/** The next piece, centred in a small frame. */
function NextPiece({ p }: { p: Piece }) {
	const cells = pieceCells({ ...p, x: 0, y: 0 });
	const cs = cells.map((x) => x.c);
	const rs = cells.map((x) => x.r);
	const ox = (-(Math.min(...cs) + Math.max(...cs) + 1) * U) / 2;
	const oy = (-(Math.min(...rs) + Math.max(...rs) + 1) * U) / 2;
	return (
		<span className="ec-next" aria-label="Pièce suivante">
			<svg viewBox="-16 -16 32 32" width="34" height="34" aria-hidden="true">
				{cells.map(({ r, c, color }, i) => (
					<GemShape key={i} g={{ color, kind: 'gem', ice: false, lock: false }} x={c * U + ox} y={r * U + oy} />
				))}
			</svg>
		</span>
	);
}

/* ---------- The game ---------- */

interface Fx {
	id: number;
	pops: { r: number; c: number; color: number; kind: GemKind }[];
	digs: Dig[];
	specials: { r: number; c: number }[];
	chain: number;
}

export default function EclatsGame({ gameId }: { gameId: string }) {
	const [, setTick] = useState(0);
	const bump = useCallback(() => setTick((t) => t + 1), []);
	const [mode, setMode] = useState<Mode>('free');
	const [tierKey, setTierKey] = useState<TierKey>('facile');
	const [phase, setPhase] = useState<Phase>('ready');
	const [aim, setAim] = useState<Booster | null>(null);
	const [fx, setFx] = useState<Fx | null>(null);
	const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const [record, setRecord] = useState(0);
	const [newRecord, setNewRecord] = useState(false);
	const [slowLeft, setSlowLeft] = useState(0);
	const [round, setRound] = useState(0); // one per deal: gem ids restart, their keys must not

	const sRef = useRef<State | null>(null);
	const phaseRef = useRef<Phase>('ready');
	const modeRef = useRef<Mode>('free');
	const aimRef = useRef<Booster | null>(null);
	const placedRef = useRef(0);
	const softRef = useRef(false);
	const slowRef = useRef(0);
	const waitRef = useRef(0);
	const startRef = useRef(0);
	const lastRef = useRef(0);
	const hiddenRef = useRef(false);
	const menuRef = useRef(false);
	const fxId = useRef(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const onEndRef = useRef<(s: State) => void>(() => {});
	const saveRef = useRef<() => void>(() => {});
	phaseRef.current = phase;
	modeRef.current = mode;
	aimRef.current = aim;

	const lv = useLevels(gameId, eclatsLevels);
	menuRef.current = lv.menu;
	const s = sRef.current;
	const timed = mode !== 'free';

	const setPh = useCallback((p: Phase) => {
		phaseRef.current = p;
		setPhase(p);
	}, []);

	/** Deal a fresh game on `cfg`. `go` starts the fall at once (free play); else the ready gate. */
	const deal = useCallback((cfg: EclatsCfg, opts: { endless?: boolean; go?: boolean } = {}) => {
		sRef.current = createGame(cfg, { endless: opts.endless });
		placedRef.current = 0;
		slowRef.current = 0;
		softRef.current = false;
		waitRef.current = 0;
		setSlowLeft(0);
		setAim(null);
		setFx(null);
		setToast(null);
		setGaveUp(false);
		setNewRecord(false);
		setElapsed(0);
		setRound((r) => r + 1);
		startRef.current = Date.now();
		setPh(opts.go ? 'fall' : 'ready');
		bump();
	}, [bump, setPh]);

	/* Free play: endless, the fall starts as soon as the board shows. */
	const newFree = useCallback((t: TierKey) => {
		setMode('free');
		modeRef.current = 'free';
		setTierKey(t);
		setAlreadyPlayed(false);
		setDailyLoading(false);
		try { setRecord(Number(localStorage.getItem(recordKey(t)) || 0)); } catch { setRecord(0); }
		deal({ ...TIERS[t].cfg, seed: (Math.random() * 2 ** 32) >>> 0 }, { endless: true, go: true });
		trackGame(gameId, 'game_started');
	}, [deal, gameId]);

	useEffect(() => {
		newFree('facile');
	}, [newFree]);

	/* Levels */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setMode('levels');
		modeRef.current = 'levels';
		setAlreadyPlayed(false);
		deal(cfg);
	}, [lv, deal]);

	const armLevels = useCallback(() => {
		lv.enter();
	}, [lv]);
	const closeLevels = useCallback(() => { if (!lv.close()) newFree(tierKey); }, [lv, newFree, tierKey]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Daily: one attempt per device, resumable. */
	const startDaily = useCallback(async () => {
		setMode('daily');
		modeRef.current = 'daily';
		setGaveUp(false);
		const run = loadDailyRun(gameId);
		const tierOf = (i: number): TierKey => TIER_ORDER[i] ?? 'facile';
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			dailySeedRef.current = { seed: run.seed, diffIndex };
			const t = tierOf(diffIndex);
			setTierKey(t);
			setDailyLoading(false);
			const cfg = { ...TIERS[t].cfg, seed: run.seed };
			const back = unpackRun(run.state, cfg);
			deal(cfg);
			if (back) {
				sRef.current = back.s;
				placedRef.current = back.placed;
			}
			if (run.done) {
				setAlreadyPlayed(true);
				setGaveUp(!!run.abandoned);
				setElapsed(run.finalTime ?? 0);
				const st = sRef.current!;
				if (!run.abandoned) st.status = 'won';
				else st.status = 'lost';
				setPh('over');
			} else {
				setAlreadyPlayed(false);
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
				setPh('fall');
			}
			bump();
			return;
		}
		setAlreadyPlayed(false);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const t = tierOf(diffIndex);
		setTierKey(t);
		deal({ ...TIERS[t].cfg, seed });
		setDailyLoading(false);
	}, [gameId, deal, bump, setPh]);

	/* ▶ Commencer: starts the fall and the chrono; in the daily it spends the attempt. */
	const begin = useCallback(() => {
		const st = sRef.current;
		if (!st || phaseRef.current !== 'ready') return;
		startRef.current = Date.now();
		lastRef.current = performance.now();
		setElapsed(0);
		setPh('fall');
		trackGame(gameId, 'game_started');
		if (modeRef.current === 'daily') {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: packRun(st, 0) });
		}
	}, [gameId, setPh]);

	/* ---------- Effects of a wave ---------- */

	const say = useCallback((text: string) => setToast({ id: ++fxId.current, text }), []);

	const showDigs = useCallback((digs: Dig[]) => {
		const got = digs.filter((d) => d.treasure);
		const prizes = digs.map((d) => d.booster).filter((b): b is Booster => !!b);
		if (got.length) {
			say(prizes.length
				? `💎 Trésor ! +1 ${prizes.map((b) => `${BOOSTER_INFO[b].icon} ${BOOSTER_INFO[b].label}`).join(', ')}`
				: '💎 Trésor !');
		} else if (digs.some((d) => d.trap)) say('⚠️ Un piège : une ligne de pierres arrive');
	}, [say]);

	const showWave = useCallback((w: Wave) => {
		setFx({ id: ++fxId.current, pops: w.popped, digs: w.digs, specials: w.specials, chain: w.chain });
		showDigs(w.digs);
	}, [showDigs]);

	/* ---------- Loop ---------- */

	const lock = useCallback((st: State) => {
		lockPiece(st);
		placedRef.current++;
		waitRef.current = LAND_MS;
		setPh('resolve');
	}, [setPh]);

	useEffect(() => {
		let raf = 0;
		let lastY = -99;
		const frame = (now: number) => {
			const dt = Math.min(50, now - (lastRef.current || now));
			lastRef.current = now;
			const st = sRef.current;
			const ph = phaseRef.current;
			const paused = hiddenRef.current || menuRef.current || aimRef.current !== null;
			if (st && !paused) {
				if (ph === 'fall' && st.status === 'playing' && st.piece) {
					if (slowRef.current > 0) {
						slowRef.current = Math.max(0, slowRef.current - dt);
						if (slowRef.current === 0) setSlowLeft(0);
					}
					if (fall(st, dt, softRef.current, slowRef.current > 0 ? 2 : 1)) {
						lock(st);
						bump();
					} else if (st.piece && st.piece.y !== lastY) {
						lastY = st.piece.y;
						bump();
					}
				} else if (ph === 'fall' && st.status !== 'playing') {
					// A pickaxe found the last treasure between two pieces.
					setPh('over');
					onEndRef.current(st);
					bump();
				} else if (ph === 'resolve') {
					waitRef.current -= dt;
					if (waitRef.current <= 0) {
						const w = resolveWave(st);
						if (w) {
							showWave(w);
							waitRef.current = WAVE_MS;
						} else if (endTurn(st)) {
							waitRef.current = STONE_MS;
						} else if (st.status !== 'playing') {
							setPh('over');
							onEndRef.current(st);
						} else {
							lastY = -99;
							setPh('fall');
							saveRef.current();
						}
						bump();
					}
				}
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [bump, lock, setPh, showWave]);

	/* Tab hidden: freeze the fall. The chrono is paused by usePlayClock. */
	useEffect(() => {
		const onVis = () => {
			hiddenRef.current = document.hidden;
			lastRef.current = performance.now();
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, []);

	const ticking = phase === 'fall' || phase === 'resolve';
	usePlayClock(startRef, ticking, mode === 'daily' ? gameId : null);
	useEffect(() => {
		if (!ticking) return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 100);
		return () => clearInterval(id);
	}, [ticking]);

	/* Endless mode: say so when a ground is cleared. */
	const field = s?.field ?? 0;
	useEffect(() => {
		if (field > 0) say(`🎉 Sol vidé ! +${500 * field} points, nouveau sol`);
	}, [field, say]);

	/* ---------- End of a run ---------- */

	onEndRef.current = (st: State) => {
		const centis = Math.round((Date.now() - startRef.current) / 10);
		setElapsed(centis);
		const m = modeRef.current;
		if (m === 'levels') {
			lv.finish({ won: st.status === 'won', score: placedRef.current, raw: { points: st.score, centis } });
		} else if (m === 'daily') {
			const sd = dailySeedRef.current;
			const snapshot: DailyRun = {
				startedAt: startRef.current,
				done: true,
				finalTime: centis,
				abandoned: st.status !== 'won',
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: packRun(st, placedRef.current),
			};
			saveDailyRun(gameId, snapshot);
			setAlreadyPlayed(true);
		} else {
			if (st.score > record) {
				try { localStorage.setItem(recordKey(tierKey), String(st.score)); } catch { /* private mode */ }
				setRecord(st.score);
				setNewRecord(true);
			}
		}
		trackGame(gameId, st.status === 'won' ? 'game_won' : 'game_over', { score: st.score });
	};

	saveRef.current = () => {
		const st = sRef.current;
		if (modeRef.current !== 'daily' || !st) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: sd?.seed, diffIndex: sd?.diffIndex, state: packRun(st, placedRef.current) });
	};

	const giveUp = useCallback(() => {
		const st = sRef.current;
		if (!st) return;
		st.status = 'lost';
		setGaveUp(true);
		setPh('over');
		onEndRef.current(st);
		bump();
		trackGame(gameId, 'solution_shown');
	}, [bump, gameId, setPh]);

	/* ---------- Steering ---------- */

	const canSteer = (): State | null => {
		const st = sRef.current;
		if (!st || phaseRef.current !== 'fall' || st.status !== 'playing' || !st.piece) return null;
		if (aimRef.current || menuRef.current) return null;
		return st;
	};

	const doMove = useCallback((dx: number) => { const st = canSteer(); if (st && move(st, dx)) bump(); }, [bump]);
	const doRotate = useCallback(() => { const st = canSteer(); if (st && rotate(st)) bump(); }, [bump]);
	const doDrop = useCallback(() => {
		const st = canSteer();
		if (!st) return;
		hardDrop(st);
		lock(st);
		bump();
	}, [bump, lock]);

	/* Keyboard */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
			if (phaseRef.current === 'ready' && (k === ' ' || k === 'Enter') && !menuRef.current) {
				e.preventDefault();
				begin();
				return;
			}
			if (k === 'ArrowLeft' || k === 'q' || k === 'a') { e.preventDefault(); doMove(-1); }
			else if (k === 'ArrowRight' || k === 'd') { e.preventDefault(); doMove(1); }
			else if (!e.repeat && (k === 'ArrowUp' || k === 'z' || k === 'w' || k === 'x')) { e.preventDefault(); doRotate(); }
			else if (k === 'ArrowDown' || k === 's') { e.preventDefault(); softRef.current = true; }
			else if (!e.repeat && k === ' ') { e.preventDefault(); doDrop(); }
			else if (k === 'Escape' && aimRef.current) setAim(null);
		};
		const onUp = (e: KeyboardEvent) => {
			const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
			if (k === 'ArrowDown' || k === 's') softRef.current = false;
		};
		const clear = () => { softRef.current = false; };
		window.addEventListener('keydown', onKey, { passive: false });
		window.addEventListener('keyup', onUp);
		window.addEventListener('blur', clear);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('keyup', onUp);
			window.removeEventListener('blur', clear);
		};
	}, [begin, doMove, doRotate, doDrop]);

	/* Buttons under the board: ◀ ▶ repeat while held, ⟳ and ⤓ act on the press. */
	const repeatRef = useRef<{ t: ReturnType<typeof setTimeout> | null; i: ReturnType<typeof setInterval> | null }>({ t: null, i: null });
	const stopRepeat = useCallback(() => {
		const r = repeatRef.current;
		if (r.t) clearTimeout(r.t);
		if (r.i) clearInterval(r.i);
		r.t = null;
		r.i = null;
	}, []);
	const startRepeat = useCallback((dx: number) => {
		stopRepeat();
		doMove(dx);
		repeatRef.current.t = setTimeout(() => {
			repeatRef.current.i = setInterval(() => doMove(dx), REPEAT_MS);
		}, REPEAT_DELAY);
	}, [doMove, stopRepeat]);
	useEffect(() => stopRepeat, [stopRepeat]);
	const holdLeft = useHoldButton(() => startRepeat(-1), stopRepeat);
	const holdRight = useHoldButton(() => startRepeat(1), stopRepeat);
	const holdRotate = useHoldButton(doRotate, () => {});
	const holdDrop = useHoldButton(doDrop, () => {});

	/* Touch on the board: slide to move, tap to turn, flick down to drop. On the ground: mark a
	   cell, or aim the booster in hand. */
	const gesture = useRef<{ x: number; y: number; t: number; px: number; ground: boolean; moved: boolean; down: boolean } | null>(null);
	const toBoard = (clientX: number, clientY: number): { x: number; y: number; scale: number } | null => {
		const el = svgRef.current;
		const m = el?.getScreenCTM();
		if (!el || !m) return null;
		const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
		return { x: p.x, y: p.y, scale: m.a };
	};
	const groundCell = (x: number, y: number): { r: number; c: number } | null => {
		const st = sRef.current;
		if (!st) return null;
		const gy = y - (ROWS * U + GRASS);
		const r = Math.floor(gy / U);
		const c = Math.floor(x / U);
		if (r < 0 || r >= st.ground.depth || c < 0 || c >= COLS) return null;
		return { r, c };
	};
	const onPress = (cx: number, cy: number) => {
		const p = toBoard(cx, cy);
		const st = sRef.current;
		if (!p || !st) return;
		gesture.current = { x: cx, y: cy, t: performance.now(), px: st.piece?.x ?? 0, ground: p.y > ROWS * U, moved: false, down: false };
	};
	const onDrag = (cx: number, cy: number) => {
		const g = gesture.current;
		const p = toBoard(cx, cy);
		const st = canSteer();
		if (!g || g.ground || !p || !st || !st.piece) return;
		const cell = U * p.scale; // one cell in CSS pixels
		const dx = cx - g.x;
		const dy = cy - g.y;
		if (dy > cell * 2 && Math.abs(dx) < dy * 0.6) g.down = true;
		if (g.down) return;
		const want = g.px + Math.round(dx / cell);
		let guard = COLS;
		while (st.piece && st.piece.x !== want && guard-- > 0) {
			if (!move(st, Math.sign(want - st.piece.x))) break;
			g.moved = true;
		}
		if (g.moved) bump();
	};
	const onRelease = (cx: number, cy: number) => {
		const g = gesture.current;
		gesture.current = null;
		if (!g) return;
		const dist = Math.hypot(cx - g.x, cy - g.y);
		const quick = performance.now() - g.t < 450;
		if (g.ground) {
			if (dist > 12) return;
			const p = toBoard(cx, cy);
			const cell = p && groundCell(p.x, p.y);
			if (cell) onGround(cell.r, cell.c);
			return;
		}
		if (g.down && quick) doDrop();
		else if (!g.moved && dist < 10 && quick) doRotate();
	};
	const drag = usePointerDrag(onPress, onDrag, onRelease);

	/* Ground taps: a booster in hand, else a flag. */
	const onGround = (r: number, c: number) => {
		const st = sRef.current;
		if (!st || st.status !== 'playing' || (phaseRef.current !== 'fall' && phaseRef.current !== 'resolve')) return;
		const b = aimRef.current;
		if (b === 'pioche') {
			const d = digPioche(st, r, c);
			if (!d) return;
			setAim(null);
			setFx({ id: ++fxId.current, pops: [], digs: [d], specials: [], chain: 0 });
			showDigs([d]);
			trackGame(gameId, 'hint_used', { booster: 'pioche' });
		} else if (b === 'radar') {
			if (!scanRadar(st, r, c)) return;
			setAim(null);
			trackGame(gameId, 'hint_used', { booster: 'radar' });
		} else if (!toggleFlag(st, r, c)) return;
		bump();
	};

	const pickBooster = (b: Booster) => {
		const st = sRef.current;
		if (!st || st.status !== 'playing' || st.boosters[b] <= 0 || phaseRef.current === 'ready' || phaseRef.current === 'over') return;
		if (b === 'sablier') {
			if (!spendSablier(st)) return;
			slowRef.current = SABLIER_MS;
			setSlowLeft(SABLIER_MS);
			say('⏳ Chute ralentie pendant 20 secondes');
			trackGame(gameId, 'hint_used', { booster: 'sablier' });
			bump();
			return;
		}
		setAim(aimRef.current === b ? null : b);
	};

	/* Test hook for scripts/check-eclats.mjs: read the run, and place a piece directly. */
	useEffect(() => {
		const w = window as unknown as { __eclats?: unknown };
		w.__eclats = {
			get state() {
				const st = sRef.current;
				return st && {
					phase: phaseRef.current, status: st.status, mode: modeRef.current, found: st.found, treasures: st.cfg.treasures,
					placed: placedRef.current, score: st.score, height: pileHeight(st), aim: aimRef.current,
					piece: st.piece && { x: st.piece.x, y: st.piece.y, rot: st.piece.rot, shape: st.piece.shape },
					boosters: { ...st.boosters }, dug: Array.from(st.ground.dug), flag: Array.from(st.ground.flag), depth: st.ground.depth,
				};
			},
			place(x: number, rot: number) {
				const st = canSteer();
				if (!st || !st.piece) return false;
				for (let k = 0; k < rot; k++) rotate(st);
				let guard = COLS;
				while (st.piece.x !== x && guard-- > 0 && move(st, Math.sign(x - st.piece.x)));
				doDrop();
				return true;
			},
		};
		return () => { delete w.__eclats; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---------- Render ---------- */

	const depth = s?.ground.depth ?? 4;
	const W = COLS * U;
	const BH = ROWS * U;
	const GY = BH + GRASS; // top of the ground
	const H = GY + depth * U;
	const piece = s?.piece ?? null;
	const ghostDrop = s && piece && phase === 'fall' ? dropDistance(s) : 0;
	const danger = s ? pileHeight(s) >= ROWS - 3 : false;
	const traps = (s?.cfg.traps ?? 0) > 0;
	const over = phase === 'over';
	const won = s?.status === 'won';
	const reveal = over && (gaveUp || (mode !== 'free' && !won)); // a lost level shows where the treasures were
	const dailyScore = encodePacked(10_000_000, [placedRef.current, Math.min(9_999_999, elapsed)]);
	const fmtPacked = (v: number): string => formatScore(DAILY_LB.eclats.fmt, v);
	const world = mode === 'levels' ? worldOf(lv.level) : null;
	const novelty = world && lv.level < world.from + 3 ? world.novelty : '';
	const cfgLv = mode === 'levels' && lv.playing ? eclatsLevels.config(lv.level) : null;
	const next = s && s.status === 'playing' ? nextPiece(s) : null;

	const pieceView = (p: Piece, ghost: boolean, dy = 0) =>
		pieceCells(p).map(({ r, c, color }, i) =>
			r + dy >= 0 ? <GemShape key={`${ghost ? 'g' : 'p'}${i}`} g={{ color, kind: 'gem', ice: false, lock: false }} x={c * U} y={(r + dy) * U} ghost={ghost} /> : null,
		);

	return (
		<div className="ec-root">
			<style>{CSS}</style>

			<ModeToggle
				daily={mode === 'daily'}
				onFree={() => { if (mode !== 'free' || lv.active) { lv.exit(); newFree(tierKey); } }}
				onDaily={() => { lv.exit(); void startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{mode === 'levels' ? (
				<div className="ec-tag">
					{lv.menu ? 'Progression — réussis un niveau pour débloquer le suivant' : (
						<>{world?.name} · Niveau {lv.level}{cfgLv ? ` · ★★★ en ${cfgLv.three} pièces` : ''}</>
					)}
				</div>
			) : mode === 'daily' ? (
				<div className="ec-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${TIERS[tierKey].label}`}
				</div>
			) : lv.booting ? null : (
				<div className="ec-pills" role="tablist" aria-label="Difficulté">
					{withExpert(TIER_ORDER, gameId).map((k) => (
						<button key={k} role="tab" aria-selected={tierKey === k} className={`ec-pill ${tierKey === k ? 'active' : ''}`} onClick={() => newFree(k)}>
							{TIERS[k].label}
						</button>
					))}
				</div>
			)}

			{novelty && phase !== 'over' && <p className="ec-novelty">Nouveau : {novelty}</p>}

			{s && (
				<div className="ec-hud" aria-live="polite">
					<span className="ec-chip">💎 <strong>{s.found}</strong>/{s.cfg.treasures}</span>
					{mode === 'free' ? (
						<span className="ec-chip">⭐ <strong>{s.score}</strong>{record ? <small> · record {record}</small> : null}</span>
					) : (
						<span className="ec-chip">🧩 <strong>{placedRef.current}</strong> pièce{placedRef.current > 1 ? 's' : ''}</span>
					)}
					{timed && <span className="ec-chip chrono">{fmtCentis(elapsed)}</span>}
					{next && <NextPiece p={next} />}
				</div>
			)}

			<div className={`ec-boardwrap ${danger ? 'danger' : ''}`}>
				{s ? (
					<svg
						ref={svgRef}
						viewBox={`0 0 ${W} ${H}`}
						className={`ec-svg ${phase === 'ready' ? 'blurred' : ''} ${aim ? 'aiming' : ''} ${over && mode !== 'levels' ? 'dimmed' : ''}`}
						style={{ aspectRatio: `${W} / ${H}` }}
						onPointerDown={drag.onPointerDown}
						role="application"
						aria-label="Plateau d'Éclats"
					>
						<defs>
							<linearGradient id="ec-sky" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#182033" />
								<stop offset="100%" stopColor="#25324a" />
							</linearGradient>
						</defs>
						<rect x={0} y={0} width={W} height={BH} fill="url(#ec-sky)" />
						{Array.from({ length: COLS - 1 }, (_, i) => (
							<line key={`v${i}`} x1={(i + 1) * U} y1={0} x2={(i + 1) * U} y2={BH} className="ec-gridline" />
						))}
						<rect x={0} y={0} width={W} height={2 * U} className="ec-top" />

						{/* Pile */}
						{/* Positioned by a CSS transform so a falling gem glides to its new row. */}
						{s.board.map((g, i) =>
							g ? (
								<g key={`${round}-${g.id}`} className="ec-cell" style={{ transform: `translate(${(i % COLS) * U}px, ${Math.floor(i / COLS) * U}px)` }}>
									<GemShape g={g} x={0} y={0} />
								</g>
							) : null,
						)}

						{/* Where the piece will land, then the piece */}
						{piece && phase === 'fall' && ghostDrop > 0 && pieceView(piece, true, ghostDrop)}
						{piece && (phase === 'fall' || phase === 'ready') && pieceView(piece, false)}

						{/* Bursts */}
						{fx && fx.pops.map((p, i) => (
							<circle
								key={`${fx.id}-${i}`}
								className="ec-pop"
								cx={p.c * U + U / 2}
								cy={p.r * U + U / 2}
								r={4.5}
								fill={p.kind === 'stone' ? '#9aa0aa' : GEMS[p.color % GEMS.length].fill}
							/>
						))}
						{fx && fx.specials.map((p, i) => (
							<circle key={`${fx.id}-s${i}`} className="ec-special" cx={p.c * U + U / 2} cy={p.r * U + U / 2} r={5} />
						))}
						{fx && fx.chain >= 2 && (
							<text key={`${fx.id}-chain`} className="ec-combo" x={W / 2} y={BH * 0.42}>Combo ×{fx.chain}</text>
						)}

						{/* Grass, then the ground */}
						<rect x={0} y={BH} width={W} height={GRASS} className="ec-grass" />
						{Array.from({ length: depth * COLS }, (_, i) => {
							const r = Math.floor(i / COLS);
							const c = i % COLS;
							const gi = groundAt(s.ground, r, c);
							const x = c * U;
							const y = GY + r * U;
							const dug = !!s.ground.dug[gi];
							const seen = !!s.ground.seen[gi];
							const treasure = !!s.ground.treasure[gi];
							const trap = !!s.ground.trap[gi];
							const n = around(s.ground, r, c);
							const showContent = dug || seen || (reveal && (treasure || trap));
							return (
								<g key={`gr${i}`} className={`ec-soil ${dug ? 'dug' : ''}`}>
									{dug ? (
										<rect x={x + 0.3} y={y + 0.3} width={U - 0.6} height={U - 0.6} rx={1.2} className="ec-hole" />
									) : (
										<>
											<rect x={x} y={y} width={U} height={U} className={`ec-earth ${s.ground.hard[gi] ? 'hard' : ''} ${r % 2 ? 'odd' : ''}`} />
											{pebbles(gi).map((p, k) => <circle key={k} cx={x + p.x} cy={y + p.y} r={p.r} className="ec-pebble" />)}
											{s.ground.hard[gi] > 0 && <path d={`M${x + 2},${y + 3}l2.5,2l-1,2.5l3,1.5`} className="ec-crack" />}
										</>
									)}
									{showContent && (treasure ? (
										<g opacity={dug ? 1 : 0.8}><Chest x={x} y={y} /></g>
									) : trap ? (
										<Spikes x={x} y={y} faint={!dug} />
									) : n.treasures > 0 ? (
										<text x={x + U / 2} y={y + U / 2 + 2.2} className={`ec-num ${dug ? '' : 'seen'}`} fill={NUM_COLOURS[n.treasures]}>{n.treasures}</text>
									) : null)}
									{showContent && !treasure && !trap && traps && n.traps > 0 && (
										<g className="ec-trapnum">
											<circle cx={x + U - 2} cy={y + 2} r={1.8} />
											<text x={x + U - 2} y={y + 2.95}>{n.traps}</text>
										</g>
									)}
									{seen && !dug && <rect x={x + 0.6} y={y + 0.6} width={U - 1.2} height={U - 1.2} rx={1.2} className="ec-radar" />}
									{!dug && s.ground.flag[gi] > 0 && !showContent && (
										<g className="ec-flag">
											<line x1={x + 3.6} y1={y + 2} x2={x + 3.6} y2={y + 8.2} />
											<path d={`M${x + 3.9},${y + 2}l3.8,1.6l-3.8,1.6z`} />
										</g>
									)}
								</g>
							);
						})}
						{fx && fx.digs.map((d, i) => (
							<circle key={`${fx.id}-d${i}`} className={`ec-dust ${d.treasure ? 'gold' : ''}`} cx={d.c * U + U / 2} cy={GY + d.r * U + U / 2} r={4} />
						))}
					</svg>
				) : (
					<div className="ec-loading">Préparation…</div>
				)}

				{toast && (
					<div key={toast.id} className="ec-toast" onAnimationEnd={() => setToast(null)}>{toast.text}</div>
				)}

				{aim && (
					<div className="ec-aimtip">
						{BOOSTER_INFO[aim].icon} {BOOSTER_INFO[aim].tip}
						<button className="ec-aimcancel" onClick={() => setAim(null)}>Annuler</button>
					</div>
				)}

				{dailyLoading && (
					<div className="ec-overlay"><div className="ec-card">Préparation…</div></div>
				)}

				{phase === 'ready' && !dailyLoading && s && !lv.menu && (
					<div className="ec-overlay">
						<button className="ec-start" onClick={begin}>
							{mode === 'levels' ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
						</button>
					</div>
				)}

				{over && mode === 'free' && s && (
					<div className="ec-overlay">
						<div className="ec-card" role="dialog" aria-label="Partie terminée">
							<div className="ec-mark">{newRecord ? '🏅' : '💥'}</div>
							<h2>{s.score} points</h2>
							<p className="ec-sub">
								{newRecord ? 'Nouveau record !' : record ? `Record ${record}` : ''} · {s.field} sol{s.field > 1 ? 's' : ''} vidé{s.field > 1 ? 's' : ''} · {TIERS[tierKey].label}
							</p>
							<button className="ec-start sm" onClick={() => newFree(tierKey)}>Rejouer</button>
						</div>
					</div>
				)}

				{over && mode === 'daily' && s && (
					<div className="ec-overlay">
						<div className="ec-card" role="dialog" aria-label="Défi du jour terminé">
							<div className="ec-mark">{won ? '💎' : '🪨'}</div>
							<h2>{won ? `Trésors trouvés en ${placedRef.current} pièces` : 'La pile a touché le haut'}</h2>
							{won && <p className="ec-sub">{fmtCentis(elapsed)}</p>}
							<DailyDone />
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={eclatsLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `${placedRef.current} pièces${cfgLv ? ` · ★★★ ≤ ${cfgLv.three}, ★★ ≤ ${cfgLv.two}` : ''}` : 'La pile a touché le haut'}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>

			{s && (
				<div className="ec-boosters">
					{(['pioche', 'radar', 'sablier'] as Booster[]).map((b) => (
						<button
							key={b}
							className={`ec-booster ${aim === b ? 'on' : ''} ${b === 'sablier' && slowLeft > 0 ? 'on' : ''}`}
							disabled={s.boosters[b] <= 0 || phase === 'ready' || over}
							onClick={() => pickBooster(b)}
							title={BOOSTER_INFO[b].tip}
						>
							<span className="ec-bicon">{BOOSTER_INFO[b].icon}</span>
							{BOOSTER_INFO[b].label}
							<span className="ec-bcount">{s.boosters[b]}</span>
						</button>
					))}
				</div>
			)}

			<div className="ec-pad" aria-label="Commandes">
				<button ref={holdLeft} className="ec-key" aria-label="Gauche">◀</button>
				<button ref={holdRotate} className="ec-key" aria-label="Tourner">⟳</button>
				<button ref={holdRight} className="ec-key" aria-label="Droite">▶</button>
				<button ref={holdDrop} className="ec-key drop" aria-label="Lâcher">⤓</button>
			</div>

			{mode === 'daily' && phase !== 'ready' && !over && <GiveUp onGiveUp={giveUp} warn="Le défi du jour sera terminé, sans score classé. Les trésors seront montrés." />}

			<p className="ec-help">
				Aligne 3 gemmes de la même couleur : chaque gemme qui éclate creuse une case du sol sous sa colonne.
				Une case creusée montre combien de trésors se cachent autour d'elle (les trésors déjà trouvés comptent).
				Touche une case du sol pour la marquer d'un drapeau. 4 alignées font une bombe, 5 un arc-en-ciel.
				Chaque trésor donne un bonus. Clavier : flèches ou Q/D, ↑ tourne, ↓ accélère, Espace lâche.
			</p>

			{lv.active && lv.menu && (
				<LevelSelect
					progress={lv.progress}
					onPick={startLevel}
					onClose={closeLevels}
					sections={WORLDS.filter((w) => w.from <= eclatsLevels.count).map((w, i) => ({ from: w.from, title: i < 5 ? `Monde ${i + 1} · ${w.name}` : w.name }))}
				/>
			)}

			{mode === 'daily' && (
				<LeaderboardCorner
					key={`lb-${alreadyPlayed ? 1 : 0}`}
					game={LB_ID(gameId)}
					metric="time"
					side="right"
					actions
					submitValue={over && won && !gaveUp ? dailyScore : undefined}
					format={fmtPacked}
				/>
			)}
			{mode === 'free' && <LeaderboardCorner game={LB_ID(gameId)} metric="time" format={fmtPacked} side="right" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.ec-root {
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.ec-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.6rem; }
.ec-novelty {
  margin: 0 0 0.6rem; max-width: 420px; text-align: center; font-size: 12.5px; line-height: 1.45;
  color: var(--gray-100); background: var(--accent-overlay); border: 1px solid var(--accent-regular);
  border-radius: 12px; padding: 6px 12px;
}
.ec-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.6rem; }
.ec-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
}
.ec-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

.ec-hud { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; margin-bottom: 0.5rem; }
.ec-chip {
  background: var(--gray-900); color: var(--gray-100); border-radius: 999px; padding: 4px 11px;
  font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
}
.ec-chip strong { color: var(--accent-regular); }
.ec-chip small { color: var(--gray-300); font-weight: 500; }
.ec-next { display: inline-flex; background: #1d2638; border-radius: 10px; padding: 1px; }

.ec-boardwrap { position: relative; width: 100%; display: flex; justify-content: center; }
.ec-svg {
  display: block; height: min(62vh, 600px); width: auto; max-width: 100%;
  border-radius: 10px; border: 2px solid var(--gray-700); background: #182033;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.game-page:fullscreen .ec-svg { height: calc(100dvh - 250px); }
.game-page:-webkit-full-screen .ec-svg { height: calc(100dvh - 250px); }
.ec-boardwrap.danger .ec-svg { border-color: #e5484d; animation: ec-danger 0.9s ease-in-out infinite alternate; }
.ec-svg.blurred { filter: blur(4px); opacity: 0.55; }
.ec-svg.aiming .ec-earth { filter: brightness(1.25); }
.ec-loading { padding: 4rem 0; color: var(--gray-300); font-weight: 600; }

.ec-gridline { stroke: rgba(255, 255, 255, 0.05); stroke-width: 0.25; }
.ec-top { fill: rgba(229, 72, 77, 0.08); }
.ec-cell { transition: transform 0.15s ease-in; }
.ec-ghost { opacity: 0.28; }
.ec-rim { fill: none; stroke: #fff; stroke-width: 0.5; opacity: 0.8; }
.ec-stone { fill: #8b9099; stroke: #4c5059; stroke-width: 0.55; }
.ec-stone-dot { fill: #6b7079; }
.ec-ice { fill: rgba(190, 232, 255, 0.45); stroke: #e8f7ff; stroke-width: 0.6; }
.ec-lock { fill: #2b2f38; stroke: #d9dde4; stroke-width: 0.55; }
.ec-lock-ring { fill: none; stroke: #d9dde4; stroke-width: 0.7; stroke-dasharray: 1.4 0.9; }
.ec-bomb { animation: ec-fuse 0.8s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }

.ec-grass { fill: #4caf50; }
.ec-earth { fill: #8a5a3b; }
.ec-earth.odd { fill: #83553a; }
.ec-earth.hard { fill: #5c3c28; }
.ec-pebble { fill: rgba(0, 0, 0, 0.18); }
.ec-crack { fill: none; stroke: #2f1d12; stroke-width: 0.55; stroke-linecap: round; stroke-linejoin: round; }
.ec-hole { fill: #23160e; stroke: #3a2619; stroke-width: 0.4; }
.ec-num { font: 700 6.4px var(--font-body, system-ui), system-ui, sans-serif; text-anchor: middle; }
.ec-num.seen { opacity: 0.8; }
.ec-trapnum circle { fill: #e5484d; stroke: #23160e; stroke-width: 0.35; }
.ec-trapnum text { font: 800 2.7px system-ui, sans-serif; text-anchor: middle; fill: #fff; }
.ec-radar { fill: none; stroke: #3fd3ff; stroke-width: 0.55; stroke-dasharray: 1.2 0.8; }
.ec-flag line { stroke: #f3f3f3; stroke-width: 0.5; }
.ec-flag path { fill: #e5484d; }
.ec-chest { animation: ec-shine 1.6s ease-in-out infinite alternate; }

.ec-pop { pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-pop 0.32s ease-out forwards; }
.ec-special { fill: none; stroke: #fff; stroke-width: 0.6; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-ring 0.5s ease-out forwards; }
.ec-dust { fill: none; stroke: #d2a679; stroke-width: 0.7; pointer-events: none; transform-box: fill-box; transform-origin: center; animation: ec-ring 0.45s ease-out forwards; }
.ec-dust.gold { stroke: #ffd24a; stroke-width: 1; }
.ec-combo {
  font: 800 7px var(--font-brand, system-ui), system-ui, sans-serif; text-anchor: middle; fill: #fff;
  stroke: #1d2638; stroke-width: 0.8; paint-order: stroke; pointer-events: none;
  animation: ec-rise 0.7s ease-out forwards;
}

.ec-toast {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 4;
  background: rgba(16, 20, 30, 0.88); color: #fff; border: 1px solid var(--accent-regular);
  border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; white-space: nowrap;
  max-width: 92vw; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  animation: ec-toast 2.2s ease forwards;
}
/* Over the top of the board: the ground under it is what the player is about to touch. */
.ec-aimtip {
  position: absolute; top: 46px; left: 50%; transform: translateX(-50%); z-index: 4; width: max-content; max-width: min(340px, 92vw);
  pointer-events: none;
  background: rgba(16, 20, 30, 0.92); color: #fff; border: 1.5px solid #3fd3ff; border-radius: 14px;
  padding: 7px 10px; font-size: 12.5px; line-height: 1.35; display: flex; align-items: center; gap: 8px;
}
.ec-aimcancel { pointer-events: auto; border: none; background: #3a4560; color: #fff; font: inherit; font-weight: 700; font-size: 12px; border-radius: 999px; padding: 5px 10px; cursor: pointer; }

.ec-overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; }
/* The board is narrower than its wrap: dim the board itself, not the whole wrap. */
.ec-svg.dimmed { filter: brightness(0.55) saturate(0.8); }
.ec-card {
  background: var(--gray-999); border: 2px solid var(--accent-regular); border-radius: 18px;
  padding: 20px 26px; text-align: center; box-shadow: var(--shadow-lg); max-width: 88%;
}
.ec-card h2 { font-family: var(--font-brand); font-size: 20px; margin: 4px 0 2px; color: var(--gray-0); }
.ec-mark { font-size: 30px; }
.ec-sub { color: var(--gray-300); font-size: 13px; margin: 2px 0 12px; }
.ec-start {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 13px 32px; cursor: pointer;
  box-shadow: var(--shadow-lg);
}
.ec-start.sm { font-size: 14px; padding: 10px 24px; }

.ec-boosters { display: flex; gap: 6px; justify-content: center; margin: 0.6rem 0 0.4rem; flex-wrap: wrap; }
.ec-booster {
  position: relative; display: inline-flex; align-items: center; gap: 4px;
  border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-100);
  font: inherit; font-weight: 600; font-size: 12.5px; border-radius: 999px; padding: 5px 9px 5px 7px; cursor: pointer;
  touch-action: manipulation;
}
.ec-booster:disabled { opacity: 0.45; cursor: default; }
.ec-booster.on { border-color: #3fd3ff; box-shadow: 0 0 0 2px rgba(63, 211, 255, 0.3); }
.ec-bicon { font-size: 14px; }
.ec-bcount {
  min-width: 18px; height: 18px; border-radius: 9px; background: var(--accent-regular); color: var(--accent-text-over);
  font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
}
.ec-booster:disabled .ec-bcount { background: var(--gray-700); color: var(--gray-300); }

.ec-pad { display: flex; gap: 10px; justify-content: center; margin: 0.4rem 0 0.2rem; }
.ec-key {
  width: 60px; height: 52px; border-radius: 16px; border: 1.5px solid var(--gray-700);
  background: var(--gray-900); color: var(--gray-0); font-size: 22px; font-weight: 700; cursor: pointer;
  touch-action: none; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
}
.ec-key:active { background: var(--gray-800); border-color: var(--accent-regular); }
.ec-key.drop { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }

.ec-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
.game-page:fullscreen .ec-help { display: none; }
.game-page:-webkit-full-screen .ec-help { display: none; }

@keyframes ec-pop { from { opacity: 0.95; transform: scale(1); } to { opacity: 0; transform: scale(1.8); } }
@keyframes ec-ring { from { opacity: 0.9; transform: scale(0.6); } to { opacity: 0; transform: scale(1.9); } }
@keyframes ec-rise { from { opacity: 0; transform: translateY(4px); } 20% { opacity: 1; } to { opacity: 0; transform: translateY(-8px); } }
@keyframes ec-fuse { from { opacity: 0.85; } to { opacity: 1; } }
@keyframes ec-shine { from { filter: brightness(1); } to { filter: brightness(1.25); } }
@keyframes ec-danger { from { box-shadow: 0 0 0 0 rgba(229, 72, 77, 0); } to { box-shadow: 0 0 0 4px rgba(229, 72, 77, 0.35); } }
@keyframes ec-toast { 0% { opacity: 0; transform: translate(-50%, -6px); } 10% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .ec-cell { transition: none; }
  .ec-pop, .ec-special, .ec-dust, .ec-combo { animation-duration: 0.01s; }
  .ec-bomb, .ec-chest, .ec-boardwrap.danger .ec-svg { animation: none; }
}
`;
