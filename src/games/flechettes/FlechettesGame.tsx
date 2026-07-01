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
const HALF_FRAME = 0.3; // aim-frame half-size (normalised board units)
const TAP_THRESH = 0.05; // movement below this = a tap (not a drag)
const clampAim = (x: number, y: number) => { const r = Math.hypot(x, y); const k = r > 1 ? 1 / r : 1; return { x: x * k, y: y * k }; };

/** What to aim for to finish 501 on a double (null = not directly finishable). */
const checkout = (rem: number): string | null =>
	rem === 50 ? 'Bullseye (50)' : rem <= 40 && rem % 2 === 0 ? `Double ${rem / 2}` : null;
const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface DailyState { best?: number; tries: number; }
interface Dart { x: number; y: number; ring: string; value: number; }
const TURN = 3; // darts per turn (volée)

const ringLabel = (h: Hit): string =>
	h.ring === 'bullseye' ? 'Bullseye 50' : h.ring === 'bull' ? 'Bull 25' :
	h.ring === 'triple' ? `Triple ${h.sector} (${h.value})` : h.ring === 'double' ? `Double ${h.sector} (${h.value})` :
	h.ring === 'single' ? `${h.sector}` : 'Raté';

export default function FlechettesGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [status, setStatus] = useState<Status>('aiming');
	const [remaining, setRemaining] = useState(START_SCORE);
	const [darts, setDarts] = useState(0);
	const [turn, setTurn] = useState(0); // darts thrown in the current volley (0..3)
	const [lastTxt, setLastTxt] = useState('');
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState<number | null>(null);
	const [flash, setFlash] = useState('');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const sizeRef = useRef(360); // css px (square)
	const aimRef = useRef({ x: 0, y: -0.45 }); // aim-frame centre (normalised board coords)
	const downRef = useRef<{ x: number; y: number } | null>(null); // pointer-down board pos
	const movedRef = useRef(false);
	const statusRef = useRef<Status>('aiming');
	const remainingRef = useRef(START_SCORE);
	const dartsRef = useRef<Dart[]>([]); // darts of the CURRENT volley (max 3, cleared each new turn)
	const throwsRef = useRef(0); // total darts thrown
	const dartIdxRef = useRef(0);
	const dartStartRef = useRef(0); // perf.now when the current dart's oscillation began
	const clearTimerRef = useRef<number | null>(null); // auto-clears the volley 3s after the 3rd dart
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
		if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
		seedRef.current = seed;
		diffRef.current = DIFFS[key];
		remainingRef.current = START_SCORE;
		dartsRef.current = [];
		throwsRef.current = 0;
		dartIdxRef.current = 0;
		dartStartRef.current = (typeof performance !== 'undefined' ? performance.now() : 0);
		aimRef.current = { x: 0, y: -0.45 }; // start aiming at the 20
		downRef.current = null;
		movedRef.current = false;
		startRef.current = 0;
		finishedRef.current = false;
		setRemaining(START_SCORE);
		setDarts(0);
		setTurn(0);
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
		const score = encodeScore(throwsRef.current, timeSec);
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

	/* ---------- Aim frame: drag to move, tap inside to throw ---------- */
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const toBoard = (e: PointerEvent) => {
			const rect = cv.getBoundingClientRect();
			const R = sizeRef.current * 0.42, cx = sizeRef.current / 2, cy = sizeRef.current / 2;
			return { x: (e.clientX - rect.left - cx) / R, y: (e.clientY - rect.top - cy) / R };
		};
		const fire = () => {
			if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; } // a throw cancels the pending auto-clear
			const now = (typeof performance !== 'undefined' ? performance.now() : 0);
			const off = reticleAt(seedRef.current, dartIdxRef.current, diffRef.current, now - dartStartRef.current);
			const x = aimRef.current.x + off.x * HALF_FRAME, y = aimRef.current.y + off.y * HALF_FRAME;
			const hit = dartScore(x, y);
			if (dartsRef.current.length >= TURN) dartsRef.current = []; // new volley → retrieve the previous 3
			dartsRef.current.push({ x, y, ring: hit.ring, value: hit.value });
			throwsRef.current += 1;
			dartIdxRef.current += 1;
			dartStartRef.current = now;
			setDarts(throwsRef.current);
			setTurn(dartsRef.current.length);
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
			else if (dartsRef.current.length >= TURN && !finishedRef.current) {
				clearTimerRef.current = window.setTimeout(() => { dartsRef.current = []; setTurn(0); clearTimerRef.current = null; }, 3000);
			}
		};
		const down = (e: PointerEvent) => {
			if (statusRef.current !== 'aiming') return;
			e.preventDefault();
			downRef.current = toBoard(e);
			movedRef.current = false;
			cv.setPointerCapture(e.pointerId);
		};
		const move = (e: PointerEvent) => {
			if (!downRef.current) return;
			const p = toBoard(e);
			if (Math.hypot(p.x - downRef.current.x, p.y - downRef.current.y) > TAP_THRESH) movedRef.current = true;
			if (movedRef.current) aimRef.current = clampAim(p.x, p.y); // drag repositions the frame
		};
		const up = () => {
			const d = downRef.current;
			downRef.current = null;
			if (!d || statusRef.current !== 'aiming') return;
			if (movedRef.current) return; // it was a drag → no throw
			const inFrame = Math.abs(d.x - aimRef.current.x) <= HALF_FRAME && Math.abs(d.y - aimRef.current.y) <= HALF_FRAME;
			if (inFrame) fire();
			else aimRef.current = clampAim(d.x, d.y); // tap outside → move the frame there
		};
		cv.addEventListener('pointerdown', down);
		cv.addEventListener('pointermove', move);
		cv.addEventListener('pointerup', up);
		cv.addEventListener('pointercancel', up);
		return () => {
			if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
			cv.removeEventListener('pointerdown', down);
			cv.removeEventListener('pointermove', move);
			cv.removeEventListener('pointerup', up);
			cv.removeEventListener('pointercancel', up);
		};
	}, [daily, gameId, win]);

	/* ---------- Resize (square) ---------- */
	useEffect(() => {
		const cv = canvasRef.current, wrap = wrapRef.current;
		if (!cv || !wrap) return;
		const resize = () => {
			const s = Math.min(wrap.clientWidth, 470);
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
				const nx = cx + Math.sin(tc) * R * 1.05, ny = cy - Math.cos(tc) * R * 1.05; // on the rim, past the doubles
				ctx.fillText(String(SECTOR_ORDER[k]), nx, ny);
			}
		};

		const frame = () => {
			const S = sizeRef.current, cx = S / 2, cy = S / 2, R = S * 0.42;
			ctx.clearRect(0, 0, S, S);
			drawBoard(cx, cy, R);
			// landed darts of the current volley — the dart points at you, so you see its
			// flights (4 fins forming an X) from behind, with the barrel end in the middle.
			for (const d of dartsRef.current) {
				const px = cx + d.x * R, py = cy + d.y * R, rF = R * 0.055;
				ctx.save();
				ctx.translate(px, py);
				for (let k = 0; k < 4; k++) {
					const a = k * Math.PI / 2 + Math.PI / 4; // diagonal fins
					ctx.fillStyle = k % 2 ? '#e34b4b' : '#f4f4f2';
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(Math.cos(a - 0.34) * rF, Math.sin(a - 0.34) * rF);
					ctx.lineTo(Math.cos(a) * rF * 1.35, Math.sin(a) * rF * 1.35);
					ctx.lineTo(Math.cos(a + 0.34) * rF, Math.sin(a + 0.34) * rF);
					ctx.closePath();
					ctx.fill();
				}
				ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
				for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rF * 1.35, Math.sin(a) * rF * 1.35); ctx.stroke(); }
				ctx.fillStyle = '#9aa1a8'; ctx.beginPath(); ctx.arc(0, 0, rF * 0.32, 0, Math.PI * 2); ctx.fill(); // barrel end
				ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, rF * 0.15, 0, Math.PI * 2); ctx.fill();
				ctx.restore();
			}
			// aim frame + oscillating reticle inside it (only while aiming)
			if (statusRef.current === 'aiming') {
				const ac = aimRef.current;
				const fx = cx + ac.x * R, fy = cy + ac.y * R, fh = HALF_FRAME * R;
				// frame
				ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
				ctx.strokeRect(fx - fh, fy - fh, fh * 2, fh * 2);
				ctx.setLineDash([]);
				// reticle within the frame
				const now = (typeof performance !== 'undefined' ? performance.now() : 0);
				const off = reticleAt(seedRef.current, dartIdxRef.current, diffRef.current, now - dartStartRef.current);
				const px = fx + off.x * fh, py = fy + off.y * fh, rr = R * 0.05;
				ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
				ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
				ctx.beginPath(); ctx.moveTo(px - rr * 1.7, py); ctx.lineTo(px + rr * 1.7, py); ctx.moveTo(px, py - rr * 1.7); ctx.lineTo(px, py + rr * 1.7); ctx.stroke();
				ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(px, py, 1.7, 0, Math.PI * 2); ctx.fill();
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
				<span className="da-stat">🎯 Volée {Math.min(turn, TURN)}/{TURN}</span>
				<span className="da-stat">{darts} fléch.</span>
				<span className="da-stat">⏱ {fmtTime(elapsed)}</span>
			</div>
			<div className="da-last">{flash ? <span className="da-flash">{flash}</span> : lastTxt}</div>
			{status === 'aiming' && remaining <= 50 && (
				<div className="da-checkout">
					{checkout(remaining)
						? <>À finir : <strong>{checkout(remaining)}</strong></>
						: <>Pas finissable d'un coup : vise un simple pour laisser un <strong>double pair ≤ 40</strong>.</>}
				</div>
			)}

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
				<strong>Glisse le cadre</strong> sur la zone visée, puis <strong>tape dedans</strong> pour lancer : le
				viseur oscille dans le cadre. Pars de 501 et tombe pile à 0 sur un <strong>double</strong>. {daily ? 'Le chrono départage les ex æquo.' : `Record : ${bestLabel}.`}
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
.da-checkout { font-size: 12.5px; color: var(--gray-300); background: var(--accent-overlay); border: 1px solid var(--gray-800); border-radius: 999px; padding: 4px 12px; margin-bottom: 0.5rem; }
.da-checkout strong { color: var(--da-accent); }
.da-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.da-canvas { display: block; border-radius: 50%; box-shadow: var(--shadow-md); touch-action: none; cursor: pointer; background: #161616; }
.da-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.da-overlay-card { background: var(--gray-999); border: 2px solid var(--da-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.da-overlay-card strong { color: var(--da-accent); }
.da-replay { border: none; background: var(--da-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.da-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
