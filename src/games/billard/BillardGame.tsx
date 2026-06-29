import { useState, useEffect, useRef, useCallback } from 'react';
import {
	makeTable, generateRack, stepBalls, aimToVelocity, pullPower, isSettled,
	encodeScore, decodeScore, DIFFS, type Ball, type Table, type Vec,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
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
const COLORS = ['#e6566f', '#f0a830', '#5b8def']; // colour balls 0,1,2
const CUE_COLOR = '#f4f4f2';
const FELT = '#0f7a52';
const FELT_DARK = '#0c6644';

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
	const aimRef = useRef<{ pull: Vec } | null>(null);
	const statusRef = useRef<Status>('aiming');
	const rollingRef = useRef(false);
	const strokesRef = useRef(0);
	const startRef = useRef(0); // chrono start (epoch ms), 0 = not started
	const finishedRef = useRef(false);
	const rafRef = useRef<number | null>(null);
	const accRef = useRef(0);
	const lastRef = useRef(0);
	const dailyRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const bestRef = useRef<number | null>(null);
	const triesRef = useRef(0);

	const { celebrating } = useCelebration(status === 'won');

	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };

	const freeBestKey = (k: string) => `ludiven-billard-best-${k}`;

	/* ---------- Table setup ---------- */
	const layTable = useCallback((key: keyof typeof DIFFS, seed: number) => {
		const t = tableRef.current;
		ballsRef.current = generateRack(t, mulberry32(seed), DIFFS[key]);
		strokesRef.current = 0;
		startRef.current = 0;
		finishedRef.current = false;
		rollingRef.current = false;
		aimRef.current = null;
		setStrokes(0);
		setRemaining(3);
		setElapsed(0);
		setStat('aiming');
	}, []);

	const newFreeTable = useCallback((key: keyof typeof DIFFS) => {
		setDaily(false);
		setDiffKey(key);
		const lb = localStorage.getItem(freeBestKey(key));
		setBest(lb ? Number(lb) : null);
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
		bestRef.current = st.best ?? null;
		setBest(st.best ?? null);
		layTable(key, seed);
		if (run?.startedAt) startRef.current = run.startedAt;
		setDailyLoading(false);
	}, [gameId, layTable]);

	/* ---------- Resolve end of a shot ---------- */
	const resolveShot = useCallback(() => {
		const balls = ballsRef.current;
		const cue = balls.find((b) => b.kind === 'cue')!;
		if (cue.potted) {
			// scratch: respawn cue at start + 1 stroke penalty
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
		return { x: (e.clientX - rect.left) / scaleRef.current, y: (e.clientY - rect.top) / scaleRef.current };
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
			const cssW = Math.min(wrap.clientWidth, 560);
			const cssH = (cssW * t.h) / t.w;
			scaleRef.current = cssW / t.w;
			const dpr = window.devicePixelRatio || 1;
			cv.style.width = `${cssW}px`;
			cv.style.height = `${cssH}px`;
			cv.width = Math.round(cssW * dpr);
			cv.height = Math.round(cssH * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, 0, 0);
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

		const draw = () => {
			ctx.clearRect(0, 0, t.w, t.h);
			// cloth
			ctx.fillStyle = FELT;
			ctx.fillRect(0, 0, t.w, t.h);
			ctx.fillStyle = FELT_DARK;
			ctx.fillRect(0, 0, t.w, 1.5); ctx.fillRect(0, t.h - 1.5, t.w, 1.5);
			ctx.fillRect(0, 0, 1.5, t.h); ctx.fillRect(t.w - 1.5, 0, 1.5, t.h);
			// pockets
			ctx.fillStyle = '#1a1a1a';
			for (const p of t.pockets) { ctx.beginPath(); ctx.arc(p.x, p.y, t.pocketR, 0, Math.PI * 2); ctx.fill(); }
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
			if (startRef.current && !finishedRef.current) setElapsed((Date.now() - startRef.current) / 1000);
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastRef.current = 0; };
	}, [resolveShot]);

	/* ---------- Init ---------- */
	useEffect(() => { newFreeTable('facile'); }, [newFreeTable]);

	const bestLabel = best == null ? '—' : (() => { const d = decodeScore(best); return `${d.strokes} coups · ${fmtTime(d.timeSec)}`; })();

	return (
		<div className="bi-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newFreeTable(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="bi-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="bi-bar">
					<div className="bi-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`bi-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newFreeTable(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<button className="bi-act" onClick={() => newFreeTable(diffKey)}>↻ Nouvelle table</button>
				</div>
			)}

			<div className="bi-stats">
				<span className="bi-stat">🎱 {strokes} coups</span>
				<span className="bi-stat">🎯 {remaining} à rentrer</span>
				<span className="bi-stat">⏱ {fmtTime(elapsed)}</span>
			</div>

			<div className="bi-playwrap" ref={wrapRef}>
				{celebrating && <Celebration />}
				<canvas ref={canvasRef} className="bi-canvas" />
				{scratchFlash && <div className="bi-scratch">Fausse blanche · +1 coup</div>}
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
				c'est puissant. Rentre les 3 boules colorées. {daily ? 'Le chrono départage les ex æquo.' : `Record : ${bestLabel}.`}
			</p>

			{daily && <Leaderboard
				key={`lb-${best ?? 0}`}
				game={`${gameId}-t`}
				metric="time"
				submitValue={status === 'won' && best != null ? best : undefined}
				format={(v) => { const d = decodeScore(v); return `${d.strokes} coups · ${fmtTime(d.timeSec)}`; }}
			/>}
			{!daily && <LeaderboardCorner game={`${gameId}-t`} metric="time" />}
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.bi-root {
  --bi-accent: var(--accent-regular);
  width: 100%; max-width: 580px; margin-inline: auto; color: var(--gray-0);
  font-family: var(--font-body); display: flex; flex-direction: column; align-items: center;
}
.bi-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.bi-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.bi-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.bi-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.bi-pill.active { background: var(--bi-accent); color: var(--accent-text-over); border-color: var(--bi-accent); }
.bi-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.bi-act:hover { background: var(--gray-800); border-color: var(--bi-accent); color: var(--bi-accent); }

.bi-stats { display: flex; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.75rem; flex-wrap: wrap; justify-content: center; }
.bi-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; }

.bi-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.bi-canvas { display: block; border-radius: 10px; box-shadow: var(--shadow-md); touch-action: none; cursor: crosshair; background: ${FELT}; }

.bi-scratch { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: #d9534f; color: #fff; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; box-shadow: var(--shadow-md); }

.bi-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.bi-overlay-card { background: var(--gray-999); border: 2px solid var(--bi-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.bi-overlay-card strong { color: var(--bi-accent); }
.bi-replay { border: none; background: var(--bi-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }

.bi-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
