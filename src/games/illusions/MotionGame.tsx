import { useEffect, useRef, useState, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import { mulberry32 } from '../prng';
import { SNAKE_UNIT, ringRadii, spiralShade, chaserGap } from './motion';

/* =====================================================
   ÇA BOUGE ! — illusory motion (React island)
   Kitaoka's rotating snakes, Hinton's lilac chaser and the
   spiral motion aftereffect. Pure helpers in ./motion.
   ===================================================== */

type Mode = 'wheels' | 'chaser' | 'spiral';
type Phase = 'idle' | 'adapt' | 'test';

const MODES: { id: Mode; label: string }[] = [
	{ id: 'wheels', label: 'Roues tournantes' },
	{ id: 'chaser', label: 'Le point vert' },
	{ id: 'spiral', label: 'La spirale' },
];

const WHEEL_BG = '#56683a';
const CHASER_BG = '#c4c4c4';
const LILAC = [222, 110, 222];
const ADAPT_S = 30;
const SPIRAL_ARMS = 3;
const SPIRAL_RPS = 0.5;

/** Size a canvas backing store to CSS size × dpr; drawing then happens in CSS px. */
function fit(canvas: HTMLCanvasElement, w: number, h: number, maxDpr = 3): CanvasRenderingContext2D {
	const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
	const bw = Math.round(w * dpr);
	const bh = Math.round(h * dpr);
	if (canvas.width !== bw || canvas.height !== bh) {
		canvas.width = bw;
		canvas.height = bh;
	}
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
	return ctx;
}

function sector(ctx: CanvasRenderingContext2D, cx: number, cy: number, ri: number, ro: number, a0: number, a1: number) {
	const lo = Math.min(a0, a1) - 0.004;
	const hi = Math.max(a0, a1) + 0.004;
	ctx.beginPath();
	ctx.arc(cx, cy, ro, lo, hi);
	ctx.arc(cx, cy, ri, hi, lo, true);
	ctx.closePath();
	ctx.fill();
}

/** One "rotating snake" disc; dir = 1 drifts clockwise, -1 anticlockwise. */
function drawSnakeDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, dir: 1 | -1, units = 20) {
	const radii = ringRadii(R, units);
	const core = radii[radii.length - 1] * (radii[1] / radii[0]);
	const step = (2 * Math.PI) / units;
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, Math.PI * 2);
	ctx.fillStyle = SNAKE_UNIT[1].color;
	ctx.fill();
	radii.forEach((ro, i) => {
		// Overlap inward: the next ring paints over it, so no seam of the base colour shows.
		const ri = Math.max(0, (radii[i + 1] ?? core) - 0.6);
		const off = (i % 2) * (step / 2);
		for (let u = 0; u < units; u++) {
			let a = u * step + off;
			for (const seg of SNAKE_UNIT) {
				const a1 = a + seg.share * step;
				if (seg !== SNAKE_UNIT[1]) {
					ctx.fillStyle = seg.color;
					sector(ctx, cx, cy, ri, ro, dir * a, dir * a1);
				}
				a = a1;
			}
		}
	});
	ctx.beginPath();
	ctx.arc(cx, cy, core, 0, Math.PI * 2);
	ctx.fillStyle = '#16161c';
	ctx.fill();
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, Math.PI * 2);
	ctx.lineWidth = Math.max(1, R * 0.015);
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
	ctx.stroke();
}

function drawChaser(ctx: CanvasRenderingContext2D, s: number, gap: number) {
	ctx.fillStyle = CHASER_BG;
	ctx.fillRect(0, 0, s, s);
	const orbit = s * 0.34;
	const blur = s * 0.1;
	const [r, g, b] = LILAC;
	for (let i = 0; i < 12; i++) {
		if (i === gap) continue;
		const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
		const x = s / 2 + Math.cos(a) * orbit;
		const y = s / 2 + Math.sin(a) * orbit;
		const grad = ctx.createRadialGradient(x, y, 0, x, y, blur);
		grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
		grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.85)`);
		grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
		ctx.fillStyle = grad;
		ctx.fillRect(x - blur, y - blur, blur * 2, blur * 2);
	}
	const arm = s * 0.035;
	ctx.strokeStyle = '#000';
	ctx.lineWidth = Math.max(2, s * 0.008);
	ctx.beginPath();
	ctx.moveTo(s / 2 - arm, s / 2);
	ctx.lineTo(s / 2 + arm, s / 2);
	ctx.moveTo(s / 2, s / 2 - arm);
	ctx.lineTo(s / 2, s / 2 + arm);
	ctx.stroke();
}

/** Black-and-white spiral, rendered once; the loop only rotates the bitmap. */
function spiralImage(px: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = c.height = px;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(px, px);
	const R = px / 2;
	const lambda = R / 5;
	for (let y = 0; y < px; y++)
		for (let x = 0; x < px; x++) {
			const dx = x + 0.5 - R;
			const dy = y + 0.5 - R;
			const i = (y * px + x) * 4;
			const d = Math.hypot(dx, dy);
			if (d > R) continue;
			const v = Math.round(spiralShade(dx, dy, SPIRAL_ARMS, lambda) * 255);
			img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
			img.data[i + 3] = Math.round(Math.min(1, R - d) * 255);
		}
	ctx.putImageData(img, 0, 0);
	return c;
}

/** A textured brick wall: fine detail is what makes the aftereffect visible. */
function brickImage(px: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = c.height = px;
	const ctx = c.getContext('2d')!;
	const rnd = mulberry32(1834);
	ctx.fillStyle = '#cfc6b6';
	ctx.fillRect(0, 0, px, px);
	const h = px / 11;
	const w = h * 2.1;
	const joint = Math.max(1, h * 0.12);
	for (let row = 0, y = -h * 0.3; y < px; row++, y += h) {
		for (let x = row % 2 ? -w / 2 : -w * 0.1; x < px; x += w) {
			const l = 0.75 + rnd() * 0.4;
			const tint = rnd() < 0.12 ? 0.62 : 1;
			ctx.fillStyle = `rgb(${Math.round(170 * l * tint)}, ${Math.round(78 * l * tint)}, ${Math.round(54 * l * tint)})`;
			ctx.fillRect(x + joint / 2, y + joint / 2, w - joint, h - joint);
		}
	}
	const img = ctx.getImageData(0, 0, px, px);
	for (let i = 0; i < img.data.length; i += 4) {
		const n = (rnd() - 0.5) * 46;
		img.data[i] += n;
		img.data[i + 1] += n;
		img.data[i + 2] += n;
	}
	ctx.putImageData(img, 0, 0);
	return c;
}

function Wheels() {
	const wrap = useRef<HTMLDivElement>(null);
	const cv = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const el = wrap.current!;
		const canvas = cv.current!;
		const draw = () => {
			const w = el.clientWidth;
			const h = el.clientHeight;
			if (!w || !h) return;
			const wide = w >= 480; // same breakpoint as the container query on .ilmo-wheels
			const cols = wide ? 3 : 2;
			const rows = wide ? 2 : 3;
			const cell = w / cols;
			const ctx = fit(canvas, w, h);
			ctx.fillStyle = WHEEL_BG;
			ctx.fillRect(0, 0, w, h);
			for (let r = 0; r < rows; r++)
				for (let c = 0; c < cols; c++)
					drawSnakeDisc(ctx, (c + 0.5) * cell, (r + 0.5) * cell, cell * 0.47, (r + c) % 2 ? 1 : -1);
			// Small discs in the gaps where four wheels meet.
			for (let r = 1; r < rows; r++)
				for (let c = 1; c < cols; c++)
					drawSnakeDisc(ctx, c * cell, r * cell, cell * 0.2, (r + c) % 2 ? -1 : 1, 14);
		};
		const ro = new ResizeObserver(draw);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return (
		<div ref={wrap} className="ilmo-stage ilmo-wheels" data-art>
			<canvas ref={cv} role="img" aria-label="Roues aux motifs noir, bleu, blanc et jaune, parfaitement immobiles" />
		</div>
	);
}

function Chaser({ onPlay }: { onPlay: () => void }) {
	const wrap = useRef<HTMLDivElement>(null);
	const cv = useRef<HTMLCanvasElement>(null);
	const [running, setRunning] = useState(true);
	const runningRef = useRef(running);
	runningRef.current = running;

	useEffect(() => {
		const el = wrap.current!;
		const canvas = cv.current!;
		let ctx: CanvasRenderingContext2D | null = null;
		let size = 0;
		let gap = -1;
		let t = 0;
		let last = 0;
		let raf = 0;
		const ro = new ResizeObserver(() => {
			size = el.clientWidth;
			if (!size) return;
			ctx = fit(canvas, size, size);
			gap = -1;
		});
		ro.observe(el);
		const frame = (now: number) => {
			// Clamped: a hidden tab stops rAF, so the chase resumes where it left off.
			const dt = last ? Math.min(now - last, 100) : 0;
			last = now;
			if (runningRef.current) t += dt;
			const g = chaserGap(t);
			if (ctx && g !== gap) {
				drawChaser(ctx, size, g);
				gap = g;
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, []);

	return (
		<>
			<div ref={wrap} className="ilmo-stage ilmo-square">
				<canvas ref={cv} role="img" aria-label="Douze points roses flous en cercle autour d'une croix noire" />
			</div>
			<div className="ilmo-actions">
				<button
					className="ilmo-act"
					onClick={() => {
						onPlay();
						setRunning((r) => !r);
					}}
				>
					{running ? '⏸ Arrêter le manège' : '▶ Relancer'}
				</button>
			</div>
			{!running && (
				<p className="ilmo-note">
					À l'arrêt, plus de point vert : il n'a jamais existé, c'est ton œil qui le fabrique.
				</p>
			)}
		</>
	);
}

function Spiral({ onPlay }: { onPlay: () => void }) {
	const wrap = useRef<HTMLDivElement>(null);
	const cv = useRef<HTMLCanvasElement>(null);
	const bar = useRef<HTMLSpanElement>(null);
	const [phase, setPhase] = useState<Phase>('idle');
	const [left, setLeft] = useState(ADAPT_S);
	const [outward, setOutward] = useState(true);
	const phaseRef = useRef<Phase>('idle');
	const outwardRef = useRef(outward);
	outwardRef.current = outward;
	const dirtyRef = useRef(true);
	const elapsedRef = useRef(0);

	const go = useCallback((p: Phase) => {
		phaseRef.current = p;
		elapsedRef.current = 0;
		dirtyRef.current = true;
		setLeft(ADAPT_S);
		setPhase(p);
	}, []);

	useEffect(() => {
		const el = wrap.current!;
		const canvas = cv.current!;
		let ctx: CanvasRenderingContext2D | null = null;
		let size = 0;
		let spiral: HTMLCanvasElement | null = null;
		let bricks: HTMLCanvasElement | null = null;
		let angle = 0;
		let last = 0;
		let raf = 0;
		let shown = ADAPT_S;
		const ro = new ResizeObserver(() => {
			size = el.clientWidth;
			if (!size) return;
			ctx = fit(canvas, size, size, 2);
			const px = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
			spiral = spiralImage(px);
			bricks = brickImage(px);
			dirtyRef.current = true;
		});
		ro.observe(el);

		const draw = () => {
			if (!ctx || !spiral || !bricks) return;
			const s = size;
			ctx.clearRect(0, 0, s, s);
			ctx.save();
			if (phaseRef.current === 'test') {
				ctx.beginPath();
				ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
				ctx.clip();
				ctx.drawImage(bricks, 0, 0, s, s);
			} else {
				ctx.translate(s / 2, s / 2);
				ctx.rotate(angle);
				ctx.drawImage(spiral, -s / 2, -s / 2, s, s);
			}
			ctx.restore();
			ctx.beginPath();
			ctx.arc(s / 2, s / 2, Math.max(4, s * 0.014), 0, Math.PI * 2);
			ctx.fillStyle = '#e02424';
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#fff';
			ctx.stroke();
		};

		const frame = (now: number) => {
			const dt = last ? Math.min(now - last, 100) / 1000 : 0;
			last = now;
			if (phaseRef.current === 'adapt') {
				// Positive rotation sweeps the bands outward (canvas y points down).
				angle += (outwardRef.current ? 1 : -1) * SPIRAL_RPS * 2 * Math.PI * dt;
				elapsedRef.current += dt;
				const rest = Math.max(0, Math.ceil(ADAPT_S - elapsedRef.current));
				if (rest !== shown) {
					shown = rest;
					setLeft(rest);
				}
				if (bar.current) bar.current.style.width = `${Math.min(100, (elapsedRef.current / ADAPT_S) * 100)}%`;
				if (elapsedRef.current >= ADAPT_S) {
					phaseRef.current = 'test';
					setPhase('test');
				}
				dirtyRef.current = true;
			} else shown = ADAPT_S;
			if (dirtyRef.current) {
				draw();
				dirtyRef.current = false;
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, []);

	const start = () => {
		onPlay();
		go('adapt');
	};

	return (
		<>
			<div ref={wrap} className="ilmo-stage ilmo-square ilmo-bare">
				<canvas
					ref={cv}
					role="img"
					aria-label={phase === 'test' ? 'Un mur de briques immobile' : 'Une spirale noire et blanche'}
				/>
			</div>
			{phase === 'idle' && (
				<>
					<div className="ilmo-tabs" role="radiogroup" aria-label="Sens de la spirale">
						<button
							role="radio"
							aria-checked={outward}
							className={`ilmo-pill ${outward ? 'active' : ''}`}
							onClick={() => setOutward(true)}
						>
							Vers l'extérieur
						</button>
						<button
							role="radio"
							aria-checked={!outward}
							className={`ilmo-pill ${!outward ? 'active' : ''}`}
							onClick={() => setOutward(false)}
						>
							Vers l'intérieur
						</button>
					</div>
					<button className="ilmo-btn" onClick={start}>▶ Commencer ({ADAPT_S} s)</button>
				</>
			)}
			{phase === 'adapt' && (
				<>
					<p className="ilmo-count" aria-live="off">
						Fixe le point rouge… <strong>{left} s</strong>
					</p>
					<div className="ilmo-progress" aria-hidden="true">
						<span ref={bar} />
					</div>
					<button className="ilmo-act" onClick={() => go('idle')}>⏹ Arrêter</button>
				</>
			)}
			{phase === 'test' && (
				<>
					<p className="ilmo-reveal" aria-live="polite">
						Garde les yeux sur le point : ce mur immobile semble{' '}
						{outward ? 'rétrécir et s\'éloigner' : 'gonfler et venir vers toi'}… Regarde aussi le dos de ta main !
					</p>
					<button className="ilmo-btn" onClick={start}>↺ Recommencer</button>
				</>
			)}
		</>
	);
}

const INTRO: Record<Mode, string> = {
	wheels:
		"Rien ne bouge : c'est une image fixe. Promène ton regard dessus et les roues tournent dans le coin de ton œil. Fixe un seul point : elles s'arrêtent.",
	chaser:
		'Fixe la croix noire pendant 20 secondes sans bouger les yeux. Les points roses s\'effacent… et un point vert se met à tourner.',
	spiral:
		"Lance la spirale et fixe le point rouge pendant 30 secondes. Quand elle s'arrête, l'image suivante se met à bouger toute seule.",
};

const WHY: Record<Mode, string> = {
	wheels:
		"Ton œil n'est jamais parfaitement immobile. À chaque petit mouvement, ton cerveau traite les zones sombres et claires à des vitesses légèrement différentes : la suite noir → bleu → blanc → jaune trompe alors les détecteurs de mouvement de ta vision périphérique. Illusion d'Akiyoshi Kitaoka (2003).",
	chaser:
		"Deux effets s'additionnent. En fixant la croix, les taches floues disparaissent de ta vue : ton cerveau ignore ce qui ne change pas sur les côtés (effet Troxler). Et là où un point rose vient de s'éteindre, ta rétine fatiguée par le rose voit sa couleur complémentaire, le vert. Le trou tourne, le fantôme vert le suit. Illusion de Jeremy Hinton (2005).",
	spiral:
		"Pendant 30 secondes, les neurones qui détectent ce mouvement se fatiguent. Quand l'image s'immobilise, ceux qui détectent le mouvement inverse l'emportent un instant : l'image fixe glisse dans l'autre sens. C'est « l'effet de chute d'eau », décrit en 1834 par Robert Addams devant une cascade écossaise.",
};

export default function MotionGame({ gameId }: { gameId: string }) {
	const [mode, setMode] = useState<Mode>('wheels');
	const started = useRef(false);

	const onPlay = useCallback(() => {
		if (started.current) return;
		started.current = true;
		trackGame(gameId, 'game_started');
	}, [gameId]);

	return (
		<div className="ilmo-root">
			<style>{CSS}</style>
			<div className="ilmo-tabs" role="tablist" aria-label="Illusion">
				{MODES.map((m) => (
					<button
						key={m.id}
						role="tab"
						aria-selected={mode === m.id}
						className={`ilmo-pill ${mode === m.id ? 'active' : ''}`}
						onClick={() => {
							onPlay();
							setMode(m.id);
						}}
					>
						{m.label}
					</button>
				))}
			</div>

			<p className="ilmo-text">{INTRO[mode]}</p>

			{mode === 'wheels' && <Wheels />}
			{mode === 'chaser' && <Chaser onPlay={onPlay} />}
			{mode === 'spiral' && <Spiral onPlay={onPlay} />}

			<details className="ilmo-why" key={mode}>
				<summary>Pourquoi ça bouge ?</summary>
				<p>{WHY[mode]}</p>
			</details>
		</div>
	);
}

const CSS = `
.ilmo-root {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  container-type: inline-size;
  color: var(--gray-0);
  font-family: var(--font-body);
}
.ilmo-tabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.ilmo-pill {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ilmo-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.ilmo-text {
  margin: 0;
  max-width: 46ch;
  text-align: center;
  font-size: 14px;
  line-height: 1.5;
  color: var(--gray-200);
}
.ilmo-stage {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}
.ilmo-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ilmo-wheels { aspect-ratio: 2 / 3; }
@container (min-width: 480px) {
  .ilmo-wheels { aspect-ratio: 3 / 2; }
}
.ilmo-square { width: min(100%, 440px); aspect-ratio: 1 / 1; }
/* The spiral's white and black arms both melt into one of the two themes: a neutral rim keeps its edge. */
.ilmo-stage.ilmo-bare { border-radius: 50%; box-shadow: 0 0 0 3px var(--gray-500), var(--shadow-md); }
.ilmo-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.ilmo-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ilmo-act:hover { background: var(--gray-800); border-color: var(--accent-regular); color: var(--accent-regular); }
.ilmo-btn {
  border: none;
  background: var(--accent-regular);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  border-radius: 999px;
  padding: 10px 24px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.ilmo-count { margin: 0; font-size: 15px; color: var(--gray-200); font-variant-numeric: tabular-nums; }
.ilmo-count strong { color: var(--accent-regular); }
.ilmo-progress {
  width: min(100%, 320px);
  height: 6px;
  border-radius: 999px;
  background: var(--gray-800);
  overflow: hidden;
}
.ilmo-progress span { display: block; width: 0; height: 100%; background: var(--accent-regular); }
.ilmo-note, .ilmo-reveal {
  margin: 0;
  max-width: 44ch;
  text-align: center;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--gray-0);
  background: var(--accent-overlay);
  border: 1px solid var(--accent-regular);
  border-radius: 12px;
  padding: 8px 14px;
}
.ilmo-why {
  width: 100%;
  max-width: 46ch;
  box-sizing: border-box;
  border: 1px solid var(--gray-800);
  border-radius: 12px;
  background: var(--gray-999);
  padding: 8px 14px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--gray-200);
}
.ilmo-why summary { cursor: pointer; font-weight: 600; color: var(--gray-0); }
.ilmo-why p { margin: 0.5rem 0 0.2rem; }
@media (prefers-reduced-motion: reduce) {
  .ilmo-pill, .ilmo-act { transition: none; }
}
`;
