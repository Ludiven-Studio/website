import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import { DIFFS, generateMelody, judge, comboMult, rankOf, type Melody, type Grade } from './engine';

/* =====================================================
   SPECTRO — melodic pitch-tracing runner (prototype).
   A pentatonic melody scrolls past a playhead; move your cursor to trace its
   contour. Your pitch sounds continuously and BEATS against each target note
   (audio feedback — no cheating colours). Nail the pitch on the beat for
   Parfait/combo/score. Daily = seeded melody, best score ranked.
   ===================================================== */

type Status = 'ready' | 'running' | 'done';
const PLAYHEAD = 0.26;
const VISIBLE_BEATS = 5.5;
const LEAD = 0.9; // seconds before the first note
const bestKey = (d: number): string => `ludiven-spectro-best-${d}`;
const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface DailyState {
	best: number;
}
interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	color: string;
	kind: 'text' | 'spark';
	text?: string;
	size: number;
}

export default function SpectroGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [diffIdx, setDiffIdx] = useState(0);
	const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1 });
	const [result, setResult] = useState<{ score: number; rank: string; acc: number } | null>(null);
	const [best, setBest] = useState<number | null>(null);
	const [submitScore, setSubmitScore] = useState<number | undefined>(undefined);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 680, h: 420 });
	const melodyRef = useRef<Melody | null>(null);
	const beatRef = useRef(0);
	const judgedRef = useRef(0);
	const cursorRef = useRef(60);
	const scoreRef = useRef(0);
	const comboRef = useRef(0);
	const maxComboRef = useRef(0);
	const sumRef = useRef(0);
	const hitsRef = useRef(0);
	const partsRef = useRef<Particle[]>([]);
	const avatarRef = useRef({ hop: -9, bad: -9 });
	const animRef = useRef(0);
	const rafRef = useRef(0);
	const runningRef = useRef(false);
	const statusRef = useRef<Status>('ready');

	const ctxRef = useRef<AudioContext | null>(null);
	const masterRef = useRef<GainNode | null>(null);
	const audioStartRef = useRef(0);
	const cursorOscRef = useRef<{ o: OscillatorNode; g: GainNode } | null>(null);

	const dailyRef = useRef(false);
	const seedRef = useRef(0);
	const diffRef = useRef(0);
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
	const playNote = (freq: number, when: number, dur: number): void => {
		const ctx = ctxRef.current!;
		const g = ctx.createGain();
		g.connect(masterRef.current!);
		const peak = 0.16;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(peak, when + 0.01);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.3), when + 0.15);
		g.gain.setValueAtTime(Math.max(0.0001, peak * 0.3), when + dur);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.18);
		for (const [mult, amp] of [[1, 1], [2, 0.25], [3, 0.1]]) {
			const o = ctx.createOscillator();
			o.type = 'triangle';
			o.frequency.setValueAtTime(freq * mult, when);
			const hg = ctx.createGain();
			hg.gain.value = amp;
			o.connect(hg);
			hg.connect(g);
			o.start(when);
			o.stop(when + dur + 0.2);
		}
	};
	const startCursorTone = (): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		stopCursorTone();
		const g = ctx.createGain();
		g.gain.value = 0.0001;
		g.connect(masterRef.current!);
		const o = ctx.createOscillator();
		o.type = 'sine';
		o.frequency.value = midiToFreq(cursorRef.current);
		o.connect(g);
		o.start();
		g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05);
		cursorOscRef.current = { o, g };
	};
	const stopCursorTone = (): void => {
		const ctx = ctxRef.current;
		const c = cursorOscRef.current;
		if (ctx && c) {
			const t = ctx.currentTime;
			c.g.gain.cancelScheduledValues(t);
			c.g.gain.setValueAtTime(Math.max(0.0001, c.g.gain.value), t);
			c.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
			c.o.stop(t + 0.1);
		}
		cursorOscRef.current = null;
	};

	/* ---------- Geometry ---------- */
	const yForMidi = (m: number): number => {
		const { h } = dimRef.current;
		const mel = melodyRef.current;
		if (!mel) return h / 2;
		const top = h * 0.12;
		const bot = h * 0.9;
		return bot - ((m - mel.lo) / (mel.hi - mel.lo)) * (bot - top);
	};
	const midiForY = (y: number): number => {
		const { h } = dimRef.current;
		const mel = melodyRef.current;
		if (!mel) return 60;
		const top = h * 0.12;
		const bot = h * 0.9;
		const f = clamp((bot - y) / (bot - top), 0, 1);
		return mel.lo + f * (mel.hi - mel.lo);
	};
	const pxPerBeat = (): number => {
		const { w } = dimRef.current;
		return (w - w * PLAYHEAD) / VISIBLE_BEATS;
	};

	/* ---------- Run lifecycle ---------- */
	const loadMelody = useCallback((seed: number, di: number): void => {
		const mel = generateMelody(seed, di);
		melodyRef.current = mel;
		cursorRef.current = (mel.lo + mel.hi) / 2;
		beatRef.current = 0;
		judgedRef.current = 0;
		scoreRef.current = 0;
		comboRef.current = 0;
		maxComboRef.current = 0;
		sumRef.current = 0;
		hitsRef.current = 0;
		partsRef.current = [];
		avatarRef.current = { hop: -9, bad: -9 };
		setHud({ score: 0, combo: 0, mult: 1 });
		setResult(null);
	}, []);

	const startRun = (): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		loadMelody(seedRef.current, diffRef.current);
		const mel = melodyRef.current;
		if (!mel) return;
		audioStartRef.current = ctx.currentTime + LEAD;
		mel.notes.forEach((n) => playNote(midiToFreq(n.midi), audioStartRef.current + n.start / mel.tempo, n.dur / mel.tempo));
		startCursorTone();
		runningRef.current = true;
		setStat('running');
		setSubmitScore(undefined);
		trackGame(gameId, 'game_started', { mode: dailyRef.current ? 'daily' : 'free' });
	};

	const finishRun = useCallback((): void => {
		runningRef.current = false;
		stopCursorTone();
		const hits = Math.max(1, hitsRef.current);
		const mean = sumRef.current / hits;
		const rank = rankOf(mean);
		const score = scoreRef.current;
		setResult({ score, rank, acc: Math.round(mean) });
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

	/* ---------- Modes ---------- */
	const armFree = useCallback(
		(di: number): void => {
			dailyRef.current = false;
			setDaily(false);
			setDailyLoading(false);
			setDiffIdx(di);
			diffRef.current = di;
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			loadMelody(seedRef.current, di);
			setStat('ready');
			let b: number | null = null;
			try {
				const v = localStorage.getItem(bestKey(di));
				if (v != null) b = Number(v);
			} catch {
				/* ignore */
			}
			dailyBestRef.current = null;
			setBest(b);
		},
		[loadMelody],
	);

	const startDaily = useCallback(async (): Promise<void> => {
		dailyRef.current = true;
		setDaily(true);
		runningRef.current = false;
		stopCursorTone();
		const apply = (seed: number, di: number, st: DailyState | null): void => {
			seedRef.current = seed >>> 0;
			diffRef.current = clamp(di, 0, 2);
			setDiffIdx(diffRef.current);
			loadMelody(seedRef.current, diffRef.current);
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
	}, [gameId, loadMelody]);

	/* ---------- Pointer ---------- */
	const onPoint = (e: React.PointerEvent): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const rect = cv.getBoundingClientRect();
		const y = (e.clientY - rect.top) * (dimRef.current.h / rect.height);
		cursorRef.current = midiForY(y);
	};

	/* ---------- Loop ---------- */
	useEffect(() => {
		armFree(0);
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const w = wrap.clientWidth;
			const h = Math.round(clamp(w * 0.58, 300, 460));
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h };
			cv.style.height = `${h}px`;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
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
			cancelAnimationFrame(rafRef.current);
			stopCursorTone();
			void ctxRef.current?.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const emitJudge = (grade: Grade, y: number): void => {
		const color = grade === 'Parfait' ? '#3ddc84' : grade === 'Bien' ? '#7fd0ff' : grade === 'Ok' ? '#ffd166' : '#ff6a6a';
		const px = dimRef.current.w * PLAYHEAD;
		partsRef.current.push({ x: px, y: y - 18, vx: 0, vy: -40, life: 0.8, maxLife: 0.8, color, kind: 'text', text: grade, size: 16 });
		if (grade === 'Parfait' || grade === 'Bien') {
			for (let i = 0; i < 10; i++) {
				const a = (i / 10) * Math.PI * 2;
				partsRef.current.push({ x: px, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.5, maxLife: 0.5, color, kind: 'spark', size: 3 });
			}
		}
	};

	const step = (dt: number): void => {
		// particles
		for (const p of partsRef.current) {
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vy += 60 * dt;
			p.life -= dt;
		}
		partsRef.current = partsRef.current.filter((p) => p.life > 0);

		if (!runningRef.current) return;
		const ctx = ctxRef.current;
		const mel = melodyRef.current;
		if (!ctx || !mel) return;
		const beat = (ctx.currentTime - audioStartRef.current) * mel.tempo;
		beatRef.current = beat;
		// keep the played pitch following the cursor
		if (cursorOscRef.current) cursorOscRef.current.o.frequency.setTargetAtTime(midiToFreq(cursorRef.current), ctx.currentTime, 0.01);
		// judgments at each note onset
		while (judgedRef.current < mel.notes.length && beat >= mel.notes[judgedRef.current].start) {
			const n = mel.notes[judgedRef.current];
			const cents = Math.abs((cursorRef.current - n.midi) * 100);
			const { grade, points } = judge(cents);
			if (points > 0) comboRef.current += 1;
			else comboRef.current = 0;
			maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
			scoreRef.current += Math.round(points * comboMult(comboRef.current));
			sumRef.current += points;
			hitsRef.current += 1;
			emitJudge(grade, yForMidi(n.midi));
			if (points > 0) avatarRef.current.hop = animRef.current;
			else avatarRef.current.bad = animRef.current;
			judgedRef.current += 1;
			setHud({ score: scoreRef.current, combo: comboRef.current, mult: comboMult(comboRef.current) });
		}
		if (beat > mel.beats + 1.0) finishRun();
	};

	/* ---------- Draw ---------- */
	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const { w, h } = dimRef.current;
		const mel = melodyRef.current;
		const beat = runningRef.current ? beatRef.current : 0;
		const px = w * PLAYHEAD;
		const ppb = pxPerBeat();
		const anim = animRef.current;

		const bg = ctx.createLinearGradient(0, 0, 0, h);
		bg.addColorStop(0, '#0c1018');
		bg.addColorStop(1, '#141b28');
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, w, h);

		// hot zone + playhead
		ctx.fillStyle = 'rgba(120,160,255,0.06)';
		ctx.fillRect(px - 26, 0, 52, h);
		ctx.strokeStyle = 'rgba(150,190,255,0.5)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(px, 0);
		ctx.lineTo(px, h);
		ctx.stroke();

		if (mel) {
			// target notes (spectrum-tinted platforms scrolling by)
			for (let i = 0; i < mel.notes.length; i++) {
				const n = mel.notes[i];
				const x0 = px + (n.start - beat) * ppb;
				const x1 = px + (n.start + n.dur - beat) * ppb;
				if (x1 < -20 || x0 > w + 20) continue;
				const y = yForMidi(n.midi);
				const hue = clamp(240 - ((n.midi - mel.lo) / (mel.hi - mel.lo)) * 240, 0, 240);
				const passed = i < judgedRef.current;
				ctx.globalAlpha = passed ? 0.35 : 1;
				// faint beam to the floor (spectrum flavour)
				ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.12)`;
				ctx.fillRect(x0, y, Math.max(6, x1 - x0), h * 0.9 - y);
				// platform capsule
				ctx.fillStyle = `hsl(${hue}, 85%, 60%)`;
				ctx.shadowColor = `hsl(${hue}, 85%, 62%)`;
				ctx.shadowBlur = passed ? 0 : 10;
				const pw = Math.max(10, x1 - x0 - 4);
				ctx.beginPath();
				ctx.roundRect(x0 + 2, y - 6, pw, 12, 6);
				ctx.fill();
				ctx.shadowBlur = 0;
				ctx.globalAlpha = 1;
			}
		}

		// cursor + avatar
		const cy = mel ? yForMidi(cursorRef.current) : h / 2;
		const hopA = clamp(1 - (anim - avatarRef.current.hop) / 0.28, 0, 1);
		const badA = clamp(1 - (anim - avatarRef.current.bad) / 0.3, 0, 1);
		const ay = cy - Math.sin(hopA * Math.PI) * 16;
		// trail
		ctx.strokeStyle = 'rgba(255,220,120,0.35)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(px - 34, cy);
		ctx.lineTo(px, cy);
		ctx.stroke();
		const r = 12;
		ctx.fillStyle = badA > 0 ? `rgba(255,${Math.round(120 + 100 * (1 - badA))},90,1)` : '#ffd54a';
		ctx.beginPath();
		ctx.arc(px, ay, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#2a2118';
		ctx.beginPath();
		ctx.arc(px - 4, ay - 2, 1.8, 0, Math.PI * 2);
		ctx.arc(px + 4, ay - 2, 1.8, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#2a2118';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(px, ay + (badA > 0 ? 4 : 1), 4, badA > 0 ? 1.15 * Math.PI : 0.15 * Math.PI, badA > 0 ? 1.85 * Math.PI : 0.85 * Math.PI);
		ctx.stroke();

		// particles
		for (const p of partsRef.current) {
			const a = clamp(p.life / p.maxLife, 0, 1);
			ctx.globalAlpha = a;
			if (p.kind === 'text') {
				ctx.fillStyle = p.color;
				ctx.font = `bold ${p.size}px system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(p.text ?? '', p.x, p.y);
			} else {
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
	};

	const diffLabel = DIFFS[diffIdx]?.label ?? '';

	return (
		<div className="sp-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffIdx)} onDaily={startDaily} />

			{daily ? (
				<div className="sp-dailytag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${diffLabel}`}
				</div>
			) : (
				<div className="sp-pills" role="tablist" aria-label="Difficulté">
					{DIFFS.map((d, i) => (
						<button key={d.label} role="tab" aria-selected={diffIdx === i} className={`sp-pill ${diffIdx === i ? 'active' : ''}`} onClick={() => armFree(i)}>
							{d.label}
						</button>
					))}
				</div>
			)}

			<div className="sp-hud">
				<span className="sp-stat">
					Score <strong>{hud.score}</strong>
				</span>
				<span className={`sp-stat ${hud.combo >= 5 ? 'hot' : ''}`}>
					Combo <strong>{hud.combo}</strong>
					{hud.mult > 1 && <em> ×{hud.mult}</em>}
				</span>
				<span className="sp-stat">
					Record <strong>{best ?? '—'}</strong>
				</span>
			</div>

			<div className="sp-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className="sp-canvas" onPointerDown={onPoint} onPointerMove={onPoint} />

				{status === 'ready' && !dailyLoading && (
					<div className="sp-overlay">
						<div className="sp-card">
							<h3>🎵 Spectro</h3>
							<p>
								Bouge la souris (ou le doigt) de <b>haut en bas</b> pour suivre la mélodie&nbsp;: ta note sonne et <b>bat</b> contre la cible quand tu t'en approches. Sois pile dessus sur chaque temps&nbsp;!
							</p>
							<button className="sp-btn primary big" onClick={startRun}>
								▶ Go&nbsp;!
							</button>
						</div>
					</div>
				)}
				{dailyLoading && (
					<div className="sp-overlay">
						<div className="sp-card">Préparation du défi…</div>
					</div>
				)}
				{status === 'done' && result && (
					<div className="sp-overlay">
						<div className="sp-card">
							<div className={`sp-rank sp-rank-${result.rank}`}>{result.rank}</div>
							<h3>{result.score} pts</h3>
							<p>
								Précision moyenne <strong>{result.acc}%</strong> · plus long combo <strong>{maxComboRef.current}</strong>
							</p>
							<button className="sp-btn primary big" onClick={startRun}>
								↻ Rejouer{daily ? ' (améliorer)' : ''}
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="sp-help">
				Prototype — un runner musical. Suis le contour de la mélodie qui défile&nbsp;; fie-toi à l'oreille (ta note bat contre la cible). Parfait = pile dessus, les combos multiplient le score. {daily ? 'Défi du jour : même mélodie pour tout le monde, meilleur score classé.' : 'Choisis ta difficulté et bats ton record.'}
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
.sp-root { --sp: var(--accent-regular); width: 100%; max-width: 720px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.sp-dailytag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.55rem; }
.sp-pills { display: flex; gap: 6px; margin-bottom: 0.55rem; }
.sp-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.sp-pill.active { background: var(--sp); color: var(--accent-text-over); border-color: var(--sp); }
.sp-hud { display: flex; gap: 0.5rem; font-size: 14px; font-weight: 600; margin-bottom: 0.6rem; }
.sp-stat { background: var(--gray-900); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.sp-stat strong { margin-left: 4px; color: var(--sp); }
.sp-stat.hot { background: #3a2f14; color: #ffe08a; }
.sp-stat.hot strong { color: #ffe08a; }
.sp-stat em { font-style: normal; color: #ffd166; margin-left: 3px; }
.sp-playwrap { width: 100%; position: relative; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-md); }
.sp-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; cursor: crosshair; }
.sp-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); padding: 1rem; }
.sp-card { background: var(--gray-999); border: 2px solid var(--sp); border-radius: 16px; padding: 20px 24px; max-width: 22rem; text-align: center; box-shadow: var(--shadow-lg); }
.sp-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-2xl); }
.sp-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.55; margin: 0 0 0.9rem; }
.sp-rank { font-family: var(--font-brand); font-weight: 800; font-size: 54px; line-height: 1; margin-bottom: 4px; }
.sp-rank-S { color: #ffd166; } .sp-rank-A { color: #3ddc84; } .sp-rank-B { color: #7fd0ff; } .sp-rank-C { color: #c9b6ff; } .sp-rank-D { color: #ff9a8a; }
.sp-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
.sp-btn.primary { background: var(--sp); color: var(--accent-text-over); border-color: var(--sp); }
.sp-btn.big { font-size: 16px; padding: 11px 28px; }
.sp-help { max-width: 620px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
