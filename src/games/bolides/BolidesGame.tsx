import { useState, useEffect, useRef, useCallback } from 'react';
import { createGame, resetGame, stepGame, pct, NAMES, PALETTE, DIFFS, type GameState } from './engine';
import { createRenderer, type Renderer } from './render3d';
import { usePointerDrag } from '../usePointerDrag';
import { trackGame } from '../../lib/analytics';
import { getDaily, saveDailyRun, loadDailyRun, dailyWeekdayLabel } from '../../lib/leaderboard';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   BOLIDES — React shell. Owns the fixed-step loop and the HUD; the simulation
   (engine.ts) and the 3D (render3d.ts) run outside React state so per-frame car
   moves never trigger a rerender. Loop: sortir -> tracer -> reboucler -> capturer;
   couper une trace ennemie = kill; se faire couper = mort -> Rejouer instantané.
   Défi du jour = arène + bots déterministes (seed partagé) ; score = meilleur %.
   ===================================================== */

type Phase = 'menu' | 'playing' | 'dead';
type Mode = 'libre' | 'defi';
interface DailyState { best: number; tries: number }
const STEP = 1000 / 60;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const toTenths = (p: number) => Math.round(p * 10); // % -> stored tenths of a percent
const fmtPct = (v: number) => formatScore(DAILY_LB.bolides.fmt, v);

interface Row { id: number; name: string; pct: number; me: boolean }

export default function BolidesGame({ gameId }: { gameId: string }) {
	const [phase, setPhase] = useState<Phase>('menu');
	const [mode, setMode] = useState<Mode>('defi');
	const [board, setBoard] = useState<Row[]>([]);
	const [webglError, setWebglError] = useState(false);
	const [status, setStatus] = useState('');
	const [attempt, setAttempt] = useState(0); // remounts the Leaderboard so a replay retries its submit
	const [submitVal, setSubmitVal] = useState<number | undefined>(undefined);
	const [result, setResult] = useState({ pct: 0, best: 0, rank: 0, diff: 1 });

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const joyBaseRef = useRef<HTMLDivElement>(null);
	const joyKnobRef = useRef<HTMLDivElement>(null);
	const stateRef = useRef<GameState>(createGame());
	const rendererRef = useRef<Renderer | null>(null);
	const keysRef = useRef({ left: false, right: false, up: false, down: false });
	const dragRef = useRef({ active: false, steer: 0, throttle: 0, ox: 0, oy: 0 });
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const hudAccRef = useRef(0);
	const runningRef = useRef(false);
	const bestPctRef = useRef(0); // peak % during the current run
	const dailyBestRef = useRef(0); // best % across today's attempts
	const modeRef = useRef<Mode>('defi');

	const syncBoard = useCallback(() => {
		const s = stateRef.current;
		const rows: Row[] = s.cars.map((c) => ({ id: c.id, name: NAMES[c.id], pct: pct(s, c.id), me: !c.isBot }));
		rows.sort((a, b) => b.pct - a.pct);
		setBoard(rows);
	}, []);

	const ensureRenderer = useCallback(() => {
		if (rendererRef.current) return true;
		if (!canvasRef.current) return false;
		const r = createRenderer(canvasRef.current, stateRef.current);
		if (!r) { setWebglError(true); return false; }
		rendererRef.current = r;
		return true;
	}, []);

	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const endGame = useCallback(() => {
		const s = stateRef.current;
		stop();
		const peak = Math.max(pct(s, 1), bestPctRef.current);
		const rank = 1 + s.cars.filter((c) => c.id !== 1 && pct(s, c.id) > pct(s, 1)).length;
		if (modeRef.current === 'defi') {
			const prev = loadDailyRun(gameId);
			const prevState = (prev?.state as DailyState | undefined) ?? { best: 0, tries: 0 };
			const best = Math.max(dailyBestRef.current, peak);
			dailyBestRef.current = best;
			saveDailyRun(gameId, {
				startedAt: prev?.startedAt ?? Date.now(),
				done: true,
				seed: s.seed,
				diffIndex: s.diff,
				state: { best, tries: (prevState.tries ?? 0) + 1 },
			});
			setSubmitVal(toTenths(best));
			setAttempt((a) => a + 1);
			setResult({ pct: peak, best, rank, diff: s.diff });
		} else {
			setResult({ pct: peak, best: peak, rank, diff: s.diff });
		}
		setPhase('dead');
		trackGame(gameId, 'game_over', { mode: modeRef.current === 'defi' ? 'daily' : 'free' });
	}, [stop, gameId]);

	const frame = useCallback((now: number) => {
		if (!runningRef.current) return;
		const s = stateRef.current;
		const r = rendererRef.current;
		const dt = Math.min(now - lastRef.current, 200);
		lastRef.current = now;
		accRef.current += dt;
		const k = keysRef.current, d = dragRef.current;
		const steer = d.active ? d.steer : (k.right ? 1 : 0) - (k.left ? 1 : 0);
		const throttle = d.active ? d.throttle : (k.up ? 1 : 0) - (k.down ? 1 : 0);
		while (runningRef.current && accRef.current >= STEP) {
			accRef.current -= STEP;
			stepGame(s, steer, throttle, STEP / 1000);
		}
		const alpha = Math.min(1, accRef.current / STEP);
		if (r) r.frame(s, alpha, dt / 1000);
		s.events.length = 0; // consumed by the renderer (FX) this frame

		bestPctRef.current = Math.max(bestPctRef.current, pct(s, 1));
		hudAccRef.current += dt;
		if (hudAccRef.current >= 140) { hudAccRef.current = 0; syncBoard(); }

		if (!s.cars[0].alive) { endGame(); return; }
		rafRef.current = requestAnimationFrame(frame);
	}, [syncBoard, endGame]);

	const run = useCallback(() => {
		runningRef.current = true;
		lastRef.current = performance.now();
		accRef.current = 0;
		hudAccRef.current = 0;
		bestPctRef.current = 0;
		rafRef.current = requestAnimationFrame(frame);
	}, [frame]);

	/** Start a run for the given seed/diff and go live. */
	const launch = useCallback((seed: number, diff: number) => {
		const s = stateRef.current;
		resetGame(s, seed, diff);
		rendererRef.current?.reset();
		rendererRef.current?.resize();
		setSubmitVal(undefined);
		syncBoard();
		setPhase('playing');
		run();
	}, [run, syncBoard]);

	const play = useCallback(async () => {
		if (!ensureRenderer()) return;
		modeRef.current = mode;
		if (mode === 'libre') {
			dailyBestRef.current = 0;
			launch((Math.random() * 2 ** 31) >>> 0, 1);
			trackGame(gameId, 'game_started', { mode: 'free' });
			return;
		}
		// Défi du jour: reuse today's saved seed if already started, else fetch the shared one.
		setStatus('Chargement du défi…');
		const prev = loadDailyRun(gameId);
		let seed: number, diff: number;
		if (prev && prev.seed != null) {
			seed = prev.seed;
			diff = prev.diffIndex ?? 1;
			dailyBestRef.current = (prev.state as DailyState | undefined)?.best ?? 0;
		} else {
			const d = await getDaily(gameId);
			seed = d.seed;
			diff = d.diffIndex;
			dailyBestRef.current = 0;
		}
		setStatus('');
		launch(seed, diff);
		trackGame(gameId, 'game_started', { mode: 'daily' });
	}, [ensureRenderer, mode, launch, gameId]);

	const backToMenu = useCallback(() => { stop(); setPhase('menu'); }, [stop]);
	const switchMode = useCallback((m: Mode) => { stop(); setMode(m); setPhase('menu'); }, [stop]);

	/* Show the arena as a still preview behind the menu; wire resize + cleanup. */
	useEffect(() => {
		if (ensureRenderer()) {
			rendererRef.current!.resize();
			rendererRef.current!.frame(stateRef.current, 1, 0);
		}
		const onResize = () => rendererRef.current?.resize();
		const onFs = () => requestAnimationFrame(() => rendererRef.current?.resize());
		window.addEventListener('resize', onResize);
		document.addEventListener('fullscreenchange', onFs);
		return () => {
			window.removeEventListener('resize', onResize);
			document.removeEventListener('fullscreenchange', onFs);
			stop();
			rendererRef.current?.dispose();
			rendererRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Keyboard: steer (left/right) + throttle/brake (up/down). */
	useEffect(() => {
		const NAV = new Set([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
		const set = (key: string, down: boolean): boolean => {
			const r = keysRef.current;
			if (key === 'ArrowLeft' || key === 'a' || key === 'q') return ((r.left = down), true);
			if (key === 'ArrowRight' || key === 'd') return ((r.right = down), true);
			if (key === 'ArrowUp' || key === 'w' || key === 'z') return ((r.up = down), true);
			if (key === 'ArrowDown' || key === 's') return ((r.down = down), true);
			return false;
		};
		const onDown = (e: KeyboardEvent) => {
			const used = set(e.key, true);
			if (used || (runningRef.current && NAV.has(e.key))) e.preventDefault();
		};
		const onUp = (e: KeyboardEvent) => { set(e.key, false); };
		window.addEventListener('keydown', onDown, { passive: false });
		window.addEventListener('keyup', onUp);
		return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
	}, []);

	/* Touch/mouse: a relative joystick where the finger lands — up/down = throttle/brake,
	   left/right = steer. Positioned via refs so dragging never rerenders React. */
	const JOY_R = 62; // px radius for full deflection
	const positionJoy = (cx: number, cy: number, dx: number, dy: number) => {
		const rect = boardRef.current?.getBoundingClientRect();
		if (!rect) return;
		const base = joyBaseRef.current, knob = joyKnobRef.current;
		if (base) { base.style.left = `${cx - rect.left}px`; base.style.top = `${cy - rect.top}px`; }
		if (knob) {
			const cl = (v: number) => Math.max(-JOY_R, Math.min(JOY_R, v));
			knob.style.left = `${cx - rect.left + cl(dx)}px`;
			knob.style.top = `${cy - rect.top + cl(dy)}px`;
		}
	};
	const drag = usePointerDrag(
		(cx, cy) => {
			if (!runningRef.current) return; // only while a run is live
			const d = dragRef.current;
			d.active = true; d.ox = cx; d.oy = cy; d.steer = 0; d.throttle = 0;
			if (joyBaseRef.current) joyBaseRef.current.style.display = 'block';
			if (joyKnobRef.current) joyKnobRef.current.style.display = 'block';
			positionJoy(cx, cy, 0, 0);
		},
		(cx, cy) => {
			const d = dragRef.current;
			if (!d.active) return;
			const dx = cx - d.ox, dy = cy - d.oy;
			d.steer = Math.max(-1, Math.min(1, dx / JOY_R));
			d.throttle = Math.max(-1, Math.min(1, -dy / JOY_R)); // up = accelerate
			positionJoy(d.ox, d.oy, dx, dy);
		},
		() => {
			const d = dragRef.current;
			d.active = false; d.steer = 0; d.throttle = 0;
			if (joyBaseRef.current) joyBaseRef.current.style.display = 'none';
			if (joyKnobRef.current) joyKnobRef.current.style.display = 'none';
		},
	);

	return (
		<div className="bo-root">
			<style>{CSS}</style>

			<ModeToggle daily={mode === 'defi'} onFree={() => switchMode('libre')} onDaily={() => switchMode('defi')} />

			<div className="bo-boardwrap" ref={boardRef}>
				<canvas ref={canvasRef} className="bo-canvas" role="img" aria-label="Bolides" onPointerDown={drag.onPointerDown} />

				{/* Relative drag joystick (shown at the finger while dragging). */}
				<div ref={joyBaseRef} className="bo-joy-base" />
				<div ref={joyKnobRef} className="bo-joy-knob" />

				{phase === 'playing' && (
					<ol className="bo-leaderboard">
						{board.map((r) => (
							<li key={r.id} className={r.me ? 'me' : ''}>
								<span className="bo-dot" style={{ background: hex(PALETTE[r.id]) }} />
								{r.name} · {r.pct.toFixed(1)}%
							</li>
						))}
					</ol>
				)}

				{webglError && <div className="bo-overlay"><div className="bo-card">3D indisponible (WebGL manquant).</div></div>}

				{phase === 'menu' && !webglError && (
					<div className="bo-overlay">
						<div className="bo-card">
							<h2>Bolides</h2>
							<p className="bo-sub">
								Sors de ta zone, trace une boucle et reviens chez toi pour <strong>capturer</strong> le terrain.
								Plus la boucle est grande, plus tu gagnes — mais ta trace est vulnérable : si un rival la coupe, tu exploses.
								Coupe la leur pour les éliminer.
							</p>
							<p className="bo-modehint">
								{mode === 'defi'
									? `Arène du jour · ${dailyWeekdayLabel()} · même setup pour tous · classement partagé`
									: 'Arène aléatoire · score local'}
							</p>
							<button className="bo-play" onClick={play}>▶ Jouer</button>
							{status && <p className="bo-hint">{status}</p>}
							<p className="bo-hint">Glisse le doigt : haut/bas = accélérer/freiner, gauche/droite = tourner. Clavier : flèches ou ZQSD.</p>
						</div>
					</div>
				)}

				{phase === 'dead' && (
					<div className="bo-overlay">
						<div className="bo-card">
							<h2>Éliminé</h2>
							<p className="bo-score">
								{result.pct.toFixed(1)}%
								<span>de terrain · {result.rank}<sup>{result.rank === 1 ? 'er' : 'e'}</sup> sur {board.length || 4}</span>
							</p>
							{mode === 'defi' && (
								<p className="bo-best">Meilleur du jour : <strong>{fmtPct(toTenths(result.best))}</strong> · {DIFFS[result.diff]?.label}</p>
							)}
							<button className="bo-play" onClick={play}>↺ Rejouer</button>
						</div>
					</div>
				)}
			</div>

			{phase === 'playing' && (
				<div className="bo-actions">
					<button className="bo-restart" onClick={play}>↺ Recommencer</button>
					<button className="bo-quit" onClick={backToMenu}>Quitter</button>
				</div>
			)}

			{mode === 'defi' && (
				<Leaderboard
					key={`lb-${gameId}-${attempt}`}
					game={gameId}
					metric="score"
					submitValue={phase === 'dead' ? submitVal : undefined}
					format={fmtPct}
				/>
			)}

			<p className="bo-help">
				<strong>Glisse le doigt</strong> sur l'écran : haut/bas pour accélérer ou freiner, gauche/droite pour tourner
				(au clavier&nbsp;: flèches ou ZQSD). Le but&nbsp;: contrôler le plus grand pourcentage de l'arène. Sors, boucle,
				reviens → capture. Ne laisse personne couper ta trace ; coupe la leur.
				{mode === 'defi' && ' Le défi du jour partage la même arène et le même classement pour tout le monde.'}
			</p>
		</div>
	);
}

const CSS = `
.bo-root { --bo-accent: var(--accent-regular); width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); }
.bo-boardwrap { position: relative; width: 100%; aspect-ratio: 16 / 10; margin-inline: auto; }
.bo-canvas {
  width: 100%; height: 100%; display: block; background: #0b0e14;
  border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
.game-page.gf-full .bo-root { max-width: none; width: 100%; height: 100%; display: flex; flex-direction: column; }
.game-page.gf-full .bo-boardwrap { flex: 1; min-height: 0; aspect-ratio: auto; }
.game-page.gf-full .bo-canvas { border-radius: 0; border: none; }
.game-page.gf-full .bo-help { display: none; }
.bo-leaderboard {
  position: absolute; top: 8px; right: 8px; margin: 0; padding: 8px 12px; list-style: none;
  background: rgba(0,0,0,0.55); color: #fff; border-radius: 10px; font-size: 12.5px; font-weight: 700;
  font-variant-numeric: tabular-nums; display: flex; flex-direction: column; gap: 3px;
}
.bo-leaderboard li { display: flex; align-items: center; gap: 6px; }
.bo-leaderboard li.me { color: #ffe27a; }
.bo-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.bo-joy-base, .bo-joy-knob { position: absolute; display: none; border-radius: 50%; pointer-events: none; transform: translate(-50%, -50%); z-index: 3; }
.bo-joy-base { width: 124px; height: 124px; background: rgba(255,255,255,0.10); border: 2px solid rgba(255,255,255,0.25); }
.bo-joy-knob { width: 56px; height: 56px; background: rgba(255,255,255,0.35); border: 2px solid rgba(255,255,255,0.55); }
.bo-actions { display: flex; gap: 10px; justify-content: center; margin-top: 0.7rem; }
.bo-restart, .bo-quit { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 8px 18px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.bo-restart { background: var(--bo-accent); color: var(--accent-text-over); border-color: transparent; }
.bo-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(6,8,16,0.5); backdrop-filter: blur(2px); border-radius: 12px; }
.bo-card { background: var(--gray-999); border: 2px solid var(--bo-accent); border-radius: 18px; padding: 22px 26px; text-align: center; box-shadow: var(--shadow-lg); max-width: 360px; }
.bo-card h2 { font-family: var(--font-brand); font-weight: 600; font-size: 26px; margin: 0 0 8px; }
.bo-sub { color: var(--gray-300); font-size: 13px; margin: 0 0 12px; line-height: 1.55; }
.bo-modehint { color: var(--gray-300); font-size: 11.5px; margin: 0 0 14px; }
.bo-play { border: none; background: var(--bo-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 16px; border-radius: 999px; padding: 12px 30px; cursor: pointer; }
.bo-hint { color: var(--gray-300); font-size: 11.5px; margin: 12px 0 0; }
.bo-score { font-size: 30px; font-weight: 800; margin: 4px 0 10px; color: var(--bo-accent); font-variant-numeric: tabular-nums; }
.bo-score span { display: block; font-size: 13px; font-weight: 600; color: var(--gray-300); margin-top: 2px; }
.bo-score sup { font-size: 0.6em; }
.bo-best { color: var(--gray-300); font-size: 13px; margin: 0 0 16px; }
.bo-best strong { color: var(--gray-0); }
.bo-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin: 1rem auto 0; }
`;
