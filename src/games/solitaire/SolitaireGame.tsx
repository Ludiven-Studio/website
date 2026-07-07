import { useState, useEffect, useRef, useCallback } from 'react';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';
import {
	VARIANTS,
	createLayout,
	initialPegs,
	pegCount,
	isWin,
	isStuck,
	movesFrom,
	applyMove,
	hintMove,
	type Variant,
	type Layout,
	type Move,
} from './engine';

/* =====================================================
   SOLITAIRE À BILLES — peg solitaire island.
   Tap a marble then a hole two away (or drag it) to jump over a neighbour
   and remove it. Clear the board down to a single marble. Canvas board with
   marble sprites + a jump animation; pure engine in ./engine (tested).
   ===================================================== */

type Status = 'playing' | 'won' | 'stuck';
const ANIM_MS = 190;
const bestKey = (v: Variant): string => `ludiven-solitaire-best-${v}`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const marbleHue = (i: number): number => (i * 47 + 15) % 360;

interface Anim {
	move: Move;
	start: number;
}

export default function SolitaireGame({ gameId }: { gameId: string }) {
	const [variant, setVariant] = useState<Variant>('anglais');
	const [pegs, setPegs] = useState(32);
	const [moves, setMoves] = useState(0);
	const [status, setStatus] = useState<Status>('playing');
	const [best, setBest] = useState<number | null>(null);
	const { celebrating, showWin } = useCelebration(status === 'won');

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 420, h: 420 });
	const layoutRef = useRef<Layout>(createLayout('anglais'));
	const pegsRef = useRef<boolean[]>(initialPegs(layoutRef.current));
	const histRef = useRef<boolean[][]>([]);
	const selRef = useRef(-1);
	const dragRef = useRef(-1);
	const animRef = useRef<Anim | null>(null);
	const hintRef = useRef<{ move: Move; until: number } | null>(null);
	const clockRef = useRef(0);
	const rafRef = useRef(0);
	const statusRef = useRef<Status>('playing');

	/* ---------- Geometry ---------- */
	const geom = useCallback(() => {
		const { w, h } = dimRef.current;
		const L = layoutRef.current;
		const spanX = L.maxX - L.minX;
		const spanY = L.maxY - L.minY;
		const cell = Math.min(w / (spanX + 1.5), h / (spanY + 1.5));
		const ox = (w - spanX * cell) / 2;
		const oy = (h - spanY * cell) / 2;
		return { cell, ox, oy, L };
	}, []);
	const pixelOf = useCallback(
		(id: number): { px: number; py: number } => {
			const { cell, ox, oy, L } = geom();
			const hole = L.holes[id];
			return { px: ox + (hole.x - L.minX) * cell, py: oy + (hole.y - L.minY) * cell };
		},
		[geom],
	);
	const hitTest = useCallback(
		(x: number, y: number): number => {
			const { cell, ox, oy, L } = geom();
			let best = -1;
			let bestD = (cell * 0.55) ** 2;
			L.holes.forEach((hole, id) => {
				const px = ox + (hole.x - L.minX) * cell;
				const py = oy + (hole.y - L.minY) * cell;
				const d = (px - x) ** 2 + (py - y) ** 2;
				if (d < bestD) {
					bestD = d;
					best = id;
				}
			});
			return best;
		},
		[geom],
	);

	/* ---------- State sync ---------- */
	const syncEnd = useCallback(
		(next: boolean[]): void => {
			const count = pegCount(next);
			setPegs(count);
			if (isWin(next)) {
				statusRef.current = 'won';
				setStatus('won');
				trackGame(gameId, 'game_over', { score: 1, win: true });
			} else if (isStuck(layoutRef.current, next)) {
				statusRef.current = 'stuck';
				setStatus('stuck');
				trackGame(gameId, 'game_over', { score: count, win: false });
			}
			if (isWin(next) || isStuck(layoutRef.current, next)) {
				setBest((prev) => {
					const nb = prev == null ? count : Math.min(prev, count);
					try {
						localStorage.setItem(bestKey(layoutRef.current.variant), String(nb));
					} catch {
						/* ignore */
					}
					return nb;
				});
			}
		},
		[gameId],
	);

	const doMove = useCallback(
		(m: Move): void => {
			histRef.current.push(pegsRef.current);
			pegsRef.current = applyMove(pegsRef.current, m);
			animRef.current = { move: m, start: clockRef.current };
			selRef.current = -1;
			hintRef.current = null;
			setMoves((n) => n + 1);
			syncEnd(pegsRef.current);
		},
		[syncEnd],
	);

	const reset = useCallback(
		(v: Variant): void => {
			layoutRef.current = createLayout(v);
			pegsRef.current = initialPegs(layoutRef.current);
			histRef.current = [];
			selRef.current = -1;
			dragRef.current = -1;
			animRef.current = null;
			hintRef.current = null;
			statusRef.current = 'playing';
			setStatus('playing');
			setMoves(0);
			setPegs(pegCount(pegsRef.current));
			let b: number | null = null;
			try {
				const raw = localStorage.getItem(bestKey(v));
				if (raw != null) b = Number(raw);
			} catch {
				/* ignore */
			}
			setBest(b);
			trackGame(gameId, 'game_started', { variant: v });
		},
		[gameId],
	);

	const pickVariant = (v: Variant): void => {
		setVariant(v);
		reset(v);
	};
	const undo = (): void => {
		const prev = histRef.current.pop();
		if (!prev) return;
		pegsRef.current = prev;
		animRef.current = null;
		selRef.current = -1;
		hintRef.current = null;
		statusRef.current = 'playing';
		setStatus('playing');
		setMoves((n) => Math.max(0, n - 1));
		setPegs(pegCount(prev));
	};
	const restart = (): void => reset(layoutRef.current.variant);
	const hint = (): void => {
		if (statusRef.current !== 'playing' || animRef.current) return;
		const m = hintMove(layoutRef.current, pegsRef.current);
		if (m) {
			hintRef.current = { move: m, until: clockRef.current + 2200 };
			selRef.current = m.from;
		}
	};

	/* ---------- Pointer ---------- */
	const posFrom = (e: React.PointerEvent): { x: number; y: number } => {
		const cv = canvasRef.current!;
		const rect = cv.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (dimRef.current.w / rect.width),
			y: (e.clientY - rect.top) * (dimRef.current.h / rect.height),
		};
	};
	const validTarget = (from: number, hole: number): Move | undefined =>
		movesFrom(layoutRef.current, pegsRef.current, from).find((m) => m.to === hole);

	const onDown = (e: React.PointerEvent): void => {
		if (statusRef.current !== 'playing' || animRef.current) return;
		const p = posFrom(e);
		const hole = hitTest(p.x, p.y);
		if (hole < 0) {
			selRef.current = -1;
			return;
		}
		const pegs = pegsRef.current;
		if (pegs[hole] && movesFrom(layoutRef.current, pegs, hole).length > 0) {
			selRef.current = hole;
			dragRef.current = hole;
			canvasRef.current?.setPointerCapture(e.pointerId);
		} else if (selRef.current >= 0) {
			const m = validTarget(selRef.current, hole);
			if (m) doMove(m);
			else selRef.current = -1;
		}
	};
	const onUp = (e: React.PointerEvent): void => {
		const from = dragRef.current;
		dragRef.current = -1;
		if (from < 0 || animRef.current) return;
		const p = posFrom(e);
		const hole = hitTest(p.x, p.y);
		if (hole >= 0 && hole !== from) {
			const m = validTarget(from, hole);
			if (m) doMove(m);
		}
	};

	/* ---------- Loop + sizing ---------- */
	useEffect(() => {
		reset('anglais');
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const w = clamp(wrap.clientWidth, 240, 440);
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h: w };
			cv.style.height = `${w}px`;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(w * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		let last = performance.now();
		const frame = (now: number): void => {
			clockRef.current += Math.min(now - last, 100);
			last = now;
			if (animRef.current && clockRef.current - animRef.current.start >= ANIM_MS) animRef.current = null;
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(rafRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---------- Draw ---------- */
	const drawMarble = (ctx: CanvasRenderingContext2D, px: number, py: number, r: number, id: number, alpha = 1): void => {
		const hue = marbleHue(id);
		const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.1, px, py, r);
		g.addColorStop(0, `hsla(${hue}, 90%, 82%, ${alpha})`);
		g.addColorStop(0.55, `hsla(${hue}, 70%, 58%, ${alpha})`);
		g.addColorStop(1, `hsla(${hue}, 65%, 38%, ${alpha})`);
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(px, py, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = `rgba(255,255,255,${0.75 * alpha})`;
		ctx.beginPath();
		ctx.ellipse(px - r * 0.32, py - r * 0.38, r * 0.26, r * 0.18, -0.5, 0, Math.PI * 2);
		ctx.fill();
	};

	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const { w, h } = dimRef.current;
		const { cell, L } = geom();
		const R = cell * 0.42;
		const pr = cell * 0.36;
		const pegs = pegsRef.current;
		const now = clockRef.current;
		const anim = animRef.current;
		const hintOn = hintRef.current && now < hintRef.current.until ? hintRef.current.move : null;

		ctx.clearRect(0, 0, w, h);

		// Board panel
		ctx.fillStyle = '#3b2a1c';
		panelPath(ctx, w, h, cell * 0.7);
		ctx.fill();

		// Holes (recessed)
		L.holes.forEach((_, id) => {
			const { px, py } = pixelOf(id);
			ctx.fillStyle = 'rgba(0,0,0,0.5)';
			ctx.beginPath();
			ctx.arc(px, py, R, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#2a1d12';
			ctx.beginPath();
			ctx.arc(px, py + R * 0.08, R * 0.82, 0, Math.PI * 2);
			ctx.fill();
			if (L.center === id) {
				ctx.strokeStyle = 'rgba(255,220,140,0.35)';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(px, py, R * 0.5, 0, Math.PI * 2);
				ctx.stroke();
			}
		});

		// Valid-target rings for the selected marble
		if (selRef.current >= 0 && !anim) {
			for (const m of movesFrom(L, pegs, selRef.current)) {
				const { px, py } = pixelOf(m.to);
				const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 260));
				ctx.strokeStyle = `rgba(120,200,120,${0.5 + 0.4 * pulse})`;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.arc(px, py, R * 0.7, 0, Math.PI * 2);
				ctx.stroke();
			}
		}

		// Hint ring on the target
		if (hintOn) {
			const { px, py } = pixelOf(hintOn.to);
			const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 200));
			ctx.strokeStyle = `rgba(255,209,102,${0.55 + 0.4 * pulse})`;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(px, py, R * 0.78, 0, Math.PI * 2);
			ctx.stroke();
		}

		// Marbles
		const t = anim ? clamp((now - anim.start) / ANIM_MS, 0, 1) : 1;
		L.holes.forEach((_, id) => {
			if (!pegs[id]) return;
			if (anim && id === anim.move.to) return; // drawn as the jumper below
			const { px, py } = pixelOf(id);
			const sel = id === selRef.current;
			if (sel) {
				ctx.strokeStyle = 'rgba(255,255,255,0.9)';
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.arc(px, py - 2, pr + 3, 0, Math.PI * 2);
				ctx.stroke();
			}
			drawMarble(ctx, px, py - (sel ? 2 : 0), pr, id);
		});

		// Jump animation: jumper arcs from → to, captured marble pops
		if (anim) {
			const a = pixelOf(anim.move.from);
			const b = pixelOf(anim.move.to);
			const px = a.px + (b.px - a.px) * t;
			const py = a.py + (b.py - a.py) * t - Math.sin(t * Math.PI) * cell * 0.5;
			const capP = pixelOf(anim.move.over);
			const cs = 1 - t;
			if (cs > 0.02) drawMarble(ctx, capP.px, capP.py, pr * cs, anim.move.over, cs);
			drawMarble(ctx, px, py, pr, anim.move.to);
		}
	};

	const layout = layoutRef.current;
	const perfect = status === 'won' && (layout.center < 0 || pegsRef.current[layout.center]);

	return (
		<div className="sol-root">
			<style>{CSS}</style>

			<div className="sol-variants" role="tablist" aria-label="Plateau">
				{VARIANTS.map((v) => (
					<button key={v.key} role="tab" aria-selected={variant === v.key} className={`sol-pill ${variant === v.key ? 'active' : ''}`} onClick={() => pickVariant(v.key)}>
						{v.label}
					</button>
				))}
			</div>

			<div className="sol-hud">
				<span className="sol-stat">
					Billes <strong>{pegs}</strong>
				</span>
				<span className="sol-stat">
					Coups <strong>{moves}</strong>
				</span>
				<span className="sol-stat">
					Record <strong>{best ?? '—'}</strong>
				</span>
			</div>

			<div className="sol-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className="sol-canvas" onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} />

				{celebrating && <Celebration />}
				{showWin && (
					<div className="sol-overlay">
						<div className="sol-card">
							<h3>{perfect ? '🏆 Parfait !' : '🎉 Gagné !'}</h3>
							<p>{perfect ? 'Une seule bille, pile au centre. Chapeau !' : 'Il ne reste qu’une seule bille. Bravo !'}</p>
							<button className="sol-btn primary" onClick={restart}>
								↻ Rejouer
							</button>
						</div>
					</div>
				)}
				{status === 'stuck' && (
					<div className="sol-overlay">
						<div className="sol-card">
							<h3>Plus de coups possibles</h3>
							<p>
								Il reste <strong>{pegs}</strong> billes. Annule pour retenter, ou recommence.
							</p>
							<div className="sol-cardbtns">
								<button className="sol-btn" onClick={undo}>
									↶ Annuler
								</button>
								<button className="sol-btn primary" onClick={restart}>
									↻ Recommencer
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			<div className="sol-controls">
				<button className="sol-btn" onClick={undo} disabled={moves === 0}>
					↶ Annuler
				</button>
				<button className="sol-btn" onClick={hint} disabled={status !== 'playing'}>
					💡 Indice
				</button>
				<button className="sol-btn" onClick={restart}>
					↻ Recommencer
				</button>
			</div>

			<p className="sol-help">
				Tape une bille puis un trou situé deux cases plus loin (ou fais-la glisser) pour sauter par-dessus une voisine et la retirer. Objectif&nbsp;: n’en laisser qu’une — au centre pour la croix.
			</p>
		</div>
	);
}

/** Trace the rounded board panel path (caller fills). */
function panelPath(ctx: CanvasRenderingContext2D, w: number, h: number, pad: number): void {
	const x = pad * 0.4;
	const y = pad * 0.4;
	const rw = w - pad * 0.8;
	const rh = h - pad * 0.8;
	const rad = 18;
	ctx.beginPath();
	ctx.moveTo(x + rad, y);
	ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
	ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
	ctx.arcTo(x, y + rh, x, y, rad);
	ctx.arcTo(x, y, x + rw, y, rad);
	ctx.closePath();
}

const CSS = `
.sol-root { --sol: var(--accent-regular); width: 100%; max-width: 480px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.sol-variants { display: flex; gap: 6px; margin-bottom: 0.55rem; }
.sol-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 16px; cursor: pointer; }
.sol-pill.active { background: var(--sol); color: var(--accent-text-over); border-color: var(--sol); }
.sol-hud { display: flex; gap: 0.5rem; font-size: 14px; font-weight: 600; margin-bottom: 0.6rem; }
.sol-stat { background: var(--gray-900); border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.sol-stat strong { margin-left: 4px; color: var(--sol); }
.sol-playwrap { position: relative; width: 100%; max-width: 440px; display: flex; justify-content: center; }
.sol-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 16px; box-shadow: var(--shadow-md); cursor: pointer; }
.sol-overlay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(3px); border-radius: 16px; }
.sol-card { background: var(--gray-999); border: 2px solid var(--sol); border-radius: 16px; padding: 18px 22px; max-width: 18rem; text-align: center; box-shadow: var(--shadow-lg); }
.sol-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.sol-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.5; margin: 0 0 0.9rem; }
.sol-cardbtns { display: flex; gap: 8px; justify-content: center; }
.sol-controls { display: flex; gap: 8px; margin-top: 0.8rem; flex-wrap: wrap; justify-content: center; }
.sol-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
.sol-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sol-btn.primary { background: var(--sol); color: var(--accent-text-over); border-color: var(--sol); }
.sol-help { max-width: 440px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
