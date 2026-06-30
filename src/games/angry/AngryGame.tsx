import { useState, useEffect, useRef, useCallback } from 'react';
import {
	makeLevel, step, foxesLeft, spawnCocotte, aimToVelocity, pullPower, predictTrajectory,
	encodeScore, decodeScore, DIFFS, type World, type Body, type Vec,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   ANGRY COCOTTE — React island (2D canvas, gravity).
   Lance la cocotte à la fronde pour faire tomber les renards. Score : cocottes,
   chrono départage. Moteur pur/testé dans ./engine.
   ===================================================== */

type Status = 'aiming' | 'rolling' | 'won' | 'lost';
const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
const STEP = 1000 / 60;
const GRAB_R = 28; // world units: grab near the cocotte to aim
const SETTLE_TIMEOUT = 4500; // ms: force next shot if the world won't settle
const SINK_MS = 420; // explosion duration

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface DailyState { best?: number; tries: number; }
interface Boom { x: number; y: number; t0: number; }

export default function AngryGame({ gameId }: { gameId: string }) {
	const [diffKey, setDiffKey] = useState<keyof typeof DIFFS>('facile');
	const [status, setStatus] = useState<Status>('aiming');
	const [shots, setShots] = useState(0); // cocottes lancées (illimité)
	const [foxes, setFoxes] = useState(0);
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState<number | null>(null);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const worldRef = useRef<World | null>(null);
	const scaleRef = useRef(1);
	const aimRef = useRef<{ pull: Vec } | null>(null);
	const statusRef = useRef<Status>('aiming');
	const rollingRef = useRef(false);
	const shotsUsedRef = useRef(0);
	const startRef = useRef(0);
	const finishedRef = useRef(false);
	const settleAccRef = useRef(0);
	const rafRef = useRef<number | null>(null);
	const accRef = useRef(0);
	const lastRef = useRef(0);
	const boomsRef = useRef<Boom[]>([]);
	const dustRef = useRef<Boom[]>([]); // small impact puffs
	const seenDownRef = useRef<Set<number>>(new Set());
	const dailyRef = useRef<{ seed: number; diffIndex: number } | null>(null);
	const bestRef = useRef<number | null>(null);
	const triesRef = useRef(0);

	const { celebrating } = useCelebration(status === 'won');
	const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };
	const freeBestKey = (k: string) => `ludiven-angry-best-${k}`;

	/* ---------- Level setup ---------- */
	const lay = useCallback((key: keyof typeof DIFFS, seed: number) => {
		const world = makeLevel(seed, DIFFS[key]);
		worldRef.current = world;
		shotsUsedRef.current = 0;
		startRef.current = 0;
		finishedRef.current = false;
		rollingRef.current = false;
		aimRef.current = null;
		boomsRef.current = [];
		dustRef.current = [];
		seenDownRef.current = new Set();
		setShots(0);
		setFoxes(foxesLeft(world));
		setElapsed(0);
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
		if (run?.startedAt) startRef.current = run.startedAt;
		setDailyLoading(false);
	}, [gameId, lay]);

	/* ---------- End-of-shot / end-of-level resolution ---------- */
	const win = useCallback(() => {
		finishedRef.current = true;
		const timeSec = (Date.now() - startRef.current) / 1000;
		const score = encodeScore(shotsUsedRef.current, timeSec);
		setElapsed(timeSec);
		setStat('won');
		trackGame(gameId, 'game_won', { cocottes: shotsUsedRef.current });
		const prev = bestRef.current;
		const nb = prev == null ? score : Math.min(prev, score);
		bestRef.current = nb;
		setBest(nb);
		if (daily) {
			triesRef.current += 1;
			saveDailyRun(gameId, { startedAt: startRef.current, done: true, seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex, state: { best: nb, tries: triesRef.current } satisfies DailyState });
		} else {
			localStorage.setItem(freeBestKey(diffKey), String(nb));
		}
	}, [daily, diffKey, gameId]);

	const resolveShot = useCallback(() => {
		const world = worldRef.current!;
		if (foxesLeft(world) === 0) { win(); return; }
		// unlimited cocottes: drop the spent one and load a fresh cocotte
		if (world.cocotte) world.bodies = world.bodies.filter((b) => b !== world.cocotte);
		spawnCocotte(world);
		setStat('aiming');
	}, [win]);

	/* ---------- Pointer (slingshot) ---------- */
	const pointerToWorld = (e: PointerEvent): Vec => {
		const rect = canvasRef.current!.getBoundingClientRect();
		return { x: (e.clientX - rect.left) / scaleRef.current, y: (e.clientY - rect.top) / scaleRef.current };
	};

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const down = (e: PointerEvent) => {
			const world = worldRef.current;
			if (statusRef.current !== 'aiming' || !world?.cocotte || world.cocotte.launched) return;
			const p = pointerToWorld(e);
			if (Math.hypot(p.x - world.cocotte.x, p.y - world.cocotte.y) > GRAB_R) return;
			aimRef.current = { pull: { x: 0, y: 0 } };
			cv.setPointerCapture(e.pointerId);
			e.preventDefault();
		};
		const move = (e: PointerEvent) => {
			const world = worldRef.current;
			if (!aimRef.current || !world?.cocotte) return;
			const p = pointerToWorld(e);
			aimRef.current.pull = { x: p.x - world.cocotte.x, y: p.y - world.cocotte.y };
		};
		const up = () => {
			const aim = aimRef.current;
			aimRef.current = null;
			const world = worldRef.current;
			if (!aim || statusRef.current !== 'aiming' || !world?.cocotte) return;
			const v = aimToVelocity(aim.pull);
			if (!v) return;
			world.cocotte.vx = v.vx; world.cocotte.vy = v.vy; world.cocotte.launched = true;
			shotsUsedRef.current += 1;
			setShots(shotsUsedRef.current);
			if (startRef.current === 0) {
				startRef.current = Date.now();
				trackGame(gameId, 'game_started');
				if (daily) saveDailyRun(gameId, { startedAt: startRef.current, done: false, seed: dailyRef.current?.seed, diffIndex: dailyRef.current?.diffIndex, state: { best: bestRef.current ?? undefined, tries: triesRef.current } satisfies DailyState });
			}
			settleAccRef.current = 0;
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
			const world = worldRef.current;
			if (!world) return;
			const cssW = Math.min(wrap.clientWidth, 620);
			const cssH = (cssW * world.h) / world.w;
			scaleRef.current = cssW / world.w;
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

		const drawFox = (b: Body) => {
			const frac = b.maxHp ? Math.max(0, b.hp / b.maxHp) : 1;
			ctx.save();
			ctx.translate(b.x, b.y);
			ctx.rotate(b.spin); // rolls when launched / knocked
			// ears
			ctx.fillStyle = '#d8722c';
			ctx.beginPath(); ctx.moveTo(-b.r * 0.7, -b.r * 0.5); ctx.lineTo(-b.r * 0.2, -b.r * 1.3); ctx.lineTo(0, -b.r * 0.6); ctx.closePath(); ctx.fill();
			ctx.beginPath(); ctx.moveTo(b.r * 0.7, -b.r * 0.5); ctx.lineTo(b.r * 0.2, -b.r * 1.3); ctx.lineTo(0, -b.r * 0.6); ctx.closePath(); ctx.fill();
			// head (reddens as HP drops)
			ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2);
			ctx.fillStyle = `rgb(${230 - frac * 0 + (1 - frac) * 25}, ${Math.round(120 * frac + 40)}, ${Math.round(44 * frac)})`;
			ctx.fill();
			ctx.fillStyle = '#fff'; // snout
			ctx.beginPath(); ctx.arc(0, b.r * 0.35, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
			ctx.fillStyle = '#222'; // eyes + nose
			ctx.beginPath(); ctx.arc(-b.r * 0.35, -b.r * 0.1, b.r * 0.16, 0, Math.PI * 2); ctx.fill();
			ctx.beginPath(); ctx.arc(b.r * 0.35, -b.r * 0.1, b.r * 0.16, 0, Math.PI * 2); ctx.fill();
			ctx.beginPath(); ctx.arc(0, b.r * 0.2, b.r * 0.14, 0, Math.PI * 2); ctx.fill();
			ctx.restore();
			// HP bar
			if (frac < 1) {
				ctx.fillStyle = 'rgba(0,0,0,0.35)';
				ctx.fillRect(b.x - b.r, b.y - b.r * 1.7, b.r * 2, 1.6);
				ctx.fillStyle = frac > 0.5 ? '#2f9e6f' : frac > 0.25 ? '#f0a830' : '#d9534f';
				ctx.fillRect(b.x - b.r, b.y - b.r * 1.7, b.r * 2 * frac, 1.6);
			}
		};

		const drawCocotte = (b: Body) => {
			ctx.save();
			ctx.translate(b.x, b.y);
			ctx.rotate(b.spin); // rolls/tumbles when launched
			ctx.fillStyle = '#e34b4b'; // comb
			ctx.beginPath(); ctx.arc(-b.r * 0.2, -b.r, b.r * 0.3, 0, Math.PI * 2); ctx.arc(b.r * 0.2, -b.r, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
			ctx.fillStyle = '#fcfcfc'; // body
			ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
			ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.4; ctx.stroke();
			ctx.fillStyle = '#f0a830'; // beak
			ctx.beginPath(); ctx.moveTo(b.r * 0.7, 0); ctx.lineTo(b.r * 1.4, b.r * 0.18); ctx.lineTo(b.r * 0.7, b.r * 0.35); ctx.closePath(); ctx.fill();
			ctx.fillStyle = '#222'; // eye
			ctx.beginPath(); ctx.arc(b.r * 0.3, -b.r * 0.3, b.r * 0.15, 0, Math.PI * 2); ctx.fill();
			ctx.restore();
		};

		const draw = (now: number) => {
			const world = worldRef.current;
			if (!world) return;
			ctx.clearRect(0, 0, world.w, world.h);
			// sky
			const sky = ctx.createLinearGradient(0, 0, 0, world.groundY);
			sky.addColorStop(0, '#bfe3ff'); sky.addColorStop(1, '#e9f6ff');
			ctx.fillStyle = sky; ctx.fillRect(0, 0, world.w, world.groundY);
			// ground
			ctx.fillStyle = '#7cba54'; ctx.fillRect(0, world.groundY, world.w, world.h - world.groundY);
			ctx.fillStyle = '#5f9e3e'; ctx.fillRect(0, world.groundY, world.w, 2);
			// slingshot posts
			const s = world.slingshot;
			ctx.strokeStyle = '#7a4a25'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
			ctx.beginPath(); ctx.moveTo(s.x - 3, world.groundY); ctx.lineTo(s.x - 3, s.y); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(s.x + 3, world.groundY); ctx.lineTo(s.x + 3, s.y - 2); ctx.stroke();

			// bodies
			for (const b of world.bodies) {
				if (b.defeated) continue;
				if (b.tag === 'ground') continue;
				if (b.tag === 'crate') {
					ctx.fillStyle = '#b07b46'; ctx.fillRect(b.x - b.hw, b.y - b.hh, b.hw * 2, b.hh * 2);
					ctx.strokeStyle = '#7a4f29'; ctx.lineWidth = 0.5; ctx.strokeRect(b.x - b.hw, b.y - b.hh, b.hw * 2, b.hh * 2);
					ctx.beginPath(); ctx.moveTo(b.x - b.hw, b.y); ctx.lineTo(b.x + b.hw, b.y); ctx.stroke();
				} else if (b.tag === 'barrel') {
					ctx.fillStyle = '#c08a4e'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
					ctx.strokeStyle = '#7a4f29'; ctx.lineWidth = 0.6; ctx.stroke();
					ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(b.spin) * b.r, b.y + Math.sin(b.spin) * b.r); ctx.stroke(); // rolling stave
				} else if (b.tag === 'rock') {
					ctx.fillStyle = '#9aa1a8'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
					ctx.fillStyle = '#7e858c'; ctx.beginPath(); ctx.arc(b.x + Math.cos(b.spin) * b.r * 0.5, b.y + Math.sin(b.spin) * b.r * 0.5, b.r * 0.22, 0, Math.PI * 2); ctx.fill(); // rolling speck
				} else if (b.tag === 'fox') {
					drawFox(b);
				} else if (b.tag === 'cocotte') {
					// draw the slingshot band behind the cocotte while aiming
					if (aimRef.current && statusRef.current === 'aiming') {
						ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.4;
						ctx.beginPath(); ctx.moveTo(s.x - 3, s.y - 2); ctx.lineTo(b.x, b.y); ctx.lineTo(s.x + 3, s.y - 2); ctx.stroke();
					}
					drawCocotte(b);
				}
			}

			// aim guide (trajectory + power)
			const aim = aimRef.current;
			if (aim && world.cocotte && statusRef.current === 'aiming') {
				const v = aimToVelocity(aim.pull);
				if (v) {
					const pw = pullPower(aim.pull);
					const pts = predictTrajectory(world, { x: world.cocotte.x, y: world.cocotte.y }, v, 30);
					ctx.fillStyle = `hsl(${(1 - pw) * 120}, 85%, 50%)`;
					for (let i = 0; i < pts.length; i += 2) { ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 1.2, 0, Math.PI * 2); ctx.fill(); }
				}
			}

			// impact dust puffs
			dustRef.current = dustRef.current.filter((d) => now - d.t0 < 240);
			for (const d of dustRef.current) {
				const e = (now - d.t0) / 240;
				ctx.fillStyle = `rgba(120,110,100,${0.5 * (1 - e)})`;
				ctx.beginPath(); ctx.arc(d.x, d.y, 2 + e * 6, 0, Math.PI * 2); ctx.fill();
			}
			// explosions
			boomsRef.current = boomsRef.current.filter((bm) => now - bm.t0 < SINK_MS);
			for (const bm of boomsRef.current) {
				const e = (now - bm.t0) / SINK_MS;
				const R = 4 + e * 16;
				ctx.strokeStyle = `rgba(240,${Math.round(160 * (1 - e))},40,${1 - e})`;
				ctx.lineWidth = 2 * (1 - e);
				ctx.beginPath(); ctx.arc(bm.x, bm.y, R, 0, Math.PI * 2); ctx.stroke();
				for (let k = 0; k < 6; k++) {
					const a = (k / 6) * Math.PI * 2;
					ctx.fillStyle = `rgba(230,90,40,${1 - e})`;
					ctx.beginPath(); ctx.arc(bm.x + Math.cos(a) * R, bm.y + Math.sin(a) * R, 1.4 * (1 - e), 0, Math.PI * 2); ctx.fill();
				}
			}
		};

		const frame = (now: number) => {
			if (!lastRef.current) lastRef.current = now;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			const world = worldRef.current;
			while (accRef.current >= STEP) {
				accRef.current -= STEP;
				if (world && rollingRef.current) {
					const ev = step(world, STEP / 1000);
					if (ev.foxesDown > 0) {
						for (const b of world.bodies) {
							if (b.tag === 'fox' && b.defeated && !seenDownRef.current.has(b.id)) {
								seenDownRef.current.add(b.id);
								boomsRef.current.push({ x: b.x, y: b.y, t0: now });
							}
						}
						setFoxes(foxesLeft(world));
					}
					for (const hpt of ev.hits) if (dustRef.current.length < 24) dustRef.current.push({ x: hpt.x, y: hpt.y, t0: now });
					settleAccRef.current += STEP;
					const c = world.cocotte;
					const offscreen = !!c && (c.x > world.w + 15 || c.x < -15 || c.y > world.h + 15);
					if (foxesLeft(world) === 0 && !finishedRef.current) { rollingRef.current = false; resolveShot(); }
					else if (ev.settled || offscreen || settleAccRef.current > SETTLE_TIMEOUT) { rollingRef.current = false; resolveShot(); }
				}
			}
			if (startRef.current && !finishedRef.current) setElapsed((Date.now() - startRef.current) / 1000);
			draw(now);
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastRef.current = 0; };
	}, [resolveShot]);

	useEffect(() => { newFree('facile'); }, [newFree]);

	const bestLabel = best == null ? '—' : (() => { const d = decodeScore(best); return `${d.cocottes} cocottes · ${fmtTime(d.timeSec)}`; })();

	return (
		<div className="co-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => daily && newFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="co-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label}`}
				</div>
			) : (
				<div className="co-bar">
					<div className="co-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`co-pill ${diffKey === k ? 'active' : ''}`} onClick={() => newFree(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
					<button className="co-act" onClick={() => newFree(diffKey)}>↻ Nouveau niveau</button>
				</div>
			)}

			<div className="co-stats">
				<span className="co-stat">🥚 {shots} lancées</span>
				<span className="co-stat">🦊 {foxes} renards</span>
				<span className="co-stat">⏱ {fmtTime(elapsed)}</span>
			</div>

			<div className="co-playwrap" ref={wrapRef}>
				{celebrating && <Celebration />}
				<canvas ref={canvasRef} className="co-canvas" />
				{status === 'won' && (
					<div className="co-overlay">
						<div className="co-overlay-card">
							🎉 Tous les renards à terre&nbsp;! <strong>{shotsUsedRef.current} cocottes</strong> · {fmtTime(elapsed)}
							<button className="co-replay" onClick={() => (daily ? lay(diffKey, dailyRef.current!.seed) : newFree(diffKey))}>
								{daily ? 'Rejouer le défi' : 'Nouveau niveau'}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="co-help">
				Glisse depuis la cocotte puis relâche : tu tires dans le sens opposé, plus tu tires loin plus
				c'est puissant. Cocottes illimitées — fais tomber tous les renards en le moins de lancers possible. {daily ? 'Le chrono départage les ex æquo.' : `Record : ${bestLabel}.`}
			</p>

			{daily && <Leaderboard
				key={`lb-${best ?? 0}`}
				game={`${gameId}-t`}
				metric="time"
				submitValue={status === 'won' && best != null ? best : undefined}
				format={(v) => { const d = decodeScore(v); return `${d.cocottes} cocottes · ${fmtTime(d.timeSec)}`; }}
			/>}
			{!daily && <LeaderboardCorner game={`${gameId}-t`} metric="time" format={(v) => { const d = decodeScore(v); return `${d.cocottes} cocottes · ${fmtTime(d.timeSec)}`; }} />}
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.co-root { --co-accent: var(--accent-regular); width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.co-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.co-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.co-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.co-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition); }
.co-pill.active { background: var(--co-accent); color: var(--accent-text-over); border-color: var(--co-accent); }
.co-act { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.co-act:hover { background: var(--gray-800); border-color: var(--co-accent); color: var(--co-accent); }
.co-stats { display: flex; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.75rem; flex-wrap: wrap; justify-content: center; }
.co-stat { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; }
.co-playwrap { width: 100%; position: relative; display: flex; justify-content: center; }
.co-canvas { display: block; border-radius: 10px; box-shadow: var(--shadow-md); touch-action: none; cursor: crosshair; background: #bfe3ff; }
.co-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.co-overlay-card { background: var(--gray-999); border: 2px solid var(--co-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.co-overlay-card strong { color: var(--co-accent); }
.co-replay { border: none; background: var(--co-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }
.co-help { max-width: 480px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
