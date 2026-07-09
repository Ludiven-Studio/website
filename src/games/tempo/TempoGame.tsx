import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import { LANES, SPEEDS, buildEndlessChart, judgeTiming, comboMult, rankOf, type Chart, type Grade } from './engine';

/* =====================================================
   TEMPO — piano-tiles rhythm game (prototype).
   Public-domain tunes (or an endless generated melody) fall as tiles; tap the
   lane (pointer or D/F/J/K) as a tile hits the line — each hit plays its note.
   Long notes are HOLD tiles: keep pressing for a growing bonus. Endless mode
   ends on a miss (score chase). Audio-clock synced.
   ===================================================== */

type Status = 'ready' | 'running' | 'done';
type TileState = 'pending' | 'holding' | 'done' | 'broken' | Grade;
const KEYS = ['s', 'd', 'f', 'j', 'k', 'l']; // 6 columns, low pitch (left) → high (right)
const LANE_HUE = [205, 245, 285, 325, 20, 50];
const PROG = [0, 7, 9, 5]; // I–V–vi–IV progression (semitones from the key) — one chord per bar
const LEAD = 1.9;
const HIT_FRAC = 0.8;
const HOLD_RATE = 45; // bonus points per second held (× combo)
const ENERGY_MAX = 100;
const MISS_COST = 20; // energy lost on a miss (endless)
const HOLD_BREAK_COST = 10;
const bestKey = (s: number): string => `ludiven-tempo-best-${s}`;
const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface DailyState {
	best: number;
}
interface Particle {
	x: number;
	y: number;
	vy: number;
	life: number;
	maxLife: number;
	color: string;
	text?: string;
	size: number;
}

export default function TempoGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [speedIdx, setSpeedIdx] = useState(1);
	const [metro, setMetro] = useState(true); // backing music (drums + bass) on by default
	const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1 });
	const [result, setResult] = useState<{ score: number; rank: string; tiles: number } | null>(null);
	const [best, setBest] = useState<number | null>(null);
	const [submitScore, setSubmitScore] = useState<number | undefined>(undefined);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 460, h: 640 });
	const chartRef = useRef<Chart | null>(null);
	const stateArrRef = useRef<TileState[]>([]);
	const scoreRef = useRef(0);
	const comboRef = useRef(0);
	const maxComboRef = useRef(0);
	const accSumRef = useRef(0);
	const accCountRef = useRef(0);
	const laneFlashRef = useRef<number[]>(Array.from({ length: LANES }, () => -9));
	const laneKeyRef = useRef<boolean[]>(Array.from({ length: LANES }, () => false));
	const pointerLaneRef = useRef<Map<number, number>>(new Map());
	const partsRef = useRef<Particle[]>([]);
	const energyRef = useRef(ENERGY_MAX);
	const animRef = useRef(0);
	const rafRef = useRef(0);
	const runningRef = useRef(false);
	const statusRef = useRef<Status>('ready');

	const ctxRef = useRef<AudioContext | null>(null);
	const masterRef = useRef<GainNode | null>(null);
	const runGainRef = useRef<GainNode | null>(null); // per-run bus so restarts don't stack scheduled ticks
	const audioStartRef = useRef(0);
	const metroRef = useRef(true);
	const backingIdxRef = useRef(0); // next beat to schedule (lookahead groove)

	const dailyRef = useRef(false);
	const seedRef = useRef(0);
	const speedRef = useRef(1);
	const diffRef = useRef(1); // difficulty tier index (SPEEDS)
	const dailyBestRef = useRef<number | null>(null);

	const setStat = (s: Status): void => {
		statusRef.current = s;
		setStatus(s);
	};

	/* ---------- Audio ---------- */
	const ensureAudio = (): AudioContext | null => {
		if (!ctxRef.current) {
			const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctor) return null;
			const ctx = new Ctor();
			const master = ctx.createGain();
			master.gain.value = 0.85;
			master.connect(ctx.destination);
			ctxRef.current = ctx;
			masterRef.current = master;
		}
		if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
		return ctxRef.current;
	};
	const playPiano = (midi: number, sustain = 0.5): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		const when = ctx.currentTime;
		const freq = midiToFreq(midi);
		const g = ctx.createGain();
		g.connect(masterRef.current!);
		const peak = 0.2;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(peak, when + 0.005);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.4), when + Math.min(0.2, sustain));
		g.gain.exponentialRampToValueAtTime(0.0001, when + sustain);
		for (const [mult, amp] of [[1, 1], [2, 0.3], [3, 0.12], [4, 0.06]]) {
			const o = ctx.createOscillator();
			o.type = 'triangle';
			o.frequency.setValueAtTime(freq * mult, when);
			const hg = ctx.createGain();
			hg.gain.value = amp;
			o.connect(hg);
			hg.connect(g);
			o.start(when);
			o.stop(when + sustain + 0.05);
		}
	};
	// Backing accompaniment: a kick drum + a bass note per beat gives the tempo.
	const kick = (when: number, accent: boolean): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(runGainRef.current ?? masterRef.current!);
		g.gain.setValueAtTime(accent ? 0.24 : 0.15, when);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
		const o = ctx.createOscillator();
		o.type = 'sine';
		o.frequency.setValueAtTime(130, when);
		o.frequency.exponentialRampToValueAtTime(46, when + 0.12);
		o.connect(g);
		o.start(when);
		o.stop(when + 0.16);
	};
	const bass = (when: number, midi: number, accent: boolean): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(runGainRef.current ?? masterRef.current!);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(accent ? 0.13 : 0.08, when + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
		const o = ctx.createOscillator();
		o.type = 'triangle';
		o.frequency.value = midiToFreq(midi);
		o.connect(g);
		o.start(when);
		o.stop(when + 0.34);
	};
	// Warm sustained cello/bass bed (root + fifth + octave, low-pass filtered) for depth.
	const pad = (when: number, dur: number, root: number): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 650;
		lp.Q.value = 0.6;
		const g = ctx.createGain();
		g.connect(lp);
		lp.connect(runGainRef.current ?? masterRef.current!);
		const attack = Math.min(0.4, dur * 0.3);
		const rel = Math.min(0.5, dur * 0.35);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(0.06, when + attack);
		g.gain.setValueAtTime(0.06, when + Math.max(attack, dur - rel));
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		for (const [semi, amp] of [[0, 1], [7, 0.5], [12, 0.35]]) {
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = midiToFreq(root + semi);
			o.detune.value = semi === 0 ? -4 : 3; // slight chorus
			const og = ctx.createGain();
			og.gain.value = amp;
			o.connect(og);
			og.connect(g);
			o.start(when);
			o.stop(when + dur + 0.06);
		}
	};

	/* ---------- Geometry ---------- */
	const laneW = (): number => dimRef.current.w / LANES;
	const hitY = (): number => dimRef.current.h * HIT_FRAC;
	const pxPerSec = (): number => hitY() / LEAD;
	const songTime = (): number => {
		const ctx = ctxRef.current;
		return ctx ? ctx.currentTime - audioStartRef.current : 0;
	};
	const heldLane = (lane: number): boolean => laneKeyRef.current[lane] || Array.from(pointerLaneRef.current.values()).includes(lane);

	/* ---------- Run ---------- */
	const prepare = useCallback((speed: number): void => {
		chartRef.current = buildEndlessChart(seedRef.current, speed);
		stateArrRef.current = chartRef.current.tiles.map(() => 'pending');
		scoreRef.current = 0;
		comboRef.current = 0;
		maxComboRef.current = 0;
		accSumRef.current = 0;
		accCountRef.current = 0;
		energyRef.current = ENERGY_MAX;
		partsRef.current = [];
		laneFlashRef.current = Array.from({ length: LANES }, () => -9);
		laneKeyRef.current = Array.from({ length: LANES }, () => false);
		pointerLaneRef.current.clear();
		setHud({ score: 0, combo: 0, mult: 1 });
		setResult(null);
	}, []);

	const startRun = (): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		if (!dailyRef.current) seedRef.current = (Math.random() * 2 ** 32) >>> 0; // fresh tune each free run
		prepare(speedRef.current);
		// Fresh per-run audio bus: silences any groove still scheduled from a previous run.
		try {
			runGainRef.current?.disconnect();
		} catch {
			/* ignore */
		}
		const rg = ctx.createGain();
		rg.connect(masterRef.current!);
		runGainRef.current = rg;
		audioStartRef.current = ctx.currentTime + LEAD;
		backingIdxRef.current = 0; // groove is scheduled with lookahead in step()
		runningRef.current = true;
		setStat('running');
		setSubmitScore(undefined);
		trackGame(gameId, 'game_started', { mode: dailyRef.current ? 'daily' : 'free' });
	};

	const finishRun = useCallback((): void => {
		runningRef.current = false;
		try {
			runGainRef.current?.disconnect(); // stop any remaining scheduled groove
		} catch {
			/* ignore */
		}
		const total = Math.max(1, accCountRef.current);
		const rank = rankOf(accSumRef.current / total);
		const score = Math.round(scoreRef.current);
		setResult({ score, rank, tiles: accCountRef.current });
		setStat('done');
		if (dailyRef.current) {
			dailyBestRef.current = dailyBestRef.current == null ? score : Math.max(dailyBestRef.current, score);
			setBest(dailyBestRef.current);
			setSubmitScore(dailyBestRef.current);
			saveDailyRun(gameId, { startedAt: Date.now(), done: true, seed: seedRef.current, diffIndex: diffRef.current, state: { best: dailyBestRef.current } satisfies DailyState });
		} else {
			setBest((prev) => {
				const nb = prev == null ? score : Math.max(prev, score);
				try {
					localStorage.setItem(bestKey(diffRef.current), String(nb));
				} catch {
					/* ignore */
				}
				return nb;
			});
		}
		trackGame(gameId, 'game_over', { score });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId]);

	/* ---------- Input ---------- */
	const emitText = (text: string, lane: number, color: string, spark = false): void => {
		const x = (lane + 0.5) * laneW();
		partsRef.current.push({ x, y: hitY() - 18, vy: -50, life: 0.7, maxLife: 0.7, color, text, size: 15 });
		if (spark) for (let i = 0; i < 8; i++) partsRef.current.push({ x, y: hitY(), vy: -60 - Math.random() * 60, life: 0.45, maxLife: 0.45, color, size: 3 });
	};
	const gradeColor = (g: Grade): string => (g === 'Parfait' ? '#3ddc84' : g === 'Bien' ? '#7fd0ff' : g === 'Ok' ? '#ffd166' : '#ff6a6a');

	const pressLane = (lane: number): void => {
		if (!runningRef.current) return;
		const chart = chartRef.current;
		if (!chart) return;
		laneFlashRef.current[lane] = animRef.current;
		const now = songTime();
		const arr = stateArrRef.current;
		let bi = -1;
		let bo = Infinity;
		chart.tiles.forEach((t, i) => {
			if (t.lane !== lane || arr[i] !== 'pending') return;
			const off = Math.abs(now - t.time);
			if (off < bo) {
				bo = off;
				bi = i;
			}
		});
		if (bi < 0) return;
		const jd = judgeTiming(bo);
		if (!jd) return;
		const t = chart.tiles[bi];
		playPiano(t.midi, t.hold ? t.dur : 0.5);
		comboRef.current += 1;
		maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
		scoreRef.current += jd.points * comboMult(comboRef.current);
		accSumRef.current += jd.points;
		accCountRef.current += 1;
		energyRef.current = Math.min(ENERGY_MAX, energyRef.current + (jd.grade === 'Parfait' ? 7 : jd.grade === 'Bien' ? 4 : 2));
		emitText(jd.grade, lane, gradeColor(jd.grade), jd.points >= 60);
		arr[bi] = t.hold ? 'holding' : jd.grade;
		setHud({ score: Math.round(scoreRef.current), combo: comboRef.current, mult: comboMult(comboRef.current) });
	};
	const pressLaneRef = useRef(pressLane);
	pressLaneRef.current = pressLane;

	const onDown = (e: React.PointerEvent): void => {
		if (!runningRef.current) return;
		const cv = canvasRef.current;
		if (!cv) return;
		const rect = cv.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (dimRef.current.w / rect.width);
		const lane = clamp(Math.floor(x / laneW()), 0, LANES - 1);
		const wasHeld = heldLane(lane);
		pointerLaneRef.current.set(e.pointerId, lane);
		cv.setPointerCapture(e.pointerId);
		if (!wasHeld) pressLane(lane);
	};
	const onPointerEnd = (e: React.PointerEvent): void => {
		pointerLaneRef.current.delete(e.pointerId);
	};

	/* ---------- Modes ---------- */
	const armFree = useCallback(
		(di: number): void => {
			dailyRef.current = false;
			setDaily(false);
			setDailyLoading(false);
			diffRef.current = di;
			speedRef.current = SPEEDS[di].speed;
			setSpeedIdx(di);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			prepare(speedRef.current);
			setStat('ready');
			dailyBestRef.current = null;
			let b: number | null = null;
			try {
				const v = localStorage.getItem(bestKey(di));
				if (v != null) b = Number(v);
			} catch {
				/* ignore */
			}
			setBest(b);
		},
		[prepare],
	);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true);
		runningRef.current = false;
		const apply = (seed: number, di: number, st: DailyState | null): void => {
			seedRef.current = seed >>> 0;
			diffRef.current = clamp(di, 0, 2);
			speedRef.current = SPEEDS[diffRef.current].speed;
			setSpeedIdx(diffRef.current);
			prepare(speedRef.current);
			dailyBestRef.current = st?.best ?? null;
			setBest(dailyBestRef.current);
			setStat('ready');
			setDailyLoading(false);
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			apply(run.seed, run.diffIndex ?? dailyDifficultyIndex(), (run.state as DailyState) ?? null);
			return;
		}
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		apply(seed, diffIndex, null);
	}, [gameId, prepare]);

	/* ---------- Loop + keyboard ---------- */
	useEffect(() => {
		armFree(1);
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const w = clamp(wrap.clientWidth, 260, 460);
			const h = Math.round(w * 1.4);
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h };
			cv.style.height = `${h}px`;
			cv.style.width = `${w}px`;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		const onKeyDown = (e: KeyboardEvent): void => {
			const lane = KEYS.indexOf(e.key.toLowerCase());
			if (lane < 0 || !runningRef.current) return;
			e.preventDefault();
			if (!laneKeyRef.current[lane]) {
				laneKeyRef.current[lane] = true;
				pressLaneRef.current(lane);
			}
		};
		const onKeyUp = (e: KeyboardEvent): void => {
			const lane = KEYS.indexOf(e.key.toLowerCase());
			if (lane >= 0) laneKeyRef.current[lane] = false;
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		let last = performance.now();
		const frame = (now: number): void => {
			const dt = Math.min(now - last, 100) / 1000;
			last = now;
			animRef.current += dt;
			step(dt);
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => {
			ro.disconnect();
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			cancelAnimationFrame(rafRef.current);
			void ctxRef.current?.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	useEffect(() => {
		metroRef.current = metro;
	}, [metro]);

	const step = (dt: number): void => {
		for (const p of partsRef.current) {
			p.y += p.vy * dt;
			p.vy += 60 * dt;
			p.life -= dt;
		}
		partsRef.current = partsRef.current.filter((p) => p.life > 0);
		if (!runningRef.current) return;
		const chart = chartRef.current;
		if (!chart) return;
		const now = songTime();
		// Backing groove: schedule ~1s ahead (kick every beat, bass root/fifth, accent per bar).
		if (metroRef.current) {
			const bt = chart.beatTimes;
			while (backingIdxRef.current < bt.length && bt[backingIdxRef.current] < now + 1) {
				const i = backingIdxRef.current;
				const when = audioStartRef.current + bt[i];
				const accent = i % 4 === 0;
				const chordRoot = chart.key + PROG[Math.floor(i / 4) % PROG.length]; // one chord per bar
				kick(when, accent);
				bass(when, chordRoot + (i % 2 === 0 ? 0 : 7), accent);
				if (accent) {
					// Sustained cello bed under each bar (deep, an octave below the groove bass).
					const barDur = bt[Math.min(i + 4, bt.length - 1)] - bt[i] || 2;
					pad(when, Math.max(0.6, barDur), chordRoot - 12);
				}
				backingIdxRef.current++;
			}
		}
		const arr = stateArrRef.current;
		let dirty = false;
		let failed = false;
		for (let i = 0; i < chart.tiles.length; i++) {
			const t = chart.tiles[i];
			const s = arr[i];
			if (s === 'pending') {
				if (now - t.time > 0.28) {
					arr[i] = 'Raté';
					comboRef.current = 0;
					accCountRef.current += 1;
					emitText('Raté', t.lane, '#ff6a6a');
					dirty = true;
					energyRef.current -= MISS_COST;
					if (energyRef.current <= 0) failed = true;
				}
			} else if (s === 'holding') {
				const end = t.time + t.dur;
				if (heldLane(t.lane) && now < end) {
					scoreRef.current += HOLD_RATE * dt * comboMult(comboRef.current);
					dirty = true;
				} else if (!heldLane(t.lane) && now < end - 0.12) {
					arr[i] = 'broken';
					comboRef.current = 0;
					emitText('Lâché', t.lane, '#ff9a5a');
					energyRef.current -= HOLD_BREAK_COST;
					if (energyRef.current <= 0) failed = true;
					dirty = true;
				} else if (now >= end - 0.06) {
					arr[i] = 'done';
					comboRef.current += 1;
					scoreRef.current += 40 * comboMult(comboRef.current);
					energyRef.current = Math.min(ENERGY_MAX, energyRef.current + 6);
					emitText('Tenu !', t.lane, '#3ddc84', true);
					dirty = true;
				}
			}
		}
		if (dirty) setHud({ score: Math.round(scoreRef.current), combo: comboRef.current, mult: comboMult(comboRef.current) });
		if (failed || now > chart.totalTime + 0.6) finishRun();
	};

	/* ---------- Draw ---------- */
	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const { w, h } = dimRef.current;
		const lw = laneW();
		const hy = hitY();
		const pps = pxPerSec();
		const chart = chartRef.current;
		const now = runningRef.current ? songTime() : -LEAD;
		const anim = animRef.current;

		ctx.fillStyle = '#0c1018';
		ctx.fillRect(0, 0, w, h);
		for (let l = 0; l < LANES; l++) {
			ctx.fillStyle = l % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
			ctx.fillRect(l * lw, 0, lw, h);
			ctx.strokeStyle = 'rgba(255,255,255,0.06)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(l * lw, 0);
			ctx.lineTo(l * lw, h);
			ctx.stroke();
		}
		ctx.strokeStyle = 'rgba(150,190,255,0.55)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(0, hy);
		ctx.lineTo(w, hy);
		ctx.stroke();

		// Energy bar: drops on a miss, refills on hits, game over at 0.
		{
			const e = clamp(energyRef.current / ENERGY_MAX, 0, 1);
			const bx = 10;
			const by = 8;
			const bw = w - 20;
			const bh = 8;
			ctx.fillStyle = 'rgba(255,255,255,0.12)';
			ctx.beginPath();
			ctx.roundRect(bx, by, bw, bh, 4);
			ctx.fill();
			ctx.fillStyle = e > 0.5 ? '#3ddc84' : e > 0.25 ? '#ffd166' : '#ff6a6a';
			ctx.beginPath();
			ctx.roundRect(bx, by, Math.max(2, bw * e), bh, 4);
			ctx.fill();
		}

		if (chart) {
			const arr = stateArrRef.current;
			for (let i = 0; i < chart.tiles.length; i++) {
				const t = chart.tiles[i];
				const s = arr[i];
				const yBottom = hy + (now - t.time) * pps;
				const hh = Math.max(lw * 0.55, t.dur * pps);
				const yTop = yBottom - hh;
				const x = t.lane * lw + 4;
				const wdt = lw - 8;
				const hue = LANE_HUE[t.lane];
				if (s === 'pending') {
					if (yBottom < -4 || yTop > h) continue;
					const g = ctx.createLinearGradient(0, yTop, 0, yBottom);
					g.addColorStop(0, `hsl(${hue}, 80%, 62%)`);
					g.addColorStop(1, `hsl(${hue}, 75%, 48%)`);
					ctx.fillStyle = g;
					ctx.shadowColor = `hsl(${hue}, 85%, 60%)`;
					ctx.shadowBlur = 10;
					ctx.beginPath();
					ctx.roundRect(x, yTop, wdt, hh, 8);
					ctx.fill();
					ctx.shadowBlur = 0;
					if (t.hold) {
						ctx.strokeStyle = 'rgba(255,255,255,0.7)';
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.roundRect(x + 3, yTop + 3, wdt - 6, hh - 6, 6);
						ctx.stroke();
					}
				} else if (s === 'holding') {
					// remaining portion above the line, shrinking as it's held
					const top = Math.min(hy, yTop);
					if (hy - top > 1) {
						ctx.fillStyle = `hsla(140, 80%, 60%, 0.9)`;
						ctx.shadowColor = 'hsl(140,85%,60%)';
						ctx.shadowBlur = 14;
						ctx.beginPath();
						ctx.roundRect(x, top, wdt, hy - top, 8);
						ctx.fill();
						ctx.shadowBlur = 0;
					}
				}
			}
		}

		for (let l = 0; l < LANES; l++) {
			const flash = clamp(1 - (anim - laneFlashRef.current[l]) / 0.18, 0, 1);
			const held = heldLane(l) ? 0.35 : 0;
			ctx.fillStyle = `rgba(${120 + 120 * flash}, ${150 + 90 * flash}, 255, ${0.12 + 0.5 * flash + held})`;
			ctx.fillRect(l * lw + 3, hy + 3, lw - 6, h - hy - 6);
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = 'bold 14px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(KEYS[l].toUpperCase(), (l + 0.5) * lw, (hy + h) / 2);
		}

		for (const p of partsRef.current) {
			const a = clamp(p.life / p.maxLife, 0, 1);
			ctx.globalAlpha = a;
			ctx.fillStyle = p.color;
			if (p.text) {
				ctx.font = `bold ${p.size}px system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(p.text, p.x, p.y);
			} else {
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
	};

	return (
		<div className="tp-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffRef.current)} onDaily={startDaily} />

			{daily ? (
				<div className="tp-dailytag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${SPEEDS[speedIdx].label}`}
				</div>
			) : (
				<div className="tp-pills">
					{SPEEDS.map((s, i) => (
						<button key={s.label} className={`tp-pill ${speedIdx === i ? 'active' : ''}`} onClick={() => armFree(i)} disabled={status === 'running'}>
							{s.label}
						</button>
					))}
					<label className="tp-toggle">
						<input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} /> Musique
					</label>
				</div>
			)}

			<div className="tp-hud">
				<span className="tp-stat">
					Score <strong>{hud.score}</strong>
				</span>
				<span className={`tp-stat ${hud.combo >= 5 ? 'hot' : ''}`}>
					Combo <strong>{hud.combo}</strong>
					{hud.mult > 1 && <em> ×{hud.mult}</em>}
				</span>
				<span className="tp-stat">
					Record <strong>{best ?? '—'}</strong>
				</span>
			</div>

			<div className="tp-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className="tp-canvas" onPointerDown={onDown} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} />

				{status === 'ready' && !dailyLoading && (
					<div className="tp-overlay">
						<div className="tp-card">
							<h3>🎹 Tempo</h3>
							<p>
								Tape la colonne (clic/doigt ou <b>S D F&nbsp;J K L</b>) quand la tuile touche la ligne — une <b>musique donne le tempo</b>, cale-toi dessus. Les tuiles <b>allongées</b> se <b>maintiennent</b> pour un bonus. Ça <b>accélère</b> peu à peu&nbsp;: ton énergie baisse quand tu rates et remonte quand tu enchaînes.
							</p>
							<button className="tp-btn primary big" onClick={startRun}>
								▶ Go&nbsp;!
							</button>
						</div>
					</div>
				)}
				{dailyLoading && (
					<div className="tp-overlay">
						<div className="tp-card">Préparation du défi…</div>
					</div>
				)}
				{status === 'done' && result && (
					<div className="tp-overlay">
						<div className="tp-card">
							<div className={`tp-rank tp-rank-${result.rank}`}>{result.rank}</div>
							<h3>{result.score} pts</h3>
							<p>
								Tuiles jouées <strong>{result.tiles}</strong> · plus long combo <strong>{maxComboRef.current}</strong>
							</p>
							<button className="tp-btn primary big" onClick={startRun}>
								↻ Rejouer{daily ? ' (améliorer)' : ''}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="tp-help">
				Un « piano tiles » sans fin&nbsp;: la mélodie générée <b>accélère</b> peu à peu. Tape pile sur la ligne, <b>maintiens les tuiles longues</b> pour du bonus. {daily ? 'Défi du jour : même mélodie pour tous, meilleur score classé.' : 'Ton énergie (barre du haut) baisse sur un raté et remonte quand tu enchaînes — game over à zéro. Bats ton record !'}
			</p>

			{daily ? (
				<Leaderboard key={`lb-${gameId}`} game={gameId} metric="score" submitValue={status === 'done' ? submitScore : undefined} />
			) : (
				<LeaderboardCorner game={gameId} metric="score" />
			)}
		</div>
	);
}

const CSS = `
.tp-root { --tp: var(--accent-regular); width: 100%; max-width: 480px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.tp-dailytag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.55rem; }
.tp-songs { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.4rem; }
.tp-song { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 12px; border-radius: 999px; padding: 5px 11px; cursor: pointer; }
.tp-song.active { background: var(--tp); color: var(--accent-text-over); border-color: var(--tp); }
.tp-song:disabled { opacity: 0.4; cursor: not-allowed; }
.tp-pills { display: flex; gap: 6px; align-items: center; margin-bottom: 0.6rem; }
.tp-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 12.5px; border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.tp-pill.active { background: var(--tp); color: var(--accent-text-over); border-color: var(--tp); }
.tp-pill:disabled { opacity: 0.4; cursor: not-allowed; }
.tp-toggle { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--gray-200); cursor: pointer; }
.tp-toggle input { width: 14px; height: 14px; accent-color: var(--tp); }
.tp-hud { display: flex; gap: 0.5rem; font-size: 14px; font-weight: 600; margin-bottom: 0.6rem; }
.tp-stat { background: var(--gray-900); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.tp-stat strong { margin-left: 4px; color: var(--tp); }
.tp-stat.hot { background: #3a2f14; color: #ffe08a; }
.tp-stat.hot strong { color: #ffe08a; }
.tp-stat em { font-style: normal; color: #ffd166; margin-left: 3px; }
.tp-playwrap { position: relative; display: flex; justify-content: center; }
.tp-canvas { display: block; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 14px; box-shadow: var(--shadow-md); cursor: pointer; }
.tp-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); padding: 1rem; border-radius: 14px; }
.tp-card { background: var(--gray-999); border: 2px solid var(--tp); border-radius: 16px; padding: 20px 24px; max-width: 20rem; text-align: center; box-shadow: var(--shadow-lg); }
.tp-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.tp-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.55; margin: 0 0 0.9rem; }
.tp-rank { font-family: var(--font-brand); font-weight: 800; font-size: 54px; line-height: 1; margin-bottom: 4px; }
.tp-rank-S { color: #ffd166; } .tp-rank-A { color: #3ddc84; } .tp-rank-B { color: #7fd0ff; } .tp-rank-C { color: #c9b6ff; } .tp-rank-D { color: #ff9a8a; }
.tp-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
.tp-btn.primary { background: var(--tp); color: var(--accent-text-over); border-color: var(--tp); }
.tp-btn.big { font-size: 16px; padding: 11px 28px; }
.tp-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
