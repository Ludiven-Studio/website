import { useState, useEffect, useRef, useCallback } from 'react';
import {
	makeTable, generateRack, stepBalls, aimToVelocity, pullPower, isSettled,
	encodeScore, DIFFS, type Ball, type Table, type Vec,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   BILLARD — React island (2D canvas).
   Rentre les 3 boules colorées avec la blanche (visée à la fronde).
   Fausse blanche → replacée + 1 coup. Score : coups, chrono départage.
   Moteur pur/testé dans ./engine.
   ===================================================== */

type Status = 'aiming' | 'rolling' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const STEP = 1000 / 60;
const GRAB_R = 18; // table units: start aiming when grabbing near the cue ball
const COLORS = ['#e6566f', '#f0a830', '#5b8def', '#2f9e6f', '#9b6cf0']; // colour balls 0..4
const CUE_COLOR = '#f4f4f2';
const FELT = '#0f7a52';
const FELT_DARK = '#0c6644';
const FELT_TILES = 10; // felt-texture repeats across the table width (higher = finer nap)
const MIN_FLOOR = 16; // minimum floor units around the table (the floor then fills all remaining space)

const SINK_MS = 280; // pot animation duration
type Sink = { x: number; y: number; px: number; py: number; r: number; color: number; kind: 'cue' | 'color'; t0: number };

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface DailyState { best?: number; tries: number; }

export default function BillardGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [status, setStatus] = useState<Status>('aiming');
	const [strokes, setStrokes] = useState(0);
	const [remaining, setRemaining] = useState(3);
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState<number | null>(null);
	const [scratchFlash, setScratchFlash] = useState(false);
	// Daily
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const tableRef = useRef<Table>(makeTable());
	const ballsRef = useRef<Ball[]>([]);
	const scaleRef = useRef(1);
	const offsetRef = useRef({ x: MIN_FLOOR, y: MIN_FLOOR }); // world units of floor left/top of the centred table
	const aimRef = useRef<{ pull: Vec } | null>(null);
	const statusRef = useRef<Status>('aiming');
	const rollingRef = useRef(false);
	const strokesRef = useRef(0);
	const startRef = useRef(0); // chrono start (epoch ms), 0 = not started
	const finishedRef = useRef(false);
	const rafRef = useRef<number | null>(null);
	const accRef = useRef(0);
	const lastRef = useRef(0);
	const sinksRef = useRef<Sink[]>([]); // active pot animations
	const seenRef = useRef<Set<number>>(new Set()); // ball indices already animated
	const dailyRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const bestRef = useRef<number | null>(null);
	const triesRef = useRef(0);
	const feltImgRef = useRef<HTMLImageElement | null>(null); // AI felt (else flat green)
	const floorImgRef = useRef<HTMLImageElement | null>(null); // AI floor around the table
	const [isFs, setIsFs] = useState(false); // immersive fullscreen

	// Load the felt + floor textures once (RAF loop picks them up next frame).
	useEffect(() => {
		const load = (src: string, ref: React.RefObject<HTMLImageElement | null>) => {
			const img = new Image();
			img.onload = () => { ref.current = img; };
			img.src = src;
		};
		load('/assets/jeux/billard/felt.jpg', feltImgRef);
		load('/assets/jeux/billard/floor.jpg', floorImgRef);
	}, []);

	// Fullscreen (immersive) toggle on the play area.
	const toggleFs = () => {
		const el = wrapRef.current;
		if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
		else document.exitFullscreen?.();
	};
	useEffect(() => {
		const onFs = () => setIsFs(!!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	}, []);

	const { celebrating } = useCelebration(status === 'won');

	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };

	const freeBestKey = (k: string) => `ludiven-billard-best-${k}`;

	/* ---------- Table setup ---------- */
	const layTable = useCallback((key: keyof typeof DIFFS, seed: number) => {
		const t = tableRef.current;
		ballsRef.current = generateRack(t, mulberry32(seed), DIFFS[key]);
		sinksRef.current = [];
		seenRef.current.clear();
		strokesRef.current = 0;
		startRef.current = 0;
		finishedRef.current = false;
		rollingRef.current = false;
		aimRef.current = null;
		setStrokes(0);
		setRemaining(ballsRef.current.filter((b) => b.kind === 'color').length);
		setElapsed(0);
		setStat('aiming');
	}, []);

	const newFreeTable = useCallback((key: keyof typeof DIFFS) => {
		setDaily(false);
		setDiffKey(key);
		const lb = localStorage.getItem(freeBestKey(key));
		const stored = lb ? Number(lb) : null;
		bestRef.current = stored; // seed the ref so win() keeps the real record, not just this session's
		setBest(stored);
		layTable(key, (Math.random() * 2 ** 31) >>> 0);
	}, [layTable]);

	const startDaily = useCallback(async () => {
		setDaily(true);
		setDailyLoading(true);
		const run = loadDailyRun(gameId);
		const { seed, diffIndex } = run?.seed != null ? { seed: run.seed, diffIndex: run.diffIndex ?? 0 } : await getDaily(gameId);
		dailyRef.current = { seed, diffIndex };
		const key = DIFF_ORDER[diffIndex] ?? 'facile';
		setDiffKey(key);
		const st = (run?.state as DailyState) ?? { tries: 0 };
		triesRef.current = st.tries ?? 0;
		// Ignore an implausible stored best (< 100000 = fewer than 1 stroke): a corrupt value must not block real improvements.
		const validBest = typeof st.best === 'number' && st.best >= 100000 ? st.best : null;
		bestRef.current = validBest;
		setBest(validBest);
		layTable(key, seed);
		if (run?.startedAt && !run.done) startRef.current = run.startedAt; // resume the timer only for an unfinished run
		setDailyLoading(false);
	}, [gameId, layTable]);

	/* ---------- Resolve end of a shot ---------- */
	const resolveShot = useCallback(() => {
		const balls = ballsRef.current;
		const cue = balls.find((b) => b.kind === 'cue')!;
		if (cue.potted) {
			// scratch: respawn cue at start + 1 stroke penalty (let its sink anim finish on its own)
			seenRef.current.delete(balls.indexOf(cue));
			cue.potted = false;
			cue.x = tableRef.current.cueStart.x;
			cue.y = tableRef.current.cueStart.y;
			cue.vx = cue.vy = 0;
			strokesRef.current += 1;
			setStrokes(strokesRef.current);
			setScratchFlash(true);
			setTimeout(() => setScratchFlash(false), 1100);
		}
		const left = balls.filter((b) => b.kind === 'color' && !b.potted).length;
		setRemaining(left);
		if (left === 0) {
			finishedRef.current = true;
			const timeSec = (Date.now() - startRef.current) / 1000;
			const score = encodeScore(strokesRef.current, timeSec);
			setElapsed(timeSec);
			setStat('won');
			trackGame(gameId, 'game_won', { strokes: strokesRef.current });
			const prev = bestRef.current;
			const newBest = prev == null ? score : Math.min(prev, score);
			bestRef.current = newBest;
			setBest(newBest);
			if (daily) {
				triesRef.current += 1;
				saveDailyRun(gameId, {
					startedAt: startRef.current, done: true,
					seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex,
					state: { best: newBest, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				localStorage.setItem(freeBestKey(diffKey), String(newBest));
			}
		} else {
			setStat('aiming');
		}
	}, [daily, diffKey, gameId]);

	/* ---------- Pointer (slingshot) ---------- */
	const pointerToTable = (e: PointerEvent): Vec => {
		const rect = canvasRef.current!.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) / scaleRef.current - offsetRef.current.x,
			y: (e.clientY - rect.top) / scaleRef.current - offsetRef.current.y,
		};
	};

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const cueBall = () => ballsRef.current.find((b) => b.kind === 'cue');

		const down = (e: PointerEvent) => {
			if (statusRef.current !== 'aiming') return;
			const cue = cueBall();
			if (!cue) return;
			const p = pointerToTable(e);
			if (Math.hypot(p.x - cue.x, p.y - cue.y) > GRAB_R) return;
			aimRef.current = { pull: { x: 0, y: 0 } };
			cv.setPointerCapture(e.pointerId);
			e.preventDefault();
		};
		const move = (e: PointerEvent) => {
			if (!aimRef.current) return;
			const cue = cueBall();
			if (!cue) return;
			const p = pointerToTable(e);
			aimRef.current.pull = { x: p.x - cue.x, y: p.y - cue.y };
		};
		const up = () => {
			const aim = aimRef.current;
			aimRef.current = null;
			if (!aim || statusRef.current !== 'aiming') return;
			const v = aimToVelocity(aim.pull);
			if (!v) return;
			const cue = cueBall();
			if (!cue) return;
			cue.vx = v.vx; cue.vy = v.vy;
			if (startRef.current === 0) {
				startRef.current = Date.now();
				trackGame(gameId, 'game_started');
				if (daily) saveDailyRun(gameId, {
					startedAt: startRef.current, done: false,
					seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex,
					state: { best: bestRef.current ?? undefined, tries: triesRef.current } satisfies DailyState,
				});
			}
			strokesRef.current += 1;
			setStrokes(strokesRef.current);
			rollingRef.current = true;
			setStat('rolling');
		};

		cv.addEventListener('pointerdown', down);
		cv.addEventListener('pointermove', move);
		cv.addEventListener('pointerup', up);
		cv.addEventListener('pointercancel', up);
		return () => {
			cv.removeEventListener('pointerdown', down);
			cv.removeEventListener('pointermove', move);
			cv.removeEventListener('pointerup', up);
			cv.removeEventListener('pointercancel', up);
		};
	}, [daily, gameId]);

	/* ---------- Resize ---------- */
	useEffect(() => {
		const cv = canvasRef.current, wrap = wrapRef.current;
		if (!cv || !wrap) return;
		const resize = () => {
			const t = tableRef.current;
			// The canvas fills its container; the table is centred and the floor fills all the rest.
			const cssW = wrap.clientWidth;
			const cssH = wrap.clientHeight || cssW * 0.625;
			const scale = Math.min(cssW / (t.w + 2 * MIN_FLOOR), cssH / (t.h + 2 * MIN_FLOOR));
			scaleRef.current = scale;
			offsetRef.current = { x: (cssW / scale - t.w) / 2, y: (cssH / scale - t.h) / 2 };
			const dpr = window.devicePixelRatio || 1;
			cv.style.width = `${cssW}px`;
			cv.style.height = `${cssH}px`;
			cv.width = Math.round(cssW * dpr);
			cv.height = Math.round(cssH * dpr);
			const ctx = cv.getContext('2d');
			const s = dpr * scale;
			if (ctx) ctx.setTransform(s, 0, 0, s, s * offsetRef.current.x, s * offsetRef.current.y);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, []);

	/* ---------- Render + physics loop ---------- */
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d')!;
		const t = tableRef.current;

		const draw = (now: number) => {
			const ox = offsetRef.current.x, oy = offsetRef.current.y;
			const VW = t.w + 2 * ox, VH = t.h + 2 * oy;
			ctx.clearRect(-ox, -oy, VW, VH);
			// Floor filling the whole view (tiled) — the table sits centred on it.
			const floor = floorImgRef.current;
			const floorPat = floor && ctx.createPattern(floor, 'repeat');
			if (floorPat) {
				const fscale = t.w / 4 / floor!.width; // floor tile ≈ quarter of the table width
				floorPat.setTransform(new DOMMatrix([fscale, 0, 0, fscale, 0, 0]));
				ctx.fillStyle = floorPat;
			} else {
				ctx.fillStyle = '#3a2a1c';
			}
			ctx.fillRect(-ox, -oy, VW, VH);
			// Wood frame + drop shadow so the table sits above the floor.
			ctx.save();
			ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 4;
			ctx.fillStyle = '#3a2416';
			ctx.fillRect(-4, -4, t.w + 8, t.h + 8);
			ctx.restore();
			// cloth — tiled pattern (not a stretched drawImage, which magnified the nap ~x100)
			const felt = feltImgRef.current;
			const feltPat = felt && ctx.createPattern(felt, 'repeat');
			if (feltPat) {
				const s = t.w / FELT_TILES / felt!.width; // ~FELT_TILES felt tiles across the 200u table
				feltPat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
				ctx.fillStyle = feltPat;
			} else {
				ctx.fillStyle = FELT;
			}
			ctx.fillRect(0, 0, t.w, t.h);
			ctx.fillStyle = FELT_DARK;
			ctx.fillRect(0, 0, t.w, 1.5); ctx.fillRect(0, t.h - 1.5, t.w, 1.5);
			ctx.fillRect(0, 0, 1.5, t.h); ctx.fillRect(t.w - 1.5, 0, 1.5, t.h);
			// pockets — geometry (centre + radius) comes from the engine so the drawn
			// mouth matches the capture zone exactly.
			for (const p of t.pockets) {
				ctx.fillStyle = '#161616';
				ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = 'rgba(0,0,0,0.35)'; // soft inner shadow rim
				ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.78, 0, Math.PI * 2); ctx.fill();
				ctx.lineWidth = 1.6; // dark-green rim around the hole
				ctx.strokeStyle = '#0a3d29';
				ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
			}
			// balls
			for (const b of ballsRef.current) {
				if (b.potted) continue;
				ctx.beginPath();
				ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
				ctx.fillStyle = b.kind === 'cue' ? CUE_COLOR : COLORS[b.color] ?? '#fff';
				ctx.fill();
				ctx.lineWidth = 0.5;
				ctx.strokeStyle = 'rgba(0,0,0,0.35)';
				ctx.stroke();
				// highlight
				ctx.beginPath();
				ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.32, 0, Math.PI * 2);
				ctx.fillStyle = 'rgba(255,255,255,0.45)';
				ctx.fill();
			}
			// pot animations: ball sinks to the hole centre, shrinking and darkening
			for (const s of sinksRef.current) {
				const e = Math.min(1, (now - s.t0) / SINK_MS);
				const ease = e * e; // accelerate inward as it drops
				const x = s.x + (s.px - s.x) * ease;
				const y = s.y + (s.py - s.y) * ease;
				const r = s.r * (1 - 0.82 * ease);
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fillStyle = s.kind === 'cue' ? CUE_COLOR : COLORS[s.color] ?? '#fff';
				ctx.fill();
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.82 * ease})`;
				ctx.fill();
			}
			// aim guide
			const aim = aimRef.current;
			const cue = ballsRef.current.find((b) => b.kind === 'cue');
			if (aim && cue && statusRef.current === 'aiming') {
				const pw = pullPower(aim.pull);
				const m = Math.hypot(aim.pull.x, aim.pull.y);
				if (m > 0.001) {
					const dx = -aim.pull.x / m, dy = -aim.pull.y / m;
					const guideLen = 14 + pw * 70;
					// shot direction
					ctx.setLineDash([3, 3]);
					ctx.lineWidth = 1;
					ctx.strokeStyle = `hsl(${(1 - pw) * 120}, 85%, 55%)`;
					ctx.beginPath();
					ctx.moveTo(cue.x, cue.y);
					ctx.lineTo(cue.x + dx * guideLen, cue.y + dy * guideLen);
					ctx.stroke();
					ctx.setLineDash([]);
					// pull-back marker
					ctx.strokeStyle = 'rgba(255,255,255,0.5)';
					ctx.beginPath();
					ctx.moveTo(cue.x, cue.y);
					ctx.lineTo(cue.x + aim.pull.x, cue.y + aim.pull.y);
					ctx.stroke();
				}
			}
		};

		const frame = (now: number) => {
			if (!lastRef.current) lastRef.current = now;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			while (accRef.current >= STEP) {
				accRef.current -= STEP;
				if (rollingRef.current) {
					stepBalls(ballsRef.current, t, STEP / 1000);
					if (isSettled(ballsRef.current)) {
						rollingRef.current = false;
						resolveShot();
					}
				}
			}
			// spawn a pot animation for any ball that just dropped
			const balls = ballsRef.current;
			for (let i = 0; i < balls.length; i++) {
				const b = balls[i];
				if (b.potted && !seenRef.current.has(i)) {
					seenRef.current.add(i);
					let bp = t.pockets[0], bd = Infinity;
					for (const p of t.pockets) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; bp = p; } }
					sinksRef.current.push({ x: b.x, y: b.y, px: bp.x, py: bp.y, r: b.r, color: b.color, kind: b.kind, t0: now });
				}
			}
			sinksRef.current = sinksRef.current.filter((s) => now - s.t0 < SINK_MS);
			if (startRef.current && !finishedRef.current) setElapsed((Date.now() - startRef.current) / 1000);
			draw(now);
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastRef.current = 0; };
	}, [resolveShot]);

	/* ---------- Init ---------- */
	useEffect(() => { newFreeTable('facile'); }, [newFreeTable]);

	const bestLabel = best == null ? '—' : formatScore(DAILY_LB.billard.fmt, best);

	return (
		<div className="bi-root">
			<style>{CSS}</style>

			<div className="bi-playwrap" ref={wrapRef}>
				{celebrating && <Celebration />}
				<canvas ref={canvasRef} className="bi-canvas" />

				<div className="bi-hud-top">
					<ModeToggle daily={daily} onFree={() => daily && newFreeTable(diffKey)} onDaily={startDaily} />
					<div className="bi-stats">
						<span className="bi-stat">🎱 {strokes}</span>
						<span className="bi-stat">🎯 {remaining}</span>
						<span className="bi-stat">⏱ {fmtTime(elapsed)}</span>
					</div>
					<div className="bi-hud-actions">
						{!daily && (Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} className={`bi-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newFreeTable(k)}>{DIFFS[k].label}</button>
						))}
						<button className="bi-act" onClick={() => newFreeTable(diffKey)} aria-label="Nouvelle table" title="Nouvelle table">↻</button>
						<button className="bi-act" onClick={toggleFs} aria-label={isFs ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran">{isFs ? '⤡' : '⛶'}</button>
					</div>
				</div>
				{daily && (
					<div className="bi-daily-tag bi-daily-hud">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
					</div>
				)}

				{scratchFlash && <div className="bi-scratch">Pénalité · +1 coup</div>}
				{status === 'won' && (
					<div className="bi-overlay">
						<div className="bi-overlay-card">
							🎉 Gagné en <strong>{strokes} coups</strong> · {fmtTime(elapsed)}
							<button className="bi-replay" onClick={() => (daily ? layTable(diffKey, dailyRef.current!.seed) : newFreeTable(diffKey))}>
								{daily ? 'Rejouer la table' : 'Nouvelle table'}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="bi-help">
				Glisse depuis la boule blanche puis relâche : tu tires dans le sens opposé, plus tu tires loin plus
				c'est puissant. Rentre toutes les boules colorées. {daily ? 'Le chrono départage les ex æquo.' : `Record : ${bestLabel}.`}
			</p>

			{daily && <Leaderboard
				key={`lb-${best ?? 0}`}
				game={`${gameId}-t`}
				metric="time"
				submitValue={status === 'won' && best != null ? best : undefined}
				format={(v) => formatScore(DAILY_LB.billard.fmt, v)}
			/>}
			{!daily && <LeaderboardCorner
				game={`${gameId}-t`}
				metric="time"
				format={(v) => formatScore(DAILY_LB.billard.fmt, v)}
			/>}
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.bi-root {
  --bi-accent: var(--accent-regular);
  width: 100%; max-width: 1040px; margin-inline: auto; color: var(--gray-0);
  font-family: var(--font-body); display: flex; flex-direction: column; align-items: center;
}

/* Play area holds the canvas + all controls overlaid (immersive). */
.bi-playwrap { width: 100%; aspect-ratio: 16 / 10; position: relative; overflow: hidden; border-radius: 14px; box-shadow: var(--shadow-lg); }
.bi-canvas { display: block; touch-action: none; cursor: crosshair; background: #3a2a1c; }
.bi-playwrap:fullscreen { width: 100vw; height: 100vh; aspect-ratio: auto; border-radius: 0; box-shadow: none; }

/* Overlaid HUD — sits on the floor above the table; dark translucent so it reads on any surface. */
.bi-hud-top { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; z-index: 3; pointer-events: none; }
.bi-hud-top > * { pointer-events: auto; }
.bi-hud-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.bi-daily-hud { position: absolute; top: 52px; left: 50%; transform: translateX(-50%); z-index: 3; background: rgba(20,14,10,0.6); color: #f0e6da; font-size: 12.5px; font-weight: 500; padding: 5px 14px; border-radius: 999px; margin: 0; backdrop-filter: blur(4px); }

.bi-stats { display: flex; gap: 6px; font-weight: 700; font-size: 13px; flex-wrap: wrap; }
.bi-stat { background: rgba(20,14,10,0.6); color: #f4ece2; border-radius: 999px; padding: 5px 11px; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0,0,0,0.35); }

.bi-pill { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(20,14,10,0.55); color: #f0e6da; font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; backdrop-filter: blur(4px); transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.bi-pill.active { background: var(--bi-accent); color: var(--accent-text-over); border-color: var(--bi-accent); }
.bi-act { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(20,14,10,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 6px 12px; min-width: 36px; cursor: pointer; backdrop-filter: blur(4px); }
.bi-act:hover { border-color: var(--bi-accent); color: #fff; }

.bi-scratch { position: absolute; top: 48px; left: 50%; transform: translateX(-50%); z-index: 3; background: #d9534f; color: #fff; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; box-shadow: var(--shadow-md); }

.bi-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.bi-overlay-card { background: var(--gray-999); border: 2px solid var(--bi-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.bi-overlay-card strong { color: var(--bi-accent); }
.bi-replay { border: none; background: var(--bi-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }

.bi-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
