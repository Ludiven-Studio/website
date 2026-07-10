import { useState, useEffect, useRef, useCallback } from 'react';
import {
	makeLevel, step, foxesLeft, spawnCocotte, aimToVelocity, pullPower, predictTrajectory,
	encodeScore, DIFFS, type World, type Body, type Vec,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
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
const SETTLE_GRACE = 900; // ms of continuous calm before resolving a shot (let everything finish)
const SETTLE_TIMEOUT = 7000; // ms: hard cap so a shot always resolves
const SINK_MS = 420; // explosion duration
const DEBRIS_MS = 460; // block-shatter debris lifetime
const MAT_FILL: Record<string, string> = { cardboard: '#d8b884', wood: '#b07b46', brick: '#b0573f', tnt: '#d23b32' };

const fmtTime = (s: number) =>
	`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface DailyState { best?: number; tries: number; }
interface Boom { x: number; y: number; t0: number; big?: boolean; }
interface Debris { x: number; y: number; vx: number; vy: number; t0: number; color: string; }

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
	const skyImgRef = useRef<HTMLImageElement | null>(null); // AI sky (else gradient)
	const woodImgRef = useRef<HTMLImageElement | null>(null); // wood crate texture
	const brickImgRef = useRef<HTMLImageElement | null>(null); // brick crate texture
	const debrisRef = useRef<Debris[]>([]); // block-shatter shards
	const settledForRef = useRef(0); // ms the world has stayed calm
	const curSeedRef = useRef(0); // seed of the level currently in play (for « Recommencer »)
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
		curSeedRef.current = seed;
		shotsUsedRef.current = 0;
		startRef.current = 0;
		finishedRef.current = false;
		rollingRef.current = false;
		aimRef.current = null;
		boomsRef.current = [];
		dustRef.current = [];
		debrisRef.current = [];
		settledForRef.current = 0;
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
		const stored = lb ? Number(lb) : null;
		bestRef.current = stored; // seed the ref so win() keeps the real record, not just this session's
		setBest(stored);
		lay(key, (Math.random() * 2 ** 31) >>> 0);
	}, [lay]);

	const restart = useCallback(() => lay(diffKey, curSeedRef.current), [lay, diffKey]); // same level

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
		// Ignore an implausible stored best (< 100000 = fewer than 1 cocotte): a corrupt value must not block real improvements.
		const validBest = typeof st.best === 'number' && st.best >= 100000 ? st.best : null;
		bestRef.current = validBest;
		setBest(validBest);
		lay(key, seed);
		if (run?.startedAt && !run.done) startRef.current = run.startedAt; // resume the timer only for an unfinished run
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

	// Load the AI sky + crate textures once (the RAF loop picks them up next frame).
	useEffect(() => {
		const load = (src: string, ref: React.RefObject<HTMLImageElement | null>) => {
			const img = new Image();
			img.onload = () => { ref.current = img; };
			img.src = src;
		};
		load('/assets/jeux/angry/sky.jpg', skyImgRef);
		load('/assets/jeux/angry/wood.jpg', woodImgRef);
		load('/assets/jeux/angry/brick.jpg', brickImgRef);
	}, []);

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
			settledForRef.current = 0;
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
			// Normal: width-capped. Fullscreen: fit width AND height (keep aspect → letterbox, no distortion).
			const fs = document.fullscreenElement != null;
			let cssW = Math.min(wrap.clientWidth, 620);
			if (fs) cssW = Math.min(wrap.clientWidth, (wrap.clientHeight * world.w) / world.h);
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
		const onFs = () => requestAnimationFrame(resize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			ro.disconnect();
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
		};
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
			if (skyImgRef.current) ctx.drawImage(skyImgRef.current, 0, 0, world.w, world.groundY);
			else { ctx.fillStyle = sky; ctx.fillRect(0, 0, world.w, world.groundY); }
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
					const x0 = b.x - b.hw, y0 = b.y - b.hh, ww = b.hw * 2, hgt = b.hh * 2, mat = b.mat ?? 'wood';
					const FILL: Record<string, string> = { cardboard: '#d8b884', wood: '#b07b46', brick: '#b0573f', tnt: '#d23b32' };
					const EDGE: Record<string, string> = { cardboard: '#b8965f', wood: '#7a4f29', brick: '#7d3c2b', tnt: '#7a1f1a' };
					const tex = mat === 'wood' ? woodImgRef.current : mat === 'brick' ? brickImgRef.current : null;
					if (tex) ctx.drawImage(tex, x0, y0, ww, hgt);
					else { ctx.fillStyle = FILL[mat]; ctx.fillRect(x0, y0, ww, hgt); }
					ctx.strokeStyle = EDGE[mat]; ctx.lineWidth = 0.5; ctx.strokeRect(x0, y0, ww, hgt);
					if (mat === 'wood') { if (!tex) { ctx.beginPath(); ctx.moveTo(x0, b.y); ctx.lineTo(x0 + ww, b.y); ctx.stroke(); } }
					else if (mat === 'cardboard') { ctx.beginPath(); ctx.moveTo(b.x, y0); ctx.lineTo(b.x, y0 + hgt); ctx.stroke(); }
					else if (mat === 'brick') { if (!tex) { ctx.beginPath(); ctx.moveTo(x0, b.y); ctx.lineTo(x0 + ww, b.y); ctx.moveTo(b.x, y0); ctx.lineTo(b.x, b.y); ctx.moveTo(b.x - b.hw / 2, b.y); ctx.lineTo(b.x - b.hw / 2, y0 + hgt); ctx.moveTo(b.x + b.hw / 2, b.y); ctx.lineTo(b.x + b.hw / 2, y0 + hgt); ctx.stroke(); } }
					else { ctx.fillStyle = '#f0c52e'; ctx.fillRect(x0, b.y - hgt * 0.16, ww, hgt * 0.32); ctx.fillStyle = '#7a1f1a'; ctx.font = `${Math.max(3, b.hh * 0.85)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', b.x, b.y); }
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
			debrisRef.current = debrisRef.current.filter((d) => now - d.t0 < DEBRIS_MS);
				for (const d of debrisRef.current) {
					const t = (now - d.t0) / 1000, e = (now - d.t0) / DEBRIS_MS;
					const px = d.x + d.vx * t, py = d.y + d.vy * t + 0.5 * world.gravity * t * t;
					ctx.globalAlpha = 1 - e;
					ctx.fillStyle = d.color;
					ctx.fillRect(px - 1.1, py - 1.1, 2.4, 2.4);
				}
				ctx.globalAlpha = 1;
				boomsRef.current = boomsRef.current.filter((bm) => now - bm.t0 < SINK_MS);
			for (const bm of boomsRef.current) {
				const e = (now - bm.t0) / SINK_MS;
				const R = (bm.big ? 8 : 4) + e * (bm.big ? 40 : 16);
				ctx.strokeStyle = `rgba(240,${Math.round(160 * (1 - e))},40,${1 - e})`;
				ctx.lineWidth = (bm.big ? 3 : 2) * (1 - e);
				ctx.beginPath(); ctx.arc(bm.x, bm.y, R, 0, Math.PI * 2); ctx.stroke();
				if (bm.big) { ctx.fillStyle = `rgba(255,210,60,${0.5 * (1 - e)})`; ctx.beginPath(); ctx.arc(bm.x, bm.y, R * 0.6, 0, Math.PI * 2); ctx.fill(); }
				const parts = bm.big ? 12 : 6;
				for (let k = 0; k < parts; k++) {
					const a = (k / parts) * Math.PI * 2;
					ctx.fillStyle = `rgba(230,90,40,${1 - e})`;
					ctx.beginPath(); ctx.arc(bm.x + Math.cos(a) * R, bm.y + Math.sin(a) * R, (bm.big ? 2.2 : 1.4) * (1 - e), 0, Math.PI * 2); ctx.fill();
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
					for (const bl of ev.blasts) boomsRef.current.push({ x: bl.x, y: bl.y, t0: now, big: true });
					for (const br of ev.breaks) {
						const col = MAT_FILL[br.mat] ?? '#b07b46';
						for (let k = 0; k < 5; k++) {
							const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 50;
							if (debrisRef.current.length < 80) debrisRef.current.push({ x: br.x, y: br.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, t0: now, color: col });
						}
					}
					// Resolve only once the whole world has stayed calm for a moment (let everything finish),
					// with a hard cap so it never hangs. resolveShot() then decides win vs reload.
					settleAccRef.current += STEP;
					settledForRef.current = ev.settled ? settledForRef.current + STEP : 0;
					if (settledForRef.current >= SETTLE_GRACE || settleAccRef.current > SETTLE_TIMEOUT) {
						rollingRef.current = false;
						resolveShot();
					}
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

	const bestLabel = best == null ? '—' : formatScore(DAILY_LB.angry.fmt, best);

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
				<span className="co-stat">🐔 {shots} lancées</span>
				<span className="co-stat">🦊 {foxes} renards</span>
				<span className="co-stat">⏱ {fmtTime(elapsed)}</span>
				<button className="co-act" onClick={restart}>↺ Recommencer</button>
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
				format={(v) => formatScore(DAILY_LB.angry.fmt, v)}
			/>}
			{!daily && <LeaderboardCorner game={`${gameId}-t`} metric="time" format={(v) => formatScore(DAILY_LB.angry.fmt, v)} />}
		</div>
	);
}

/* ---------- Styles ---------- */

const CSS = `
.co-root { --co-accent: var(--accent-regular); width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
/* Site global fullscreen → the level fills the screen (kept aspect, letterboxed). */
.game-page:fullscreen .co-root { max-width: none; width: 100%; height: 100%; }
.game-page:-webkit-full-screen .co-root { max-width: none; width: 100%; height: 100%; }
.game-page:fullscreen .co-playwrap { flex: 1; min-height: 0; }
.game-page:-webkit-full-screen .co-playwrap { flex: 1; min-height: 0; }
.game-page:fullscreen .co-help { display: none; }
.game-page:-webkit-full-screen .co-help { display: none; }
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
