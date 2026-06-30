import { useState, useEffect, useRef, useCallback } from 'react';
import {
	dartScore, applyThrow, reticleAt, encodeScore, decodeScore, DIFFS, SECTOR_ORDER, RINGS, START_SCORE,
	type Hit,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   FLÉCHETTES — React island (2D canvas), mode 501.
   Le viseur oscille ; tape pour lancer. Tombe pile à 0 en finissant sur un double.
   Score : nombre de fléchettes, le chrono départage. Moteur pur/testé dans ./engine.
   ===================================================== */

type Status = 'aiming' | 'won';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface DailyState { best?: number; tries: number; }
interface Dart { x: number; y: number; ring: string; }

const ringLabel = (h: Hit): string =>
	h.ring === 'bullseye' ? 'Bullseye 50' : h.ring === 'bull' ? 'Bull 25' :
	h.ring === 'triple' ? `Triple ${h.sector} (${h.value})` : h.ring === 'double' ? `Double ${h.sector} (${h.value})` :
	h.ring === 'single' ? `${h.sector}` : 'Raté';

export default function FlechettesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [status, setStatus] = useState<Status>('aiming');
	const [remaining, setRemaining] = useState(START_SCORE);
	const [darts, setDarts] = useState(0);
	const [lastTxt, setLastTxt] = useState('');
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState<number | null>(null);
	const [flash, setFlash] = useState('');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const sizeRef = useRef(360); // css px (square)
	const statusRef = useRef<Status>('aiming');
	const remainingRef = useRef(START_SCORE);
	const dartsRef = useRef<Dart[]>([]);
	const dartIdxRef = useRef(0);
	const dartStartRef = useRef(0); // perf.now when the current dart's oscillation began
	const startRef = useRef(0); // chrono start (epoch ms)
	const finishedRef = useRef(false);
	const rafRef = useRef<number | null>(null);
	const seedRef = useRef(0);
	const diffRef = useRef(DIFFS.facile);
	const dailyRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const bestRef = useRef<number | null>(null);
	const triesRef = useRef(0);

	const { celebrating } = useCelebration(status === 'won');
	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };
	const freeBestKey = (k: string) => `ludiven-flechettes-best-${k}`;

	const lay = useCallback((key: keyof typeof DIFFS, seed: number) => {
		seedRef.current = seed;
		diffRef.current = DIFFS[key];
		remainingRef.current = START_SCORE;
		dartsRef.current = [];
		dartIdxRef.current = 0;
		dartStartRef.current = (typeof performance !== 'undefined' ? performance.now() : 0);
		startRef.current = 0;
		finishedRef.current = false;
		setRemaining(START_SCORE);
		setDarts(0);
		setLastTxt('');
		setElapsed(0);
		setFlash('');
		setStat('aiming');
	}, []);

	const newFree = useCallback((key: keyof typeof DIFFS) => {
		setDaily(false);
		setDiffKey(key);
		const lb = localStorage.getItem(freeBestKey(key));
		setBest(lb ? Number(lb) : null);
		lay(key, (Math.random() * 2 ** 31) >>> 0);
	}, [lay]);

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
		lay(key, seed);
		setDailyLoading(false);
	}, [gameId, lay]);

	const win = useCallback(() => {
		finishedRef.current = true;
		const timeSec = (Date.now() - startRef.current) / 1000;
		const score = encodeScore(dartsRef.current.length, timeSec);
		setElapsed(timeSec);
		setStat('won');
		trackGame(gameId, 'game_won', { darts: dartsRef.current.length });
		const nb = bestRef.current == null ? score : Math.min(bestRef.current, score);
		bestRef.current = nb;
		setBest(nb);
		if (daily) {
			triesRef.current += 1;
			saveDailyRun(gameId, { startedAt: startRef.current, done: true, seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex, state: { best: nb, tries: triesRef.current } satisfies DailyState });
		} else {
			localStorage.setItem(freeBestKey(diffKey), String(nb));
		}
	}, [daily, diffKey, gameId]);

	/* ---------- Throw on tap ---------- */
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const throwDart = (e: PointerEvent) => {
			if (statusRef.current !== 'aiming') return;
			e.preventDefault();
			const now = (typeof performance !== 'undefined' ? performance.now() : 0);
			const p = reticleAt(seedRef.current, dartIdxRef.current, diffRef.current, now - dartStartRef.current);
			const hit = dartScore(p.x, p.y);
			dartsRef.current.push({ x: p.x, y: p.y, ring: hit.ring });
			dartIdxRef.current += 1;
			dartStartRef.current = now;
			setDarts(dartsRef.current.length);
			setLastTxt(ringLabel(hit));
			if (startRef.current === 0) {
				startRef.current = Date.now();
				trackGame(gameId, 'game_started');
				if (daily) saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex, state: { best: bestRef.current ?? undefined, tries: triesRef.current } satisfies DailyState });
			}
			const res = applyThrow(remainingRef.current, hit);
			if (res.bust) { setFlash(remainingRef.current - hit.value < 0 || (remainingRef.current - hit.value) === 1 ? 'Dépassé !' : 'Raté le double !'); setTimeout(() => setFlash(''), 900); }
			remainingRef.current = res.remaining;
			setRemaining(res.remaining);
			if (res.finished) win();
		};
		cv.addEventListener('pointerdown', throwDart);
		return () => cv.removeEventListener('pointerdown', throwDart);
	}, [daily, gameId, win]);

	/* ---------- Resize (square) ---------- */
	useEffect(() => {
		const cv = canvasRef.current, wrap = wrapRef.current;
		if (!cv || !wrap) return;
		const resize = () => {
			const s = Math.min(wrap.clientWidth, 420);
			sizeRef.current = s;
			const dpr = window.devicePixelRatio || 1;
			cv.style.width = `${s}px`;
			cv.style.height = `${s}px`;
			cv.width = Math.round(s * dpr);
			cv.height = Math.round(s * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, []);

	/* ---------- Render loop ---------- */
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d')!;
		const { R_BULLSEYE, R_BULL, R_TRIPLE_IN, R_TRIPLE_OUT, R_DOUBLE_IN } = RINGS;

		const wedge = (cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number, fill: string) => {
			ctx.beginPath();
			ctx.arc(cx, cy, rOut, a0, a1);
			ctx.arc(cx, cy, rIn, a1, a0, true);
			ctx.closePath();
			ctx.fillStyle = fill;
			ctx.fill();
		};

		const drawBoard = (cx: number, cy: number, R: number) => {
			ctx.fillStyle = '#161616'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2); ctx.fill(); // rim
			for (let k = 0; k < 20; k++) {
				const tc = k * Math.PI / 10; // board angle (clockwise from top)
				const a0 = tc - Math.PI / 20 - Math.PI / 2, a1 = tc + Math.PI / 20 - Math.PI / 2;
				const single = k % 2 ? '#e9e0c8' : '#2a2a26';
				const ring = k % 2 ? '#d23b32' : '#1f9e57';
				wedge(cx, cy, R_BULL * R, R_TRIPLE_IN * R, a0, a1, single);
				wedge(cx, cy, R_TRIPLE_IN * R, R_TRIPLE_OUT * R, a0, a1, ring);
				wedge(cx, cy, R_TRIPLE_OUT * R, R_DOUBLE_IN * R, a0, a1, single);
				wedge(cx, cy, R_DOUBLE_IN * R, R, a0, a1, ring);
			}
			ctx.fillStyle = '#1f9e57'; ctx.beginPath(); ctx.arc(cx, cy, R_BULL * R, 0, Math.PI * 2); ctx.fill();
			ctx.fillStyle = '#d23b32'; ctx.beginPath(); ctx.arc(cx, cy, R_BULLSEYE * R, 0, Math.PI * 2); ctx.fill();
			// numbers
			ctx.fillStyle = '#f4f4f2'; ctx.font = `${Math.round(R * 0.11)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			for (let k = 0; k < 20; k++) {
				const tc = k * Math.PI / 10;
				const nx = cx + Math.sin(tc) * R * 1.0, ny = cy - Math.cos(tc) * R * 1.0; // canvas: top = -y
				ctx.fillText(String(SECTOR_ORDER[k]), nx, ny);
			}
		};

		const frame = () => {
			const S = sizeRef.current, cx = S / 2, cy = S / 2, R = S * 0.42;
			ctx.clearRect(0, 0, S, S);
			drawBoard(cx, cy, R);
			// landed darts
			for (const d of dartsRef.current) {
				const px = cx + d.x * R, py = cy + d.y * R;
				ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
			}
			// oscillating reticle (only while aiming)
			if (statusRef.current === 'aiming') {
				const now = (typeof performance !== 'undefined' ? performance.now() : 0);
				const p = reticleAt(seedRef.current, dartIdxRef.current, diffRef.current, now - dartStartRef.current);
				const px = cx + p.x * R, py = cy + p.y * R, rr = R * 0.06;
				ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
				ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
				ctx.beginPath(); ctx.moveTo(px - rr * 1.6, py); ctx.lineTo(px + rr * 1.6, py); ctx.moveTo(px, py - rr * 1.6); ctx.lineTo(px, py + rr * 1.6); ctx.stroke();
				ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
			}
			if (startRef.current && !finishedRef.current) setElapsed((Date.now() - startRef.current) / 1000);
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
	}, []);

	useEffect(() => { newFree('facile'); }, [newFree]);

	const bestLabel = best == null ? '—' : (() => { const d = decodeScore(best); return `${d.darts} fléchettes · ${fmtTime(d.timeSec)}`; })();

	return (
		<div className="da-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="da-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · 501`}
				</div>
			) : (
				<div className="da-bar">
					<div className="da-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`da-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newFree(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<button className="da-act" onClick={() => newFree(diffKey)}>↻ Nouvelle manche</button>
				</div>
			)}

			<div className="da-stats">
				<span className="da-rem">{remaining}</span>
				<span className="da-stat">🎯 {darts} fléch.</span>
				<span className="da-stat">⏱ {fmtTime(elapsed)}</span>
			</div>
			<div className="da-last">{flash ? <span className="da-flash">{flash}</span> : lastTxt}</div>

			<div className="da-playwrap" ref={wrapRef}>
				{celebrating && <Celebration />}
				<canvas ref={canvasRef} className="da-canvas" />
				{status === 'won' && (
					<div className="da-overlay">
						<div className="da-overlay-card">
							🎉 501 fini en <strong>{darts} fléchettes</strong> · {fmtTime(elapsed)}
							<button className="da-replay" onClick={() => (daily ? lay(diffKey, dailyRef.current!.seed) : newFree(diffKey))}>
								{daily ? 'Rejouer le défi' : 'Nouvelle manche'}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="da-help">
				Le viseur oscille : <strong>tape</strong> pour lancer la fléchette. Pars de 501 et tombe pile à 0
				en finissant sur un <strong>double</strong>. {daily ? 'Le chrono départage les ex æquo.' : `Record : ${bestLabel}.`}
			</p>

			{daily && <Leaderboard
				key={`lb-${best ?? 0}`}
				game={`${gameId}-t`}
				metric="time"
				submitValue={status === 'won' && best != null ? best : undefined}
				format={(v) => { const d = decodeScore(v); return `${d.darts} fléch. · ${fmtTime(d.timeSec)}`; }}
			/>}
			{!daily && <LeaderboardCorner game={`${gameId}-t`} metric="time" format={(v) => { const d = decodeScore(v); return `${d.darts} fléch. · ${fmtTime(d.timeSec)}`; }} />}
		</div>
	);
}

const CSS = `
.da-root { --da-accent: var(--accent-regular); width: 100%; max-width: 460px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.da-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.da-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.da-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.da-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.da-pill.active { background: var(--da-accent); color: var(--accent-text-over); border-color: var(--da-accent); }
.da-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.da-act:hover { background: var(--gray-800); border-color: var(--da-accent); color: var(--da-accent); }
.da-stats { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.2rem; }
.da-rem { font-weight: 900; font-size: 30px; color: var(--da-accent); font-variant-numeric: tabular-nums; }
.da-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; font-weight: 700; font-size: 13px; }
.da-last { min-height: 18px; font-size: 13px; font-weight: 600; color: var(--gray-300); margin-bottom: 0.5rem; }
.da-flash { color: #fff; background: #d9534f; border-radius: 999px; padding: 3px 12px; }
.da-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.da-canvas { display: block; border-radius: 50%; box-shadow: var(--shadow-md); touch-action: none; cursor: pointer; background: #161616; }
.da-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.da-overlay-card { background: var(--gray-999); border: 2px solid var(--da-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.da-overlay-card strong { color: var(--da-accent); }
.da-replay { border: none; background: var(--da-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.da-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
