import { useState, useEffect, useRef, useCallback } from 'react';
import {
	LANES,
	COLS,
	TOWER,
	TOWER_ORDER,
	DIFFS,
	DIFF_ORDER,
	createGame,
	placeTower,
	step,
	type State,
	type TowerType,
	type Tower,
	type Fox,
	type DiffKey,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   COCOTTES VS RENARDS — real-time lane tower-defense island.
   Canvas drawn in CELL units (0..COLS × 0..LANES) via a scaled transform.
   Fixed-timestep rAF loop; pure engine in ./engine (seeded, tested).
   Libre : survie sans fin, record local. Défi du jour : vagues seedées, 3 essais.
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
type Selected = TowerType | 'shovel' | null;
const MAX_TRIES = 3;
const STEP = 1000 / 60;
const bestKey = (key: DiffKey): string => `ludiven-cocottes-best-${key}`;

interface DailyState {
	best: number;
	tries: number;
}

const CARD: Record<TowerType, { emoji: string; short: string }> = {
	pondeuse: { emoji: '🥚', short: 'Pondeuse' },
	lanceuse: { emoji: '🐔', short: 'Lanceuse' },
	costaude: { emoji: '🌾', short: 'Costaude' },
	mitrailleuse: { emoji: '🐓', short: 'Mitrailleuse' },
	piment: { emoji: '🌶️', short: 'Coq piment' },
};

export default function CocottesRenardsGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [hud, setHud] = useState<{ grain: number; cd: Partial<Record<TowerType, number>> }>({ grain: 0, cd: {} });
	const [selected, setSelected] = useState<Selected>(null);
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [tries, setTries] = useState(0);
	const [attempt, setAttempt] = useState(0);
	const [megaAlert, setMegaAlert] = useState(false);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const stateRef = useRef<State | null>(null);
	const rngRef = useRef<() => number>(() => 0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const runningRef = useRef(false);
	const scaleRef = useRef(1);
	const startRef = useRef(0);
	const hudTickRef = useRef(0);
	// Mirrors for listeners / pointer handlers.
	const statusRef = useRef<Status>('ready');
	const selectedRef = useRef<Selected>(null);
	const hoverRef = useRef<{ row: number; col: number } | null>(null);
	const megaAlertRef = useRef(false);
	const dailyRef = useRef(false);
	const triesRef = useRef(0);
	const seedRef = useRef(0);
	const diffIdxRef = useRef(1);

	const setStat = (v: Status): void => {
		statusRef.current = v;
		setStatus(v);
	};
	const selectCard = (v: Selected): void => {
		selectedRef.current = v;
		setSelected(v);
	};

	/* ---------- Rendering (cell units) ---------- */
	const draw = useCallback(() => {
		const cv = canvasRef.current;
		const st = stateRef.current;
		if (!cv || !st) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, COLS, LANES);

		// Lanes.
		for (let r = 0; r < LANES; r++) {
			ctx.fillStyle = r % 2 === 0 ? '#8fce5f' : '#82c455';
			ctx.fillRect(0, r, COLS, 1);
		}
		// Henhouse fence (left edge).
		ctx.fillStyle = '#8a5a2b';
		ctx.fillRect(0, 0, 0.14, LANES);
		ctx.fillStyle = 'rgba(255,255,255,0.15)';
		ctx.fillRect(0.14, 0, 0.03, LANES);
		// Grid lines.
		ctx.strokeStyle = 'rgba(0,0,0,0.08)';
		ctx.lineWidth = 0.015;
		for (let c = 1; c < COLS; c++) {
			ctx.beginPath();
			ctx.moveTo(c, 0);
			ctx.lineTo(c, LANES);
			ctx.stroke();
		}
		for (let r = 1; r < LANES; r++) {
			ctx.beginPath();
			ctx.moveTo(0, r);
			ctx.lineTo(COLS, r);
			ctx.stroke();
		}

		const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
			ctx.beginPath();
			ctx.moveTo(ax, ay);
			ctx.lineTo(bx, by);
			ctx.lineTo(cx, cy);
			ctx.closePath();
			ctx.fill();
		};
		const dot = (x: number, y: number, rr: number): void => {
			ctx.beginPath();
			ctx.arc(x, y, rr, 0, Math.PI * 2);
			ctx.fill();
		};
		const hpBar = (cx: number, cy: number, r: number, frac: number): void => {
			if (frac >= 1) return;
			ctx.fillStyle = 'rgba(0,0,0,0.35)';
			ctx.fillRect(cx - r, cy - r * 1.5, r * 2, 0.06);
			ctx.fillStyle = frac > 0.5 ? '#2f9e6f' : frac > 0.25 ? '#f0a830' : '#d9534f';
			ctx.fillRect(cx - r, cy - r * 1.5, r * 2 * frac, 0.06);
		};
		const drawHen = (cx: number, cy: number, r: number, comb: string, body: string, alpha = 1): void => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(cx, cy);
			ctx.fillStyle = comb;
			ctx.beginPath();
			ctx.arc(-r * 0.2, -r, r * 0.28, 0, Math.PI * 2);
			ctx.arc(r * 0.2, -r, r * 0.28, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = body;
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = 'rgba(0,0,0,0.16)';
			ctx.lineWidth = 0.02;
			ctx.stroke();
			ctx.fillStyle = '#f0a830'; // beak faces right (toward foxes)
			tri(r * 0.7, 0, r * 1.35, r * 0.16, r * 0.7, r * 0.32);
			ctx.fillStyle = '#222';
			dot(r * 0.32, -r * 0.28, r * 0.13);
			ctx.restore();
		};
		const drawHay = (cx: number, cy: number, r: number, frac: number): void => {
			const w = r * 1.9;
			ctx.save();
			ctx.translate(cx, cy);
			ctx.fillStyle = frac > 0.4 ? '#c9a24a' : '#a9843a';
			const x = -w / 2;
			const rad = 0.08;
			ctx.beginPath();
			ctx.moveTo(x + rad, -w / 2);
			ctx.arcTo(x + w, -w / 2, x + w, w / 2, rad);
			ctx.arcTo(x + w, w / 2, x, w / 2, rad);
			ctx.arcTo(x, w / 2, x, -w / 2, rad);
			ctx.arcTo(x, -w / 2, x + w, -w / 2, rad);
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = 'rgba(120,80,20,0.5)';
			ctx.lineWidth = 0.03;
			for (let i = -1; i <= 1; i++) {
				ctx.beginPath();
				ctx.moveTo(x, (i * w) / 3);
				ctx.lineTo(x + w, (i * w) / 3);
				ctx.stroke();
			}
			ctx.restore();
		};
		const drawTower = (t: Tower): void => {
			const cx = t.col + 0.5;
			const cy = t.row + 0.5;
			const r = 0.34;
			const frac = t.maxHp ? t.hp / t.maxHp : 1;
			if (t.type === 'costaude') drawHay(cx, cy, r, frac);
			else if (t.type === 'pondeuse') drawHen(cx, cy, r, '#e8b23a', '#fdfdfd');
			else if (t.type === 'mitrailleuse') drawHen(cx, cy, r, '#e34b4b', '#ffd8d8');
			else drawHen(cx, cy, r, '#e34b4b', '#fdfdfd');
			hpBar(cx, cy, r, frac);
		};
		const drawFox = (f: Fox): void => {
			const mega = f.type === 'mega';
			const cx = f.x;
			const cy = f.row + 0.5;
			const r = mega ? 0.62 : 0.36;
			const frac = f.maxHp ? Math.max(0, f.hp / f.maxHp) : 1;
			ctx.save();
			ctx.translate(cx, cy);
			ctx.fillStyle = mega ? '#a8531c' : '#d8722c';
			tri(-r * 0.7, -r * 0.5, -r * 0.2, -r * 1.3, 0, -r * 0.6);
			tri(r * 0.7, -r * 0.5, r * 0.2, -r * 1.3, 0, -r * 0.6);
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.fillStyle = mega
				? `rgb(${Math.round(150 + (1 - frac) * 40)},${Math.round(60 * frac + 28)},${Math.round(30 * frac)})`
				: `rgb(${Math.round(210 + (1 - frac) * 30)},${Math.round(110 * frac + 40)},${Math.round(50 * frac)})`;
			ctx.fill();
			ctx.fillStyle = '#fff'; // snout faces left (moving left)
			dot(-r * 0.5, r * 0.15, r * 0.32);
			ctx.fillStyle = '#222';
			dot(-r * 0.15, -r * 0.12, r * 0.12);
			dot(r * 0.35, -r * 0.12, r * 0.12);
			dot(-r * 0.72, r * 0.05, r * 0.1);
			if (mega) {
				// angry eyebrows
				ctx.strokeStyle = '#111';
				ctx.lineWidth = 0.05;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(-r * 0.34, -r * 0.36);
				ctx.lineTo(-r * 0.02, -r * 0.2);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(r * 0.52, -r * 0.36);
				ctx.lineTo(r * 0.2, -r * 0.2);
				ctx.stroke();
			}
			ctx.restore();
			hpBar(cx, cy, r, frac);
		};

		for (const e of st.eggs) {
			ctx.fillStyle = '#fff6e0';
			ctx.strokeStyle = 'rgba(0,0,0,0.15)';
			ctx.lineWidth = 0.02;
			ctx.beginPath();
			ctx.ellipse(e.x, e.row + 0.5, 0.11, 0.15, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		for (const t of st.towers) drawTower(t);
		for (const f of st.foxes) drawFox(f);

		// Placement preview.
		const h = hoverRef.current;
		const sel = selectedRef.current;
		if (statusRef.current === 'playing' && h && sel && sel !== 'shovel') {
			const occupied = st.towers.some((t) => t.row === h.row && t.col === h.col);
			ctx.fillStyle = occupied ? 'rgba(220,60,60,0.18)' : 'rgba(255,255,255,0.18)';
			ctx.fillRect(h.col, h.row, 1, 1);
			if (!occupied) {
				if (sel === 'costaude') drawHay(h.col + 0.5, h.row + 0.5, 0.34, 1);
				else drawHen(h.col + 0.5, h.row + 0.5, 0.34, sel === 'pondeuse' ? '#e8b23a' : '#e34b4b', sel === 'mitrailleuse' ? '#ffd8d8' : '#fdfdfd', 0.55);
			}
		} else if (statusRef.current === 'playing' && h && sel === 'shovel') {
			ctx.fillStyle = 'rgba(220,60,60,0.2)';
			ctx.fillRect(h.col, h.row, 1, 1);
		}
	}, []);

	/* ---------- Loop ---------- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const syncHud = (st: State): void => {
		setHud({ grain: Math.floor(st.grain), cd: { ...st.cooldowns } });
		if (st.score !== score) setScore(st.score);
		const hasMega = st.foxes.some((f) => f.type === 'mega');
		if (hasMega !== megaAlertRef.current) {
			megaAlertRef.current = hasMega;
			setMegaAlert(hasMega);
		}
	};

	const onGameOver = useCallback(() => {
		stop();
		const st = stateRef.current;
		const sc = st?.score ?? 0;
		setStat('over');
		setScore(sc);
		setBest((prev) => {
			const nb = Math.max(prev, sc);
			if (dailyRef.current) {
				const exhausted = triesRef.current >= MAX_TRIES;
				if (exhausted) setAlreadyPlayed(true);
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					seed: seedRef.current,
					diffIndex: diffIdxRef.current,
					state: { best: nb, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				try {
					localStorage.setItem(bestKey(DIFF_ORDER[diffIdxRef.current] ?? 'moyen'), String(nb));
				} catch {
					/* ignore */
				}
			}
			return nb;
		});
		trackGame(gameId, 'game_over', { score: sc });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId, stop]);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			const st = stateRef.current!;
			const rng = rngRef.current;
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				step(st, STEP / 1000, rng);
				if (st.over) break;
			}
			draw();
			if (++hudTickRef.current % 6 === 0) syncHud(st);
			if (st.over) {
				syncHud(st);
				onGameOver();
				return;
			}
			rafRef.current = requestAnimationFrame(frame);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		[draw, onGameOver],
	);

	const start = useCallback(() => {
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return;
		stateRef.current = createGame(diffIdxRef.current, mulberry32(seedRef.current));
		rngRef.current = mulberry32(seedRef.current ^ 0x9e3779b9);
		accRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		setScore(0);
		setHud({ grain: Math.floor(stateRef.current.grain), cd: {} });
		megaAlertRef.current = false;
		setMegaAlert(false);
		selectCard(null);
		setStat('playing');
		setAttempt((a) => a + 1);
		trackGame(gameId, 'game_started');
		if (dailyRef.current) {
			triesRef.current += 1;
			setTries(triesRef.current);
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: false,
				seed: seedRef.current,
				diffIndex: diffIdxRef.current,
				state: { best, tries: triesRef.current } satisfies DailyState,
			});
		}
		draw();
		rafRef.current = requestAnimationFrame(frame);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId, best, draw, frame]);

	/* ---------- Modes ---------- */
	const armFree = useCallback(
		(key: DiffKey) => {
			stop();
			dailyRef.current = false;
			setDaily(false);
			setAlreadyPlayed(false);
			setDailyLoading(false);
			triesRef.current = 0;
			setTries(0);
			setDiffKey(key);
			diffIdxRef.current = DIFF_ORDER.indexOf(key);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			stateRef.current = createGame(diffIdxRef.current, mulberry32(seedRef.current));
			selectCard(null);
			setStat('ready');
			setScore(0);
			setHud({ grain: Math.floor(stateRef.current.grain), cd: {} });
			let b = 0;
			try {
				b = Number(localStorage.getItem(bestKey(key))) || 0;
			} catch {
				/* ignore */
			}
			setBest(b);
			draw();
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		[stop, draw],
	);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		setDaily(true);
		selectCard(null);
		const applyDaily = (seed: number, diffIndex: number, run: DailyState | null): void => {
			seedRef.current = seed >>> 0;
			diffIdxRef.current = diffIndex;
			setDiffKey(DIFF_ORDER[diffIndex] ?? 'moyen');
			triesRef.current = run?.tries ?? 0;
			setTries(triesRef.current);
			const b = run?.best ?? 0;
			setBest(b);
			stateRef.current = createGame(diffIndex, mulberry32(seedRef.current));
			setScore(0);
			setHud({ grain: Math.floor(stateRef.current.grain), cd: {} });
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			setStat(exhausted ? 'over' : 'ready');
			draw();
		};

		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			applyDaily(run.seed, run.diffIndex ?? dailyDifficultyIndex(), (run.state as DailyState) ?? null);
			setDailyLoading(false);
			return;
		}
		setDailyLoading(true);
		const { seed, diffIndex } = await getDaily(gameId);
		applyDaily(seed, diffIndex, null);
		setDailyLoading(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameId, stop, draw]);

	/* ---------- Canvas sizing ---------- */
	const resize = useCallback(() => {
		const cv = canvasRef.current;
		const wrap = wrapRef.current;
		if (!cv || !wrap) return;
		const cssW = wrap.clientWidth;
		const cssH = (cssW * LANES) / COLS;
		const dpr = window.devicePixelRatio || 1;
		cv.style.height = `${cssH}px`;
		cv.width = Math.round(cssW * dpr);
		cv.height = Math.round(cssH * dpr);
		scaleRef.current = cssW / COLS;
		const ctx = cv.getContext('2d');
		if (ctx) ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, 0, 0);
		draw();
	}, [draw]);

	useEffect(() => {
		resize();
		armFree('moyen');
		const ro = new ResizeObserver(() => resize());
		if (wrapRef.current) ro.observe(wrapRef.current);
		return () => {
			ro.disconnect();
			stop();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Auto-pause when the tab is hidden. */
	useEffect(() => {
		const onVis = (): void => {
			if (document.hidden) {
				if (runningRef.current) stop();
			} else if (statusRef.current === 'playing' && !runningRef.current) {
				lastRef.current = performance.now();
				runningRef.current = true;
				rafRef.current = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [frame, stop]);

	/* ---------- Pointer (place / remove) ---------- */
	const cellFrom = (e: React.PointerEvent): { row: number; col: number } | null => {
		const cv = canvasRef.current;
		if (!cv) return null;
		const rect = cv.getBoundingClientRect();
		const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
		const row = Math.floor(((e.clientY - rect.top) / rect.height) * LANES);
		if (row < 0 || row >= LANES || col < 0 || col >= COLS) return null;
		return { row, col };
	};
	const onPointerMove = (e: React.PointerEvent): void => {
		hoverRef.current = cellFrom(e);
	};
	const onPointerDown = (e: React.PointerEvent): void => {
		if (statusRef.current !== 'playing') return;
		const cell = cellFrom(e);
		const st = stateRef.current;
		const sel = selectedRef.current;
		if (!cell || !st || !sel) return;
		if (sel === 'shovel') {
			st.towers = st.towers.filter((t) => !(t.row === cell.row && t.col === cell.col));
			selectCard(null);
		} else if (placeTower(st, sel, cell.row, cell.col)) {
			selectCard(null);
		}
		setHud({ grain: Math.floor(st.grain), cd: { ...st.cooldowns } });
		draw();
	};

	const affordable = (type: TowerType): boolean => hud.grain >= TOWER[type].cost && (hud.cd[type] ?? 0) <= 0;

	return (
		<div className="cr-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="cr-daily-tag">
					{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${DIFFS[diffKey].label} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="cr-bar">
					<div className="cr-pills" role="tablist" aria-label="Difficulté">
						{(Object.keys(DIFFS) as DiffKey[]).map((k) => (
							<button key={k} role="tab" aria-selected={diffKey === k} className={`cr-pill ${diffKey === k ? 'active' : ''}`} onClick={() => armFree(k)}>
								{DIFFS[k].label}
							</button>
						))}
					</div>
				</div>
			)}

			<div className="cr-hud">
				<span className="cr-grain">🌾 <strong>{hud.grain}</strong></span>
				<span className="cr-scorepill">Renards <strong>{score}</strong></span>
				{daily ? <span className="cr-scorepill">Record <strong>{best}</strong></span> : <span className="cr-scorepill">Record <strong>{best}</strong></span>}
			</div>

			<div className="cr-cards">
				{TOWER_ORDER.map((type) => {
					const ok = affordable(type);
					const cd = hud.cd[type] ?? 0;
					return (
						<button
							key={type}
							className={`cr-card ${selected === type ? 'sel' : ''} ${ok ? '' : 'disabled'}`}
							onClick={() => selectCard(selected === type ? null : type)}
							disabled={status !== 'playing' || !ok}
							title={`${TOWER[type].label} — ${TOWER[type].cost} grain`}
						>
							<span className="cr-card-emoji">{CARD[type].emoji}</span>
							<span className="cr-card-cost">{TOWER[type].cost}</span>
							{cd > 0 && <span className="cr-card-cd" style={{ height: `${Math.min(100, (cd / TOWER[type].cooldown) * 100)}%` }} />}
						</button>
					);
				})}
				<button
					className={`cr-card shovel ${selected === 'shovel' ? 'sel' : ''}`}
					onClick={() => selectCard(selected === 'shovel' ? null : 'shovel')}
					disabled={status !== 'playing'}
					title="Retirer une cocotte"
				>
					<span className="cr-card-emoji">🧹</span>
				</button>
			</div>

			{megaAlert && status === 'playing' && <div className="cr-mega-alert">🦊 Méga renard&nbsp;!</div>}

			<div className="cr-playwrap" ref={wrapRef}>
				<canvas
					ref={canvasRef}
					className="cr-canvas"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerLeave={() => (hoverRef.current = null)}
				/>

				{status === 'ready' && !dailyLoading && (
					<div className="cr-overlay">
						<button className="cr-startbtn" onClick={start}>▶ Commencer</button>
					</div>
				)}
				{daily && dailyLoading && <div className="cr-overlay"><div className="cr-overlay-card">Préparation du défi…</div></div>}
				{status === 'over' && (
					<div className="cr-overlay">
						<div className="cr-overlay-card cr-over">
							{daily && alreadyPlayed ? (
								<>Défi du jour terminé · <strong>{best}</strong><span>reviens demain&nbsp;!</span></>
							) : (
								<>
									<span className="cr-over-title">🦊 Le poulailler est tombé&nbsp;!</span>
									<span>Renards repoussés : <strong>{score}</strong></span>
									{daily
										? <button className="cr-replay" onClick={start}>↻ Rejouer ({MAX_TRIES - tries} restant{MAX_TRIES - tries > 1 ? 's' : ''})</button>
										: <button className="cr-replay" onClick={() => armFree(diffKey)}>↻ Rejouer</button>}
								</>
							)}
						</div>
					</div>
				)}
			</div>

			<p className="cr-help">
				Sélectionne une cocotte puis clique une case pour la poser. Les pondeuses produisent du grain, les lanceuses tirent des œufs. Empêche les renards d'atteindre le poulailler&nbsp;!
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' && !alreadyPlayed ? best : undefined} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

const CSS = `
.cr-root { --cr-accent: var(--accent-regular); width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.cr-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.5rem; }
.cr-bar { width: 100%; display: flex; justify-content: center; margin-bottom: 0.5rem; }
.cr-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.cr-pill { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300); font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.cr-pill.active { background: var(--cr-accent); color: var(--accent-text-over); border-color: var(--cr-accent); }
.cr-hud { display: flex; gap: 0.6rem; align-items: center; font-size: 14px; font-weight: 600; margin-bottom: 0.55rem; }
.cr-grain { background: #3a2f14; color: #ffe08a; border-radius: 999px; padding: 6px 14px; font-variant-numeric: tabular-nums; }
.cr-scorepill { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 6px 12px; font-variant-numeric: tabular-nums; }
.cr-grain strong, .cr-scorepill strong { margin-left: 3px; }
.cr-cards { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.6rem; }
.cr-card { position: relative; overflow: hidden; width: 62px; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); border-radius: 10px; padding: 6px 4px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cr-card.sel { border-color: var(--cr-accent); box-shadow: 0 0 0 2px var(--cr-accent); }
.cr-card.disabled, .cr-card:disabled { opacity: 0.45; cursor: not-allowed; }
.cr-card-emoji { font-size: 22px; line-height: 1; }
.cr-card-cost { font-size: 12px; font-weight: 700; color: #ffe08a; }
.cr-card-cd { position: absolute; left: 0; bottom: 0; width: 100%; background: rgba(0,0,0,0.55); pointer-events: none; }
.cr-card.shovel { width: 50px; justify-content: center; }
.cr-mega-alert { margin-bottom: 0.5rem; background: #b0281f; color: #fff; font-weight: 800; font-size: 13.5px; letter-spacing: 0.3px; border-radius: 999px; padding: 6px 16px; box-shadow: var(--shadow-md); animation: cr-pulse 0.9s ease-in-out infinite; }
@keyframes cr-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.72; transform: scale(1.05); } }
@media (prefers-reduced-motion: reduce) { .cr-mega-alert { animation: none; } }
.cr-playwrap { width: 100%; position: relative; border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); }
.cr-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; }
.cr-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.25); }
.cr-overlay-card { background: var(--gray-999); border: 2px solid var(--cr-accent); border-radius: 16px; padding: 16px 24px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; }
.cr-over { display: flex; flex-direction: column; gap: 8px; align-items: center; font-size: 15px; }
.cr-over-title { font-size: 17px; font-weight: 700; }
.cr-over strong { color: var(--cr-accent); font-variant-numeric: tabular-nums; }
.cr-over span { color: var(--gray-200); }
.cr-startbtn, .cr-replay { border: none; background: var(--cr-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 16px; border-radius: 999px; padding: 12px 32px; cursor: pointer; box-shadow: var(--shadow-lg); }
.cr-replay { font-size: 14px; padding: 9px 20px; margin-top: 2px; }
.cr-help { max-width: 520px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1rem; }
`;
