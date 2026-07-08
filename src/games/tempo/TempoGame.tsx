import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import { LANES, SONGS, SPEEDS, buildChart, dailySong, judgeTiming, comboMult, rankOf, type Chart, type Grade } from './engine';

/* =====================================================
   TEMPO — piano-tiles rhythm game (prototype).
   Public-domain tunes fall as tiles; tap the lane (pointer or D/F/J/K) the
   instant a tile hits the line — each hit plays its note, so you play the song.
   Combos, ranks, daily song + best score. Audio-clock synced.
   ===================================================== */

type Status = 'ready' | 'running' | 'done';
const KEYS = ['d', 'f', 'j', 'k'];
const LANE_HUE = [205, 265, 330, 35];
const LEAD = 1.9; // seconds a tile takes to fall to the line
const HIT_FRAC = 0.8;
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
	const [songIdx, setSongIdx] = useState(0);
	const [metro, setMetro] = useState(true);
	const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1 });
	const [result, setResult] = useState<{ score: number; rank: string; acc: number } | null>(null);
	const [best, setBest] = useState<number | null>(null);
	const [submitScore, setSubmitScore] = useState<number | undefined>(undefined);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 460, h: 640 });
	const chartRef = useRef<Chart | null>(null);
	const stateArrRef = useRef<(Grade | 'pending')[]>([]);
	const scoreRef = useRef(0);
	const comboRef = useRef(0);
	const maxComboRef = useRef(0);
	const sumRef = useRef(0);
	const laneFlashRef = useRef<number[]>([-9, -9, -9, -9]);
	const partsRef = useRef<Particle[]>([]);
	const animRef = useRef(0);
	const rafRef = useRef(0);
	const runningRef = useRef(false);
	const statusRef = useRef<Status>('ready');

	const ctxRef = useRef<AudioContext | null>(null);
	const masterRef = useRef<GainNode | null>(null);
	const audioStartRef = useRef(0);
	const metroRef = useRef(true);

	const dailyRef = useRef(false);
	const seedRef = useRef(0);
	const speedRef = useRef(1);
	const songRef = useRef(0);
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
	const playPiano = (midi: number): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		const when = ctx.currentTime;
		const freq = midiToFreq(midi);
		const g = ctx.createGain();
		g.connect(masterRef.current!);
		const peak = 0.2;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(peak, when + 0.005);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
		for (const [mult, amp] of [[1, 1], [2, 0.3], [3, 0.12], [4, 0.06]]) {
			const o = ctx.createOscillator();
			o.type = 'triangle';
			o.frequency.setValueAtTime(freq * mult, when);
			const hg = ctx.createGain();
			hg.gain.value = amp;
			o.connect(hg);
			hg.connect(g);
			o.start(when);
			o.stop(when + 0.55);
		}
	};
	const tick = (when: number): void => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		const g = ctx.createGain();
		g.connect(masterRef.current!);
		g.gain.setValueAtTime(0.05, when);
		g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
		const o = ctx.createOscillator();
		o.type = 'sine';
		o.frequency.value = 900;
		o.connect(g);
		o.start(when);
		o.stop(when + 0.05);
	};

	/* ---------- Geometry ---------- */
	const laneW = (): number => dimRef.current.w / LANES;
	const hitY = (): number => dimRef.current.h * HIT_FRAC;
	const pxPerSec = (): number => hitY() / LEAD;
	const songTime = (): number => {
		const ctx = ctxRef.current;
		return ctx ? ctx.currentTime - audioStartRef.current : 0;
	};

	/* ---------- Run ---------- */
	const prepare = useCallback((song: number, speed: number): void => {
		chartRef.current = buildChart(SONGS[song], speed);
		stateArrRef.current = chartRef.current.tiles.map(() => 'pending');
		scoreRef.current = 0;
		comboRef.current = 0;
		maxComboRef.current = 0;
		sumRef.current = 0;
		partsRef.current = [];
		laneFlashRef.current = [-9, -9, -9, -9];
		setHud({ score: 0, combo: 0, mult: 1 });
		setResult(null);
	}, []);

	const startRun = (): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		prepare(songRef.current, speedRef.current);
		const chart = chartRef.current!;
		audioStartRef.current = ctx.currentTime + LEAD;
		if (metroRef.current) chart.beatTimes.forEach((bt) => tick(audioStartRef.current + bt));
		runningRef.current = true;
		setStat('running');
		setSubmitScore(undefined);
		trackGame(gameId, 'game_started', { mode: dailyRef.current ? 'daily' : 'free', song: songRef.current });
	};

	const finishRun = useCallback((): void => {
		runningRef.current = false;
		const arr = stateArrRef.current;
		for (let i = 0; i < arr.length; i++) if (arr[i] === 'pending') arr[i] = 'Raté'; // count leftovers
		const total = Math.max(1, arr.length);
		const mean = sumRef.current / total;
		const rank = rankOf(mean);
		const score = scoreRef.current;
		setResult({ score, rank, acc: Math.round(mean) });
		setStat('done');
		if (dailyRef.current) {
			dailyBestRef.current = dailyBestRef.current == null ? score : Math.max(dailyBestRef.current, score);
			setBest(dailyBestRef.current);
			setSubmitScore(dailyBestRef.current);
			saveDailyRun(gameId, { startedAt: Date.now(), done: true, seed: seedRef.current, diffIndex: speedRef.current === SPEEDS[0].speed ? 0 : speedRef.current === SPEEDS[2].speed ? 2 : 1, state: { best: dailyBestRef.current } satisfies DailyState });
		} else {
			setBest((prev) => {
				const nb = prev == null ? score : Math.max(prev, score);
				try {
					localStorage.setItem(bestKey(songRef.current), String(nb));
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
	const emit = (grade: Grade, lane: number): void => {
		const color = grade === 'Parfait' ? '#3ddc84' : grade === 'Bien' ? '#7fd0ff' : grade === 'Ok' ? '#ffd166' : '#ff6a6a';
		const x = (lane + 0.5) * laneW();
		partsRef.current.push({ x, y: hitY() - 18, vy: -50, life: 0.7, maxLife: 0.7, color, text: grade, size: 15 });
		if (grade === 'Parfait' || grade === 'Bien') for (let i = 0; i < 8; i++) partsRef.current.push({ x, y: hitY(), vy: -60 - Math.random() * 60, life: 0.45, maxLife: 0.45, color, size: 3 });
	};
	const hitLane = (lane: number): void => {
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
		if (!jd) return; // too early/late — forgiving, no penalty
		arr[bi] = jd.grade;
		playPiano(chart.tiles[bi].midi);
		comboRef.current += 1;
		maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
		scoreRef.current += Math.round(jd.points * comboMult(comboRef.current));
		sumRef.current += jd.points;
		emit(jd.grade, lane);
		setHud({ score: scoreRef.current, combo: comboRef.current, mult: comboMult(comboRef.current) });
	};
	const hitLaneRef = useRef(hitLane);
	hitLaneRef.current = hitLane;

	const onDown = (e: React.PointerEvent): void => {
		if (!runningRef.current) return;
		const cv = canvasRef.current;
		if (!cv) return;
		const rect = cv.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (dimRef.current.w / rect.width);
		hitLane(clamp(Math.floor(x / laneW()), 0, LANES - 1));
	};

	/* ---------- Modes ---------- */
	const armFree = useCallback(
		(song: number, speed: number): void => {
			dailyRef.current = false;
			setDaily(false);
			setDailyLoading(false);
			setSongIdx(song);
			songRef.current = song;
			speedRef.current = speed;
			seedRef.current = 0;
			prepare(song, speed);
			setStat('ready');
			dailyBestRef.current = null;
			let b: number | null = null;
			try {
				const v = localStorage.getItem(bestKey(song));
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
			const sp = SPEEDS[clamp(di, 0, 2)].speed;
			speedRef.current = sp;
			setSpeedIdx(clamp(di, 0, 2));
			const song = dailySong(seedRef.current);
			songRef.current = song;
			setSongIdx(song);
			prepare(song, sp);
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
		armFree(0, SPEEDS[1].speed);
		setSpeedIdx(1);
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
		const onKey = (e: KeyboardEvent): void => {
			const lane = KEYS.indexOf(e.key.toLowerCase());
			if (lane >= 0 && runningRef.current) {
				e.preventDefault();
				hitLaneRef.current(lane);
			}
		};
		window.addEventListener('keydown', onKey);
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
			window.removeEventListener('keydown', onKey);
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
		const arr = stateArrRef.current;
		let changed = false;
		chart.tiles.forEach((t, i) => {
			if (arr[i] === 'pending' && now - t.time > 0.28) {
				arr[i] = 'Raté';
				comboRef.current = 0;
				emit('Raté', t.lane);
				changed = true;
			}
		});
		if (changed) setHud({ score: scoreRef.current, combo: comboRef.current, mult: comboMult(comboRef.current) });
		if (now > chart.totalTime + 0.6) finishRun();
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
		// lanes
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
		// hit line
		ctx.strokeStyle = 'rgba(150,190,255,0.55)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(0, hy);
		ctx.lineTo(w, hy);
		ctx.stroke();

		// tiles
		if (chart) {
			const arr = stateArrRef.current;
			chart.tiles.forEach((t, i) => {
				if (arr[i] !== 'pending') return;
				const yBottom = hy + (now - t.time) * pps;
				const hh = Math.max(lw * 0.55, t.dur * pps);
				const yTop = yBottom - hh;
				if (yBottom < -4 || yTop > h) return;
				const x = t.lane * lw + 4;
				const hue = LANE_HUE[t.lane];
				const g = ctx.createLinearGradient(0, yTop, 0, yBottom);
				g.addColorStop(0, `hsl(${hue}, 80%, 62%)`);
				g.addColorStop(1, `hsl(${hue}, 75%, 48%)`);
				ctx.fillStyle = g;
				ctx.shadowColor = `hsl(${hue}, 85%, 60%)`;
				ctx.shadowBlur = 10;
				ctx.beginPath();
				ctx.roundRect(x, yTop, lw - 8, hh, 8);
				ctx.fill();
				ctx.shadowBlur = 0;
			});
		}

		// keys
		for (let l = 0; l < LANES; l++) {
			const flash = clamp(1 - (anim - laneFlashRef.current[l]) / 0.18, 0, 1);
			ctx.fillStyle = `rgba(${120 + 120 * flash}, ${150 + 90 * flash}, 255, ${0.12 + 0.5 * flash})`;
			ctx.fillRect(l * lw + 3, hy + 3, lw - 6, h - hy - 6);
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = 'bold 14px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(KEYS[l].toUpperCase(), (l + 0.5) * lw, (hy + h) / 2);
		}

		// particles
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

	const songName = SONGS[songIdx]?.name ?? '';

	return (
		<div className="tp-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(songRef.current, speedRef.current)} onDaily={startDaily} />

			{daily ? (
				<div className="tp-dailytag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${songName} · ${SPEEDS[speedIdx].label}`}
				</div>
			) : (
				<>
					<div className="tp-songs">
						{SONGS.map((s, i) => (
							<button key={s.name} className={`tp-song ${songIdx === i ? 'active' : ''}`} onClick={() => armFree(i, speedRef.current)} disabled={status === 'running'}>
								{s.name}
							</button>
						))}
					</div>
					<div className="tp-pills">
						{SPEEDS.map((s, i) => (
							<button key={s.label} className={`tp-pill ${speedIdx === i ? 'active' : ''}`} onClick={() => { setSpeedIdx(i); armFree(songRef.current, s.speed); }} disabled={status === 'running'}>
								{s.label}
							</button>
						))}
						<label className="tp-toggle">
							<input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} /> Métro
						</label>
					</div>
				</>
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
				<canvas ref={canvasRef} className="tp-canvas" onPointerDown={onDown} />

				{status === 'ready' && !dailyLoading && (
					<div className="tp-overlay">
						<div className="tp-card">
							<h3>🎹 {songName}</h3>
							<p>
								Tape la colonne (clic/doigt ou <b>D F J K</b>) au moment où la tuile touche la ligne. Chaque tuile joue sa note&nbsp;: suis le rythme pour jouer l'air&nbsp;!
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
								Précision <strong>{result.acc}%</strong> · plus long combo <strong>{maxComboRef.current}</strong>
							</p>
							<button className="tp-btn primary big" onClick={startRun}>
								↻ Rejouer{daily ? ' (améliorer)' : ''}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="tp-help">
				Prototype — un « piano tiles » sur des airs connus (libres de droits). Tape pile sur la ligne&nbsp;; les combos multiplient le score. {daily ? 'Défi du jour : même air pour tous, meilleur score classé.' : 'Choisis un air et une vitesse, et bats ton record.'}
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
