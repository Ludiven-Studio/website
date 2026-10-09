import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackGame } from '../../lib/analytics';
import { SCENES, FIX, VIEW_W, VIEW_H, complement, gray, type Scene } from './afterimage';

/* =====================================================
   COULEURS FANTÔMES — afterimage illusion (React island)
   Stare at the chroma-inverted scene, then the grey copy
   lights up in the true colours.
   ===================================================== */

type Phase = 'ready' | 'staring' | 'ghost' | 'truth';

const DURATIONS = [15, 20, 30];
const GHOST_HOLD_MS = 5000;
const RING_R = 9;
const RING_LEN = 2 * Math.PI * RING_R;

function SceneSvg({ scene, paint, children }: { scene: Scene; paint: (hex: string) => string; children?: ReactNode }) {
	return (
		<svg className="ilaf-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={scene.name}>
			{scene.shapes.map((s, i) => createElement(s.el, { key: i, ...s.a, fill: paint(s.fill) }))}
			{children}
		</svg>
	);
}

export default function AfterimageGame({ gameId }: { gameId: string }) {
	const [sceneIdx, setSceneIdx] = useState(0);
	const [duration, setDuration] = useState(20);
	const [phase, setPhase] = useState<Phase>('ready');
	const [offer, setOffer] = useState(false); // ghost phase: buttons shown once the afterimage had its time
	const [done, setDone] = useState<Set<string>>(() => new Set());
	const ringRef = useRef<SVGCircleElement>(null);
	const startedRef = useRef(false);
	const wonRef = useRef(false);

	const scene = SCENES[sceneIdx];
	const palette = useMemo(() => {
		const inv = new Map<string, string>();
		const grey = new Map<string, string>();
		for (const s of scene.shapes) {
			if (!inv.has(s.fill)) inv.set(s.fill, complement(s.fill));
			if (!grey.has(s.fill)) grey.set(s.fill, gray(s.fill));
		}
		return { inv, grey };
	}, [scene]);

	const paint = useCallback(
		(hex: string) =>
			phase === 'truth' ? hex : phase === 'ghost' ? palette.grey.get(hex)! : palette.inv.get(hex)!,
		[phase, palette],
	);

	const pickScene = (i: number) => {
		setSceneIdx(i);
		setPhase('ready');
		setOffer(false);
	};

	const start = () => {
		if (!startedRef.current) {
			startedRef.current = true;
			trackGame(gameId, 'game_started');
		}
		setOffer(false);
		setPhase('staring');
	};

	// Countdown ring. Ends with an instant swap to grey — a fade would let the afterimage fade too.
	useEffect(() => {
		if (phase !== 'staring') return;
		const t0 = performance.now();
		const total = duration * 1000;
		let raf = 0;
		const tick = (now: number) => {
			const k = Math.min(1, (now - t0) / total);
			ringRef.current?.setAttribute('stroke-dashoffset', String(RING_LEN * (1 - k)));
			if (k >= 1) {
				setPhase('ghost');
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		// Leaving the tab breaks the stare: start over rather than swap to grey unseen.
		const onHide = () => {
			if (document.hidden) setPhase('ready');
		};
		document.addEventListener('visibilitychange', onHide);
		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener('visibilitychange', onHide);
		};
	}, [phase, duration]);

	// The ✓ lands with the buttons, not at the swap: a pill growing above the scene could reflow
	// the row and move the image under a fixating eye.
	useEffect(() => {
		if (phase !== 'ghost') return;
		const id = setTimeout(() => {
			setOffer(true);
			setDone((prev) => (prev.has(scene.id) ? prev : new Set(prev).add(scene.id)));
		}, GHOST_HOLD_MS);
		return () => clearTimeout(id);
	}, [phase, scene.id]);

	useEffect(() => {
		if (wonRef.current || done.size < SCENES.length) return;
		wonRef.current = true;
		trackGame(gameId, 'game_won');
	}, [done, gameId]);

	const busy = phase === 'staring' || (phase === 'ghost' && !offer);
	const [fx, fy] = FIX;

	const status =
		phase === 'ready'
			? 'Fixe le point noir au centre de l’image, puis appuie sur Commencer.'
			: phase === 'staring'
				? 'Fixe le point… sans bouger les yeux.'
				: phase === 'ghost'
					? offer
						? 'Surprise : cette image est en noir et blanc. Les couleurs, c’est ton cerveau qui les a peintes !'
						: 'Garde les yeux sur le point… 👀'
					: `Les vraies couleurs. Pendant ${duration} s, tes yeux se sont lassés des couleurs inverses : sur le gris, ils ont vu leur opposé.`;

	return (
		<div className="ilaf-root">
			<style>{CSS}</style>

			{/* Controls stay mounted while staring: if they vanished, the image would jump and the
			    afterimage would land off target. */}
			<div className="ilaf-controls">
				<div className="ilaf-group" role="tablist" aria-label="Scène">
					{SCENES.map((s, i) => (
						<button
							key={s.id}
							role="tab"
							aria-selected={i === sceneIdx}
							className={`ilaf-pill ${i === sceneIdx ? 'active' : ''}`}
							onClick={() => pickScene(i)}
							disabled={busy}
						>
							{s.emoji} {s.name}
							{done.has(s.id) && <span className="ilaf-check" aria-label="vue"> ✓</span>}
						</button>
					))}
				</div>
				<div className="ilaf-group" role="tablist" aria-label="Durée">
					{DURATIONS.map((d) => (
						<button
							key={d}
							role="tab"
							aria-selected={d === duration}
							className={`ilaf-pill small ${d === duration ? 'active' : ''}`}
							onClick={() => setDuration(d)}
							disabled={busy}
						>
							{d} s
						</button>
					))}
				</div>
			</div>

			<div className="ilaf-stage" data-art>
				<SceneSvg scene={scene} paint={paint}>
					{phase !== 'truth' && (
						<g aria-hidden="true">
							{phase === 'staring' && (
								<circle
									ref={ringRef}
									cx={fx}
									cy={fy}
									r={RING_R}
									fill="none"
									stroke="rgba(0,0,0,0.55)"
									strokeWidth={1.4}
									strokeDasharray={RING_LEN}
									strokeDashoffset={RING_LEN}
									transform={`rotate(-90 ${fx} ${fy})`}
								/>
							)}
							<circle cx={fx} cy={fy} r={4.6} fill="#fff" />
							<circle cx={fx} cy={fy} r={2.6} fill="#000" />
						</g>
					)}
				</SceneSvg>
			</div>

			<div className="ilaf-panel">
				<p className="ilaf-status" aria-live="polite">{status}</p>
				<div className="ilaf-actions">
					{phase === 'ready' && (
						<button className="ilaf-btn primary" onClick={start}>▶ Commencer</button>
					)}
					{phase === 'staring' && (
						<button className="ilaf-btn" onClick={() => setPhase('ready')}>Arrêter</button>
					)}
					{((phase === 'ghost' && offer) || phase === 'truth') && (
						<>
							{phase === 'ghost' ? (
								<button className="ilaf-btn" onClick={() => setPhase('truth')}>🎨 Voir les vraies couleurs</button>
							) : (
								<button className="ilaf-btn" onClick={start}>↺ Rejouer</button>
							)}
							<button className="ilaf-btn primary" onClick={() => pickScene((sceneIdx + 1) % SCENES.length)}>
								Scène suivante →
							</button>
						</>
					)}
				</div>
			</div>

			<p className="ilaf-tips">
				💡 Monte la luminosité de ton écran, fixe le point sans bouger les yeux et cligne le moins
				possible. L’effet ne dure que quelques secondes : ouvre grand les yeux au moment du passage
				en gris !
			</p>
		</div>
	);
}

const CSS = `
.ilaf-root {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ilaf-controls {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 0.9rem;
}
.ilaf-group { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.ilaf-pill {
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
.ilaf-pill.small { font-size: 12px; padding: 4px 11px; }
.ilaf-pill.active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.ilaf-pill:disabled { cursor: default; opacity: 0.55; }
.ilaf-pill.active:disabled { opacity: 0.85; }
.ilaf-check { font-weight: 700; }

.ilaf-stage {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  background: #808080;
}
.ilaf-svg { display: block; width: 100%; height: 100%; }

.ilaf-panel {
  width: 100%;
  min-height: 7.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  margin-top: 0.9rem;
}
.ilaf-status {
  margin: 0;
  max-width: 44ch;
  text-align: center;
  font-size: 14px;
  line-height: 1.45;
  color: var(--gray-200);
}
.ilaf-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.ilaf-btn {
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--gray-100);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  border-radius: 999px;
  padding: 9px 18px;
  cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.ilaf-btn:hover { border-color: var(--accent-regular); color: var(--accent-regular); }
.ilaf-btn.primary {
  border-color: var(--accent-regular);
  background: var(--accent-regular);
  color: var(--accent-text-over);
}
.ilaf-btn.primary:hover { filter: brightness(1.06); color: var(--accent-text-over); }

.ilaf-tips {
  max-width: 46ch;
  margin: 0.4rem 0 0;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--gray-300);
}

/* Fullscreen: the scene takes the room left by the controls and the panel. */
.game-page.gf-full .ilaf-root { max-width: none; height: 100%; }
.game-page.gf-full .ilaf-stage { width: auto; max-width: 100%; flex: 1; min-height: 0; }
`;
