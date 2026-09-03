import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fmtCentis } from '../../lib/scoreFormat';
import {
	DIFFS,
	DIFF_ORDER,
	ROTS,
	applyHint,
	boardFrom,
	findHint,
	generateLumen,
	isSolved,
	rotCW,
	solutionPlacements,
	trace,
	type LumenPuzzle,
	type Mask,
	type Piece,
	type Placement,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { isTypingTarget } from '../../lib/keyboard';
import { diffKeys } from '../../lib/difficulty';
import {
	getDaily,
	dailyWeekdayLabel,
	loadDailyRun,
	saveDailyRun,
} from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import GiveUp, { RevealNote } from '../../components/GiveUp';
import { useLevels } from '../../lib/useLevels';
import { usePlayClock } from '../../lib/usePlayClock';
import { lumenLevels } from './levels';
import { useHintGate } from '../useHintGate';

/* =====================================================
   LUMEN — React island.
   Drag mirrors, prisms, combiners and repeaters from the tray onto the grid; light
   (white or a single colour) splits into R/G/B, combiners merge rays back into one
   beam, repeaters copy a beam out of two faces, and every sensor must receive EXACTLY
   its colour (additive mixing).
   Engine is pure/tested; the construction ships as `solution` for the hints.
   ===================================================== */

type Status = 'loading' | 'playing' | 'won';

const fmtTime = fmtCentis;

export const MASK_COLOR: Record<number, string> = {
	1: '#ff4d57',
	2: '#3ddc7a',
	4: '#4d7dff',
	3: '#ffd23d',
	5: '#ff5bd8',
	6: '#45e0e0',
	7: '#ffffff',
};

interface Drag {
	trayIndex: number;
	rot: number;
	from: 'tray' | 'board';
	origin: Placement | null; // board lift: where the piece came from
	startX: number;
	startY: number;
	x: number;
	y: number;
	cell: number | null;
	ok: boolean;
	cellPx: number;
	touch: boolean; // touch-initiated → native touch listeners (iOS Safari)
	moved: boolean; // stays false for a tap → tap on a placed piece rotates it
}

interface SavedState {
	placements: (Placement | null)[];
}

/* Opening layout: pieces scattered in the scene (or an empty tray when no scatter). */
const startPlacements = (p: LumenPuzzle): (Placement | null)[] =>
	p.tray.map((_, i) => (p.start[i] ? { ...p.start[i] } : null));

/* ---------- SVG glyphs (100×100 tile space) ---------- */

function SourceGlyph({ rot, mask }: { rot: number; mask: Mask }) {
	const col = MASK_COLOR[mask] ?? '#ffffff';
	return (
		<g transform={`rotate(${rot * 90} 50 50)`}>
			<circle cx={50} cy={50} r={26} fill="#0d1428" stroke={col} strokeWidth={5} />
			<polygon points="50,4 36,26 64,26" fill={col} />
			<circle cx={50} cy={50} r={9} fill={col} />
		</g>
	);
}

function MirrorGlyph({ rot, decoy }: { rot: number; decoy?: boolean }) {
	const pts = rot % 2 === 0 ? { x1: 24, y1: 76, x2: 76, y2: 24 } : { x1: 24, y1: 24, x2: 76, y2: 76 };
	return (
		<g opacity={decoy ? 0.5 : 1}>
			<line {...pts} stroke={decoy ? '#7c88a8' : '#33406b'} strokeWidth={16} strokeLinecap="round" />
			<line {...pts} stroke={decoy ? '#aab4cc' : '#dbe6ff'} strokeWidth={7} strokeLinecap="round" />
		</g>
	);
}

function PrismGlyph({ rot }: { rot: number }) {
	// Schematic, not grid-aligned: a NEUTRAL ray enters (the real colour depends on the
	// source) and fans out left / straight / right of travel, the order cycling with rot.
	const side = (bendIdx: number): string => MASK_COLOR[1 << (((bendIdx - rot) % 3 + 3) % 3)];
	return (
		<g>
			<line x1={11} y1={41} x2={37} y2={48} stroke="#93a1c6" strokeWidth={5} strokeLinecap="round" />
			<polygon points="50,20 81,74 19,74" fill="#1b2340" stroke="#8ea2ff" strokeWidth={5} strokeLinejoin="round" />
			<line x1={37} y1={48} x2={64} y2={48} stroke="#ffffff" strokeWidth={4} strokeLinecap="round" opacity={0.35} />
			<line x1={64} y1={48} x2={88} y2={34} stroke={side(0)} strokeWidth={5} strokeLinecap="round" />
			<line x1={64} y1={48} x2={90} y2={48} stroke={side(1)} strokeWidth={5} strokeLinecap="round" />
			<line x1={64} y1={48} x2={88} y2={62} stroke={side(2)} strokeWidth={5} strokeLinecap="round" />
		</g>
	);
}

function CombinerGlyph({ rot }: { rot: number }) {
	// Funnel: dim ticks on the three intake faces, bright arrow on the output face.
	return (
		<g transform={`rotate(${rot * 90} 50 50)`}>
			<circle cx={50} cy={50} r={24} fill="#1b2340" stroke="#8ea2ff" strokeWidth={5} />
			<line x1={84} y1={50} x2={68} y2={50} stroke="#5a688f" strokeWidth={6} strokeLinecap="round" />
			<line x1={50} y1={84} x2={50} y2={68} stroke="#5a688f" strokeWidth={6} strokeLinecap="round" />
			<line x1={16} y1={50} x2={32} y2={50} stroke="#5a688f" strokeWidth={6} strokeLinecap="round" />
			<line x1={50} y1={44} x2={50} y2={26} stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
			<polygon points="50,6 38,26 62,26" fill="#ffffff" />
		</g>
	);
}

function RepeaterGlyph({ rot }: { rot: number }) {
	// Splitter: one node, two bright output arrows on the adjacent faces rot and rot+1.
	return (
		<g transform={`rotate(${rot * 90} 50 50)`}>
			<circle cx={50} cy={50} r={22} fill="#1b2340" stroke="#8ea2ff" strokeWidth={5} />
			{/* North output */}
			<line x1={50} y1={46} x2={50} y2={26} stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
			<polygon points="50,6 39,26 61,26" fill="#ffffff" />
			{/* East output */}
			<line x1={54} y1={50} x2={74} y2={50} stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
			<polygon points="94,50 74,39 74,61" fill="#ffffff" />
		</g>
	);
}

function SensorGlyph({ expect, got }: { expect: Mask; got: Mask }) {
	const exact = got === expect;
	const lit = got !== 0;
	// Recipe: a mixed target (cyan/magenta/yellow/white) shows one coloured pill per
	// primary it needs, so the player sees how to build it. Shown while the sensor is
	// still dark — the ✓/✕ takes over once any light arrives.
	const parts = [1, 2, 4].filter((b) => expect & b);
	const showRecipe = !lit && parts.length >= 2;
	const dotX = (i: number): number => 50 + (i - (parts.length - 1) / 2) * 13;
	return (
		<g>
			<circle
				cx={50}
				cy={50}
				r={32}
				fill="none"
				stroke={MASK_COLOR[expect] ?? '#666'}
				strokeWidth={9}
				data-expect={expect}
			/>
			<circle cx={50} cy={50} r={19} fill={lit ? MASK_COLOR[got] : '#0c1122'} data-got={got} />
			{showRecipe && parts.map((b, i) => (
				<circle key={b} cx={dotX(i)} cy={50} r={5.5} fill={MASK_COLOR[b]} stroke="#0c1122" strokeWidth={1.5} />
			))}
			{lit && (
				<text
					x={50}
					y={59}
					textAnchor="middle"
					fontSize={27}
					fontWeight={700}
					fill={exact ? '#08101e' : '#180a0a'}
				>
					{exact ? '✓' : '✕'}
				</text>
			)}
		</g>
	);
}

function WallGlyph() {
	// Bright rim + brick joints: the block has to read against the dark board.
	return (
		<g>
			<rect x={14} y={14} width={72} height={72} rx={10} fill="#2b3560" stroke="#8496cf" strokeWidth={5} />
			<line x1={17} y1={40} x2={83} y2={40} stroke="#111730" strokeWidth={4} />
			<line x1={17} y1={62} x2={83} y2={62} stroke="#111730" strokeWidth={4} />
			<line x1={50} y1={17} x2={50} y2={40} stroke="#111730" strokeWidth={4} />
			<line x1={32} y1={40} x2={32} y2={62} stroke="#111730" strokeWidth={4} />
			<line x1={68} y1={40} x2={68} y2={62} stroke="#111730" strokeWidth={4} />
			<line x1={50} y1={62} x2={50} y2={83} stroke="#111730" strokeWidth={4} />
		</g>
	);
}

function PieceGlyph({ piece, got }: { piece: Piece; got?: Mask }) {
	switch (piece.type) {
		case 'source': return <SourceGlyph rot={piece.rot} mask={piece.mask ?? 7} />;
		case 'mirror': return <MirrorGlyph rot={piece.rot} decoy={piece.fixed} />;
		case 'prism': return <PrismGlyph rot={piece.rot} />;
		case 'combiner': return <CombinerGlyph rot={piece.rot} />;
		case 'repeater': return <RepeaterGlyph rot={piece.rot} />;
		case 'sensor': return <SensorGlyph expect={piece.expect ?? 0} got={got ?? 0} />;
		case 'wall': return <WallGlyph />;
	}
}

/* ---------- Board (pure, exported for tests) ---------- */

export function BoardView({
	puzzle,
	placements,
	previewCell = null,
	previewOk = false,
	blurred = false,
	boardRef,
	onPointerDown,
	onContextMenu,
}: {
	puzzle: LumenPuzzle;
	placements: (Placement | null)[];
	previewCell?: number | null;
	previewOk?: boolean;
	blurred?: boolean;
	boardRef?: (el: HTMLDivElement | null) => void;
	onPointerDown?: (e: React.PointerEvent) => void;
	onContextMenu?: (e: React.MouseEvent) => void;
}) {
	const n = puzzle.size;
	const board = useMemo(() => boardFrom(puzzle, placements), [puzzle, placements]);
	const traced = useMemo(() => trace(n, board), [n, board]);

	/* Segment endpoints classified for FX: what does each beam land on? */
	const beams = useMemo(() => {
		const stepR = [-1, 0, 1, 0], stepC = [0, 1, 0, -1];
		return traced.segments.map((s) => {
			const d = s.r1 < s.r0 ? 0 : s.c1 > s.c0 ? 1 : s.r1 > s.r0 ? 2 : 3;
			const end = board[s.r1 * n + s.c1];
			const exits = !end && (s.r1 + stepR[d] < 0 || s.r1 + stepR[d] >= n || s.c1 + stepC[d] < 0 || s.c1 + stepC[d] >= n);
			const kind =
				end?.type === 'wall' || end?.type === 'source' ? 'spark'
				: end?.type === 'prism' || end?.type === 'combiner' || end?.type === 'repeater' ? 'refract'
				: end?.type === 'mirror' ? 'bounce'
				: end?.type === 'sensor' ? 'hit'
				: exits ? 'exit' : 'none';
			const x1 = s.c1 * 100 + 50, y1 = s.r1 * 100 + 50;
			// A sparking beam stops on the obstacle face, not at its centre.
			const cut = kind === 'spark' ? 32 : 0;
			return {
				x0: s.c0 * 100 + 50, y0: s.r0 * 100 + 50,
				x1, y1,
				ex: x1 - cut * stepC[d], ey: y1 - cut * stepR[d],
				ux: stepC[d], uy: stepR[d],
				angle: [270, 0, 90, 180][d],
				col: MASK_COLOR[s.mask] ?? '#fff',
				kind,
				fromSource: board[s.r0 * n + s.c0]?.type === 'source',
			};
		});
	}, [traced, board, n]);

	return (
		<div
			className={`lum-board ${blurred ? 'blurred' : ''}`}
			ref={boardRef}
			onPointerDown={onPointerDown}
			onContextMenu={onContextMenu}
			role="application"
			aria-label="Plateau de lumière"
		>
			<svg className="lum-svg" viewBox={`0 0 ${n * 100} ${n * 100}`} aria-hidden="true">
				<defs>
					<filter id="lumGlow" x="-60%" y="-60%" width="220%" height="220%">
						<feGaussianBlur stdDeviation="8" />
					</filter>
					<filter id="lumBloom" x="-80%" y="-80%" width="260%" height="260%">
						<feGaussianBlur stdDeviation="18" />
					</filter>
				</defs>
				{/* grid lines */}
				<g stroke="rgba(160,180,255,0.10)" strokeWidth={1.5}>
					{Array.from({ length: n - 1 }).map((_, i) => (
						<g key={i}>
							<line x1={(i + 1) * 100} y1={0} x2={(i + 1) * 100} y2={n * 100} />
							<line x1={0} y1={(i + 1) * 100} x2={n * 100} y2={(i + 1) * 100} />
						</g>
					))}
				</g>
				{previewCell != null && (
					<rect
						x={(previewCell % n) * 100 + 4}
						y={Math.floor(previewCell / n) * 100 + 4}
						width={92}
						height={92}
						rx={12}
						fill={previewOk ? 'rgba(61,220,122,0.18)' : 'rgba(255,77,87,0.16)'}
						stroke={previewOk ? '#3ddc7a' : '#ff4d57'}
						strokeWidth={3}
					/>
				)}
				{/* marching ants under player pieces: "you can grab me" */}
				<g>
					{placements.map((pl, i) => pl && (
						<rect
							key={i}
							className="lum-manip"
							x={(pl.idx % n) * 100 + 7}
							y={Math.floor(pl.idx / n) * 100 + 7}
							width={86} height={86} rx={16}
							fill="none" stroke="#9fb4ff" strokeWidth={2.5} strokeDasharray="10 9"
							style={{ animationDelay: `${((i * 0.37) % 1.4).toFixed(2)}s` }}
						/>
					))}
				</g>
				{/* pieces */}
				<g>
					{board.map((p, i) =>
						p ? (
							<g key={i} transform={`translate(${(i % n) * 100} ${Math.floor(i / n) * 100})`}>
								<PieceGlyph piece={p} got={p.type === 'sensor' ? traced.sensorMask.get(i) ?? 0 : undefined} />
							</g>
						) : null,
					)}
				</g>
				{/* beams — screen blend so crossing red+green reads yellow. Blur filters sit on
				    static groups only: an animated child inside a filtered group would force the
				    filter to re-render every frame. */}
				<g style={{ mixBlendMode: 'screen' }}>
					<g filter="url(#lumBloom)" opacity={0.35}>
						{beams.map((b, i) => (
							<line key={i} x1={b.x0} y1={b.y0} x2={b.ex} y2={b.ey} stroke={b.col} strokeWidth={42} strokeLinecap="round" />
						))}
					</g>
					<g filter="url(#lumGlow)" opacity={0.6}>
						{beams.map((b, i) => (
							<line key={i} x1={b.x0} y1={b.y0} x2={b.ex} y2={b.ey} stroke={b.col} strokeWidth={18} strokeLinecap="round" />
						))}
						{beams.map((b, i) => b.kind === 'exit' && (
							<line key={`x${i}`} x1={b.x1} y1={b.y1} x2={b.x1 + 46 * b.ux} y2={b.y1 + 46 * b.uy} stroke={b.col} strokeWidth={14} strokeLinecap="round" opacity={0.5} />
						))}
					</g>
					<g>
						{beams.map((b, i) => (
							<line key={i} x1={b.x0} y1={b.y0} x2={b.ex} y2={b.ey} stroke={b.col} strokeWidth={6.5} strokeLinecap="round" opacity={0.95} />
						))}
						{beams.map((b, i) => b.kind === 'exit' && (
							<line key={`x${i}`} x1={b.x1} y1={b.y1} x2={b.x1 + 42 * b.ux} y2={b.y1 + 42 * b.uy} stroke={b.col} strokeWidth={4.5} strokeLinecap="round" opacity={0.35} />
						))}
					</g>
					{/* white-hot core kept under 1: the flow pulses must stay visible on white beams */}
					<g>
						{beams.map((b, i) => (
							<line key={i} x1={b.x0} y1={b.y0} x2={b.ex} y2={b.ey} stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.6} />
						))}
					</g>
					{/* travelling dashes give each laser its direction */}
					<g>
						{beams.map((b, i) => (
							<line
								key={i}
								className="lum-flow"
								x1={b.x0} y1={b.y0} x2={b.ex} y2={b.ey}
								stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeDasharray="16 84"
								style={{ animationDelay: `${((i * 0.31) % 1.15).toFixed(2)}s` }}
							/>
						))}
					</g>
					{/* impact FX: sparks on obstacles, glints on bounces/splits, halo on fed sensors */}
					<g>
						{beams.map((b, i) => {
							if (b.kind === 'spark')
								return (
									<g key={i} transform={`translate(${b.ex} ${b.ey}) rotate(${b.angle + 180})`}>
										<circle r={15} fill={b.col} opacity={0.3} className="lum-throb" />
										<circle r={7} fill={b.col} opacity={0.55} className="lum-throb" style={{ animationDelay: '0.3s' }} />
										<circle r={3.5} fill="#fff" opacity={0.9} />
										{[-40, -12, 16, 42].map((spread, j) => (
											<g key={j} transform={`rotate(${spread})`}>
												<line
													x1={8} y1={0} x2={19} y2={0}
													stroke={j % 2 ? '#fff' : b.col} strokeWidth={4} strokeLinecap="round"
													className="lum-spark"
													style={{ animationDelay: `${((j * 0.17 + i * 0.11) % 0.55).toFixed(2)}s` }}
												/>
											</g>
										))}
									</g>
								);
							if (b.kind === 'bounce' || b.kind === 'refract')
								return (
									<g key={i}>
										<circle cx={b.x1} cy={b.y1} r={11} fill={b.col} opacity={0.3} className="lum-throb" />
										<circle cx={b.x1} cy={b.y1} r={4.5} fill="#fff" opacity={0.8} />
									</g>
								);
							if (b.kind === 'hit')
								return <circle key={i} cx={b.x1} cy={b.y1} r={30} fill={b.col} opacity={0.3} className="lum-throb" />;
							return null;
						})}
						{beams.map((b, i) => b.fromSource && (
							<g key={`s${i}`}>
								<circle cx={b.x0} cy={b.y0} r={14} fill="#fff" opacity={0.35} className="lum-throb" style={{ animationDelay: '0.5s' }} />
								<circle cx={b.x0} cy={b.y0} r={6} fill="#fff" opacity={0.9} />
							</g>
						))}
					</g>
				</g>
			</svg>
		</div>
	);
}

/* ---------- Game ---------- */

export default function LumenGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [puzzle, setPuzzle] = useState<LumenPuzzle | null>(null);
	const [placements, setPlacements] = useState<(Placement | null)[]>([]);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [status, setStatus] = useState<Status>('loading');
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [hintNote, setHintNote] = useState('');
	const [elapsed, setElapsed] = useState(0);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const startRef = useRef<number>(0);
	const dailySeedRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const boardRef = useRef<HTMLDivElement | null>(null);
	const lv = useLevels(gameId, lumenLevels);
	const timed = daily || lv.playing; // both race the chrono → hints on a cooldown
	const gate = useHintGate(timed, status === 'playing' && started && !revealed);

	// iOS: block the scroll gesture at touchstart on drag sources. preventDefault on
	// pointerdown does not stop scrolling, and the window touchmove listeners attach
	// only after the drag re-render — too late when Safari already owns the gesture.
	const blockTouchStart = useCallback((el: HTMLElement | null) => {
		if (!el) return;
		el.addEventListener('touchstart', (e: TouchEvent) => e.preventDefault(), { passive: false });
	}, []);
	const boardCbRef = useCallback((el: HTMLDivElement | null) => {
		boardRef.current = el;
		blockTouchStart(el);
	}, [blockTouchStart]);

	const n = puzzle?.size ?? 0;

	/* Cells taken by fixed pieces or placed pieces (the lifted piece is already null). */
	const occupied = useMemo(() => {
		const s = new Set<number>();
		if (!puzzle) return s;
		for (const f of puzzle.fixed) s.add(f.idx);
		for (const pl of placements) if (pl) s.add(pl.idx);
		return s;
	}, [puzzle, placements]);

	const sensorsState = useMemo(() => {
		if (!puzzle) return { ok: 0, total: 0 };
		const t = trace(puzzle.size, boardFrom(puzzle, placements));
		let ok = 0, total = 0;
		for (const f of puzzle.fixed) {
			if (f.piece.type !== 'sensor') continue;
			total++;
			if ((t.sensorMask.get(f.idx) ?? 0) === f.piece.expect) ok++;
		}
		return { ok, total };
	}, [puzzle, placements]);

	const newGame = useCallback((dk: keyof typeof DIFFS) => {
		setDaily(false);
		setAlreadyPlayed(false);
		setDiffKey(dk);
		setStatus('loading');
		setStarted(false);
		setRevealed(false);
		setHintNote('');
		setElapsed(0);
		setDrag(null);
		const p = generateLumen(DIFFS[dk]);
		setPuzzle(p);
		setPlacements(startPlacements(p));
		setStatus('playing');
	}, []);

	useEffect(() => {
		newGame('facile');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Levels mode: start a level from its config; grade on solve. */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		setDaily(false);
		setDiffKey('facile');
		setRevealed(false);
		setHintNote('');
		setStatus('loading');
		setElapsed(0);
		setDrag(null);
		const p = generateLumen(cfg.diff, mulberry32(cfg.seed));
		setPuzzle(p);
		setPlacements(startPlacements(p));
		setStatus('playing');
		setStarted(false); // ready-gate: blurred board + ▶ Commencer starts the chrono
	}, [lv]);

	const armLevels = useCallback(() => {
		setDaily(false);
		lv.enter();
	}, [lv]);

	// Levels is the default landing: resume at the next unlocked level (grid once all cleared).
	// A ?defi deep link opens the daily instead — skip auto-resume then.
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Grade the level once solved (win → time). */
	useEffect(() => {
		if (!lv.playing) return;
		if (status === 'won') lv.finish({ won: true, score: Math.round((Date.now() - startRef.current) / 10), raw: { size: puzzle?.size } });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lv.playing, status]);

	/* Daily challenge: one attempt per device, resumable. Server-issued seed + difficulty. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setRevealed(false);
		setHintNote('');
		setDrag(null);

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const diffIndex = run.diffIndex ?? 0;
			const dk = DIFF_ORDER[diffIndex] ?? 'facile';
			dailySeedRef.current = { seed: run.seed, diffIndex };
			setDailyLoading(false);
			setDiffKey(dk);
			const p = generateLumen(DIFFS[dk], mulberry32(run.seed));
			setPuzzle(p);
			const saved = run.state as SavedState | undefined;
			setPlacements(saved?.placements ?? startPlacements(p));
			setStarted(true);
			if (run.done && run.abandoned) {
				// Gave up earlier today: the stored placements ARE the solution, and it never won.
				setAlreadyPlayed(true);
				setRevealed(true);
				setStatus('playing');
				setElapsed(run.finalTime ?? 0);
			} else if (run.done) {
				setAlreadyPlayed(true);
				setStatus('won');
				setElapsed(run.finalTime ?? 0);
			} else {
				setAlreadyPlayed(false);
				setStatus('playing');
				startRef.current = run.startedAt;
				setElapsed(Math.round((Date.now() - run.startedAt) / 10));
			}
			return;
		}

		// Fresh: fetch today's seed and arm the grid (Start not pressed yet).
		setAlreadyPlayed(false);
		setStatus('loading');
		setStarted(false);
		setElapsed(0);
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		dailySeedRef.current = { seed, diffIndex };
		const dk = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(dk);
		const p = generateLumen(DIFFS[dk], mulberry32(seed));
		setPuzzle(p);
		setPlacements(startPlacements(p));
		setStatus('playing');
		setDailyLoading(false);
	}, [gameId]);

	const { celebrating, showWin } = useCelebration(status === 'won');

	/* Commencer: consumes the attempt and starts the chrono. */
	const startTimer = useCallback(() => {
		if (!puzzle) return;
		const now = Date.now();
		startRef.current = now;
		setStarted(true);
		setElapsed(0);
		trackGame(gameId, 'game_started');
		if (daily) {
			const sd = dailySeedRef.current;
			saveDailyRun(gameId, {
				startedAt: now,
				done: false,
				seed: sd?.seed,
				diffIndex: sd?.diffIndex,
				state: { placements: startPlacements(puzzle) } satisfies SavedState,
			});
		}
	}, [gameId, puzzle, daily]);

	/* Back to the opening layout without resetting the attempt (chrono keeps running). */
	const resetDailyEntries = useCallback(() => {
		if (!puzzle) return;
		const empty = startPlacements(puzzle);
		setPlacements(empty);
		setHintNote('');
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { placements: empty } satisfies SavedState,
		});
	}, [gameId, puzzle]);

	/* Timer */
	const ticking = status === 'playing' && started && !revealed;
	usePlayClock(startRef, ticking, daily ? gameId : null);
	useEffect(() => {
		if (!ticking) return;
		const id = setInterval(
			() => setElapsed(Math.round((Date.now() - startRef.current) / 10)),
			50,
		);
		return () => clearInterval(id);
	}, [ticking]);

	const begin = useCallback(() => {
		if (!started) {
			startRef.current = Date.now();
			setStarted(true);
			trackGame(gameId, 'game_started');
		}
	}, [started, gameId]);
	const beginRef = useRef(begin);
	beginRef.current = begin;

	/* Win: every sensor holds exactly its colour. */
	useEffect(() => {
		if (!puzzle || status !== 'playing' || revealed || drag) return;
		if (daily && !started) return;
		if (lv.active && !lv.playing) return;
		if (!isSolved(puzzle, placements)) return;
		setStatus('won');
		trackGame(gameId, 'game_won');
	}, [placements, puzzle, status, revealed, gameId, daily, started, lv.active, lv.playing, drag]);

	/* Persist the in-progress daily attempt (resume after reload). */
	useEffect(() => {
		if (!daily || !started || status === 'won' || revealed) return;
		const sd = dailySeedRef.current;
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: false,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { placements } satisfies SavedState,
		});
	}, [daily, started, status, revealed, placements, gameId]);

	/* Lock the daily attempt on a fresh win. */
	useEffect(() => {
		if (!daily || status !== 'won' || alreadyPlayed) return;
		const sd = dailySeedRef.current;
		const finalTime = Math.round((Date.now() - startRef.current) / 10);
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { placements } satisfies SavedState,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [daily, status, alreadyPlayed, gameId]);

	/* ---------- drag & drop (Pavage model) ---------- */

	const interactive = !(status !== 'playing' || revealed || ((daily || lv.playing) && !started));

	const cellFromPoint = useCallback((x: number, y: number): number | null => {
		const el = boardRef.current;
		if (!el || !puzzle) return null;
		const rect = el.getBoundingClientRect();
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
		const c = Math.floor(((x - rect.left) / rect.width) * puzzle.size);
		const r = Math.floor(((y - rect.top) / rect.height) * puzzle.size);
		if (r < 0 || r >= puzzle.size || c < 0 || c >= puzzle.size) return null;
		return r * puzzle.size + c;
	}, [puzzle]);

	const boardCellPx = useCallback((): number => {
		const el = boardRef.current;
		if (!el || !puzzle) return 48;
		return el.getBoundingClientRect().width / puzzle.size;
	}, [puzzle]);

	const beginDrag = useCallback(
		(trayIndex: number, rot: number, from: 'tray' | 'board', origin: Placement | null, x: number, y: number, touch: boolean) => {
			if (!interactive) return;
			if (from === 'board') {
				setPlacements((prev) => {
					const next = prev.slice();
					next[trayIndex] = null;
					return next;
				});
			}
			setHintNote('');
			setDrag({
				trayIndex, rot, from, origin,
				startX: x, startY: y, x, y,
				cell: null, ok: false,
				cellPx: boardCellPx(), touch, moved: false,
			});
		},
		[interactive, boardCellPx],
	);

	const computeDrag = useCallback((d: Drag, x: number, y: number): Drag => {
		const cell = cellFromPoint(x, y);
		const moved = d.moved || Math.hypot(x - d.startX, y - d.startY) > 8;
		const ok = cell != null && !occupied.has(cell);
		return { ...d, x, y, cell, ok, moved };
	}, [cellFromPoint, occupied]);

	// Only re-attach listeners when a drag starts / ends or its touch mode flips —
	// not on every pointer move (which updates `drag` on each frame).
	const dragActive = !!drag;
	const dragTouch = drag?.touch ?? false;

	useEffect(() => {
		if (!dragActive || !puzzle) return;
		const moveTo = (x: number, y: number) => {
			setDrag((d) => (d ? computeDrag(d, x, y) : d));
		};
		const endDrag = () => {
			setDrag((d) => {
				if (!d) return null;
				const type = puzzle.tray[d.trayIndex].type;
				setPlacements((prev) => {
					const next = prev.slice();
					if (d.from === 'board' && !d.moved && d.origin) {
						// Tap on a placed piece: quarter-turn clockwise in place.
						next[d.trayIndex] = { idx: d.origin.idx, rot: rotCW(type, d.rot) };
						beginRef.current();
					} else if (d.cell != null && d.ok) {
						next[d.trayIndex] = { idx: d.cell, rot: d.rot };
						beginRef.current();
					} else if (d.from === 'board' && d.cell != null && d.origin) {
						// Dropped on a taken cell: back where it was. Off-grid → back to the tray.
						next[d.trayIndex] = d.origin;
					}
					return next;
				});
				return null;
			});
		};
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return; // r is a letter: leave it to the pseudo field
			if (e.key === 'r' || e.key === 'R') {
				e.preventDefault();
				setDrag((d) => (d ? { ...d, rot: rotCW(puzzle.tray[d.trayIndex].type, d.rot) } : d));
			}
		};
		window.addEventListener('keydown', onKey);

		if (dragTouch) {
			// iOS Safari: pointermove/pointerup during a touch is unreliable — use
			// native touch events with preventDefault so the page never scrolls mid-drag.
			const onTouchMove = (e: TouchEvent) => {
				e.preventDefault();
				const t = e.touches[0];
				if (t) moveTo(t.clientX, t.clientY);
			};
			const onTouchEnd = (e: TouchEvent) => {
				const t = e.changedTouches[0];
				if (t) moveTo(t.clientX, t.clientY); // land on the last real position
				endDrag();
			};
			// Some touch environments (Chromium emulation, hybrid touchscreens) surface
			// the gesture as pointer events only. Dead on iOS, so both can coexist;
			// endDrag is idempotent when both fire.
			const onPtrMove = (e: PointerEvent) => moveTo(e.clientX, e.clientY);
			const onPtrUp = (e: PointerEvent) => {
				moveTo(e.clientX, e.clientY);
				endDrag();
			};
			window.addEventListener('touchmove', onTouchMove, { passive: false });
			window.addEventListener('touchend', onTouchEnd, { passive: false });
			window.addEventListener('touchcancel', onTouchEnd, { passive: false });
			window.addEventListener('pointermove', onPtrMove);
			window.addEventListener('pointerup', onPtrUp);
			window.addEventListener('pointercancel', onPtrUp);
			return () => {
				window.removeEventListener('touchmove', onTouchMove);
				window.removeEventListener('touchend', onTouchEnd);
				window.removeEventListener('touchcancel', onTouchEnd);
				window.removeEventListener('pointermove', onPtrMove);
				window.removeEventListener('pointerup', onPtrUp);
				window.removeEventListener('pointercancel', onPtrUp);
				window.removeEventListener('keydown', onKey);
			};
		}

		const onMove = (e: PointerEvent) => {
			e.preventDefault();
			moveTo(e.clientX, e.clientY);
		};
		const onUp = () => endDrag();
		window.addEventListener('pointermove', onMove, { passive: false });
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			window.removeEventListener('keydown', onKey);
		};
	}, [dragActive, dragTouch, computeDrag, puzzle]);

	const onBoardPointerDown = useCallback((e: React.PointerEvent) => {
		if (!interactive || !puzzle || e.button !== 0) return;
		const cell = cellFromPoint(e.clientX, e.clientY);
		if (cell == null) return;
		const i = placements.findIndex((pl) => pl?.idx === cell);
		if (i < 0) return;
		e.preventDefault();
		const pl = placements[i] as Placement;
		beginDrag(i, pl.rot, 'board', pl, e.clientX, e.clientY, e.pointerType === 'touch');
	}, [interactive, puzzle, placements, cellFromPoint, beginDrag]);

	/* Right-click a placed piece: quarter-turn the other way. */
	const onBoardContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		if (!interactive || !puzzle) return;
		const cell = cellFromPoint(e.clientX, e.clientY);
		if (cell == null) return;
		const i = placements.findIndex((pl) => pl?.idx === cell);
		if (i < 0) return;
		const type = puzzle.tray[i].type;
		setPlacements((prev) => {
			const next = prev.slice();
			const pl = next[i] as Placement;
			next[i] = { idx: pl.idx, rot: (pl.rot + ROTS[type] - 1) % ROTS[type] };
			return next;
		});
		setHintNote('');
		begin();
	}, [interactive, puzzle, placements, cellFromPoint, begin]);

	const resetPlacements = useCallback(() => {
		if (!puzzle || revealed) return;
		setPlacements(startPlacements(puzzle));
		setHintNote('');
		if (status === 'won') setStatus('playing');
	}, [puzzle, revealed, status]);

	/* Hint: repair first (wrong cell → tray, wrong rot → turned), then place. */
	const hint = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed || !gate.ready) return;
		const h = findHint(puzzle, placements);
		if (!h) return;
		gate.consume();
		setHintNote(h.reason);
		setPlacements((prev) => applyHint(prev, h));
		begin();
		trackGame(gameId, 'hint_used');
	}, [puzzle, placements, status, revealed, gameId, gate, begin]);

	const reveal = useCallback(() => {
		if (!puzzle || status !== 'playing' || revealed) return;
		setPlacements(solutionPlacements(puzzle));
		setDrag(null);
		setRevealed(true);
		trackGame(gameId, 'solution_shown');
	}, [puzzle, status, revealed, gameId]);

	/* Daily give-up: show the solution and close the attempt — nothing is submitted. */
	const giveUp = useCallback(() => {
		if (!puzzle) return;
		const solved = solutionPlacements(puzzle);
		const sd = dailySeedRef.current;
		setPlacements(solved);
		setDrag(null);
		setHintNote('');
		setRevealed(true);
		setAlreadyPlayed(true);
		saveDailyRun(gameId, {
			startedAt: startRef.current,
			done: true,
			finalTime: Math.round((Date.now() - startRef.current) / 10),
			abandoned: true,
			seed: sd?.seed,
			diffIndex: sd?.diffIndex,
			state: { placements: solved } satisfies SavedState,
		});
		trackGame(gameId, 'solution_shown');
	}, [puzzle, gameId]);

	return (
		<div className="lum-root" style={{ ['--n' as string]: n }}>
			<style>{CSS}</style>

			<ModeToggle
				daily={daily}
				onFree={() => { if (lv.active) { lv.exit(); newGame(diffKey); } else if (daily) newGame(diffKey); }}
				onDaily={() => { lv.exit(); startDaily(); }}
				showLevels
				levelsActive={lv.active}
				onLevels={armLevels}
			/>

			{lv.active && (
				<div className="lum-daily-tag">
					{lv.menu
						? 'Progression — réussis un niveau pour débloquer le suivant'
						: `Niveau ${lv.level} · ${n}×${n}`}
				</div>
			)}

			{!lv.active && (daily ? (
				<div className="lum-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="lum-bar">
					<div className="lum-pills" role="tablist" aria-label="Difficulté">
						{diffKeys(DIFFS, gameId).map((k) => (
							<button
								key={k}
								role="tab"
								aria-selected={diffKey === k}
								className={`lum-pill ${diffKey === k ? 'active' : ''}`}
								onClick={() => newGame(k)}
							>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<div className="lum-bar-right">
						<div className="lum-timer chrono">{fmtTime(elapsed)}</div>
						<button className="lum-new" onClick={() => newGame(diffKey)} aria-label="Nouvelle grille">
							↻
						</button>
					</div>
				</div>
			))}

			{!lv.active && daily && (
				<div className="lum-bar lum-bar-daily">
					<div className="lum-timer chrono">{fmtTime(elapsed)}</div>
				</div>
			)}

			{puzzle && status !== 'loading' && !(lv.active && lv.menu) && (
				<div className="lum-gauge" aria-live="polite">
					💡 <strong>{sensorsState.ok}</strong>/{sensorsState.total} capteurs à la bonne couleur
				</div>
			)}

			{status === 'playing' && !revealed && !(lv.active && lv.menu) && (
				<div className="lum-actions">
					<button className="lum-act" onClick={hint} disabled={!gate.ready || (timed && !started)}>{gate.label}</button>
					{!daily && !lv.active && elapsed >= 60 && (
						<button className="lum-act" onClick={reveal}>👁 Voir la solution</button>
					)}
					{!daily && !lv.active && (
						<button className="lum-act" onClick={resetPlacements}>↺ Position de départ</button>
					)}
					{daily && started && (
						<button className="lum-act" onClick={resetDailyEntries}>↺ Position de départ</button>
					)}
				</div>
			)}

			{daily && started && !revealed && status !== 'won' && puzzle && <GiveUp onGiveUp={giveUp} />}

			{daily && status === 'won' && (
				<div className="lum-daily-won">
					{alreadyPlayed ? (
						<>Défi du jour déjà relevé · <strong>{fmtTime(elapsed)}</strong> — reviens demain&nbsp;!</>
					) : (
						<>🎉 Lumière domptée en <strong>{fmtTime(elapsed)}</strong></>
					)}
				</div>
			)}

			{lv.active && lv.menu ? (
				<LevelSelect progress={lv.progress} onPick={startLevel} />
			) : (
			<div className="lum-boardwrap" style={{ ['--n' as string]: n }}>
				{celebrating && !lv.active && <Celebration />}
				{status === 'loading' || !puzzle ? (
					<div className="lum-loading">Génération…</div>
				) : (
					<BoardView
						puzzle={puzzle}
						placements={placements}
						previewCell={drag?.moved ? drag.cell : null}
						previewOk={drag?.ok ?? false}
						blurred={(daily || lv.playing) && !started}
						boardRef={boardCbRef}
						onPointerDown={onBoardPointerDown}
						onContextMenu={onBoardContextMenu}
					/>
				)}

				{daily && dailyLoading && (
					<div className="lum-overlay">
						<div className="lum-overlay-card"><p className="lum-windiff">Préparation…</p></div>
					</div>
				)}

				{((daily && !dailyLoading) || lv.playing) && !started && status !== 'won' && puzzle && (
					<div className="lum-overlay">
						<button className="lum-startbtn" onClick={startTimer}>
							{lv.playing ? `▶ Niveau ${lv.level} — Commencer` : '▶ Commencer'}
						</button>
					</div>
				)}

				{showWin && !daily && !lv.active && (
					<div className="lum-win" role="dialog" aria-label="Capteurs satisfaits">
						<div className="lum-wincard">
							<div className="lum-winmark">💡</div>
							<div className="lum-wintext">
								<strong>Toute la lumière est en place&nbsp;!</strong>
								<span className="lum-winsub">
									<span className="lum-wintime">{fmtTime(elapsed)}</span> · {DIFFS[diffKey].label} · {n}×{n}
								</span>
							</div>
							<button className="lum-replay" onClick={() => newGame(diffKey)}>
								Rejouer
							</button>
						</div>
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={lumenLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Résolu en ${fmtTime(elapsed)}` : undefined}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>
			)}

			{hintNote && !(lv.active && lv.menu) && (
				<p className="lum-hint-note" aria-live="polite">💡 {hintNote}</p>
			)}

			{/* Tray — hidden while everything sits on the board; holds pieces pulled off-grid. */}
			{puzzle && status === 'playing' && !revealed && interactive && !(lv.active && lv.menu)
				&& (drag?.from === 'tray' || placements.some((pl, i) => !pl && drag?.trayIndex !== i)) && (
				<div className="lum-tray" aria-label="Pièces à placer" ref={blockTouchStart}>
					{puzzle.tray.map((tp, i) => {
						const dimmed = !!placements[i] || drag?.trayIndex === i;
						return (
							<div
								key={tp.id}
								className={`lum-slot ${dimmed ? 'dimmed' : ''}`}
								onPointerDown={
									dimmed
										? undefined
										: (e) => {
												if (e.button !== 0) return;
												e.preventDefault();
												beginDrag(i, 0, 'tray', null, e.clientX, e.clientY, e.pointerType === 'touch');
											}
								}
								aria-label={tp.type === 'mirror' ? 'Miroir' : tp.type === 'prism' ? 'Prisme' : tp.type === 'combiner' ? 'Mélangeur' : 'Répéteur'}
							>
								<svg viewBox="0 0 100 100" aria-hidden="true">
									<PieceGlyph piece={{ type: tp.type, rot: 0, fixed: false }} />
								</svg>
							</div>
						);
					})}
				</div>
			)}

			{revealed ? (
				daily ? (
					<RevealNote />
				) : (
				<div className="lum-revealed-note">
					<span>Solution affichée</span>
					<button className="lum-replay" onClick={() => newGame(diffKey)}>Rejouer</button>
				</div>
				)
			) : !(lv.active && lv.menu) ? (
				<p className="lum-help">
					Les pièces entourées d'un pointillé sont à toi : elles sont mal placées. Glisse-les
					pour guider la lumière, touche une pièce pour la faire pivoter — pivoter un prisme
					change quelle couleur sort de quel côté, le mélangeur fusionne tous les rayons
					reçus en un seul faisceau vers sa flèche, et le répéteur recopie un faisceau vers
					ses deux flèches. Chaque capteur veut EXACTEMENT sa couleur — du blanc sur un
					capteur rouge, c'est raté.
				</p>
			) : null}

			{daily && (
				<Leaderboard game={gameId} metric="time" submitValue={status === 'won' && !revealed ? elapsed : undefined} />
			)}

			{!daily && !lv.active && <LeaderboardCorner game={gameId} metric="time" />}

			{/* Floating drag ghost */}
			{drag && puzzle && drag.moved && (
				<div
					className="lum-ghost"
					style={{
						left: drag.x - drag.cellPx / 2,
						top: drag.y - drag.cellPx / 2,
						width: drag.cellPx,
						height: drag.cellPx,
						opacity: drag.ok || drag.cell == null ? 0.92 : 0.55,
					}}
				>
					<svg viewBox="0 0 100 100" aria-hidden="true">
						<PieceGlyph piece={{ type: puzzle.tray[drag.trayIndex].type, rot: drag.rot, fixed: false }} />
					</svg>
				</div>
			)}
		</div>
	);
}

/* ---------- Styles (Ludiven charte — the board itself stays neon-dark in both themes) ---------- */

const CSS = `
.lum-root {
  --lum-accent: var(--accent-regular);

  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.lum-daily-tag {
  text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500;
  margin-bottom: 0.75rem;
}

.lum-bar {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.lum-bar-daily { justify-content: center; }
.lum-bar-right { display: flex; align-items: center; gap: 0.5rem; }
.lum-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.lum-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.lum-pill.active { background: var(--lum-accent); color: var(--accent-text-over); border-color: var(--lum-accent); }
.lum-timer {
  font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px;
  background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 14px;
}
.lum-new {
  border: none; background: var(--lum-accent); color: var(--accent-text-over);
  font-size: 18px; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; font-weight: 700; line-height: 1;
}

.lum-gauge {
  color: var(--gray-300); font-size: 13px; font-weight: 500;
  margin-bottom: 0.75rem;
}
.lum-gauge strong { color: var(--lum-accent); font-variant-numeric: tabular-nums; }

.lum-actions {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 1rem;
}
.lum-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px;
  border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.lum-act:hover { background: var(--gray-800); border-color: var(--lum-accent); color: var(--lum-accent); }

.lum-boardwrap {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin-inline: auto;
  container-type: inline-size;
}
.lum-loading {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 1 / 1;
  color: var(--gray-300); font-weight: 600;
}
.lum-board {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 2.5px solid #2a3350;
  border-radius: 10px;
  overflow: hidden;
  background: #070b16;
  box-shadow: 0 0 18px rgba(90,120,255,0.22), inset 0 0 70px rgba(60,80,180,0.16);
  touch-action: none;
  user-select: none;
}
.lum-svg { display: block; width: 100%; height: 100%; }
.lum-svg .lum-flow { opacity: 0.9; animation: lum-flow 1.15s linear infinite; }
@keyframes lum-flow { to { stroke-dashoffset: -200; } }
.lum-svg .lum-throb {
  transform-box: fill-box; transform-origin: center;
  animation: lum-throb 1s ease-in-out infinite;
}
@keyframes lum-throb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.3); } }
.lum-svg .lum-manip { opacity: 0.55; animation: lum-manip 1.4s linear infinite; }
@keyframes lum-manip { to { stroke-dashoffset: -38; } }
.lum-svg .lum-spark { animation: lum-spark 0.55s linear infinite; }
@keyframes lum-spark {
  0% { transform: translateX(0); opacity: 0.95; }
  100% { transform: translateX(24px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .lum-svg .lum-flow, .lum-svg .lum-throb, .lum-svg .lum-spark, .lum-svg .lum-manip { animation: none; }
  .lum-svg .lum-flow { opacity: 0; }
  .lum-svg .lum-spark { opacity: 0.6; }
}
.lum-board.blurred { filter: blur(5px); opacity: 0.45; pointer-events: none; }

.lum-tray {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
  margin-top: 1rem;
  padding: 10px 14px;
  border: 1.5px solid #2a3350;
  border-radius: 14px;
  background: #0a0f1f;
  touch-action: none;
}
.lum-slot {
  width: 54px; height: 54px;
  border: 1.5px dashed #33406b;
  border-radius: 10px;
  cursor: grab;
  touch-action: none;
}
.lum-slot svg { width: 100%; height: 100%; display: block; }
.lum-slot.dimmed { opacity: 0.25; cursor: default; }

.lum-ghost {
  position: fixed; z-index: 50; pointer-events: none;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5));
}
.lum-ghost svg { width: 100%; height: 100%; display: block; }

.lum-overlay {
  position: absolute; inset: -8px; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  animation: lum-fade 0.25s ease;
}
.lum-overlay-card {
  background: var(--gray-999); border: 2px solid var(--lum-accent);
  border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg);
}
.lum-startbtn {
  border: none; background: var(--lum-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px;
  border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.lum-daily-won {
  text-align: center; font-size: 16px; color: var(--gray-0); margin: 0 0 0.75rem;
}
.lum-daily-won strong { color: var(--lum-accent); font-variant-numeric: tabular-nums; }

.lum-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.25rem; }

.lum-hint-note {
  max-width: 420px;
  margin: 1rem auto 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: #2f9e6f;
  background: var(--accent-overlay);
  border: 1px solid #2f9e6f;
  border-radius: 12px;
  padding: 8px 14px;
}

.lum-revealed-note {
  display: flex; align-items: center; gap: 14px;
  margin-top: 1.25rem;
  color: var(--gray-300); font-size: 14px; font-weight: 500;
}

/* Docked at the bottom, no blur: the solved board (the whole point) stays visible. */
.lum-win {
  position: absolute; inset: -8px; z-index: 10; display: flex; align-items: flex-end; justify-content: center;
  padding-bottom: 10px; pointer-events: none; animation: lum-fade 0.25s ease;
}
.lum-wincard {
  pointer-events: auto; display: flex; align-items: center; gap: 14px; max-width: 96%;
  background: var(--gray-999); border: 2px solid var(--lum-accent); border-radius: 16px; padding: 10px 14px; box-shadow: var(--shadow-lg);
}
.lum-winmark { font-size: 26px; flex: none; }
.lum-wintext { display: flex; flex-direction: column; text-align: left; line-height: 1.25; min-width: 0; }
.lum-wintext strong { font-family: var(--font-brand); font-weight: 600; font-size: 15px; color: var(--gray-0); }
.lum-winsub, .lum-windiff { color: var(--gray-300); font-size: 12.5px; }
.lum-wintime { color: var(--lum-accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.lum-replay { flex: none; border: none; background: var(--lum-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 9px 20px; cursor: pointer; }

@keyframes lum-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .lum-win, .lum-overlay { animation: none; }
}
`;
