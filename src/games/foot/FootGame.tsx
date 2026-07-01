import { useState, useEffect, useRef, useCallback } from 'react';
import {
	createWorld, stepPlayer, stepBall, resolveKicks, applyScore, step, separatePlayers,
	playerPos, applyPlayerPos, ballState,
	FIELD, FLOOR, GOAL_TOP, PLAYER_R, BALL_R, WIN_GOALS,
	type World, type PlayerInput, type Side,
} from './engine';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, type Match, type PosMsg, type BallSync } from './net';
import { playerName, setPlayerName } from '../../lib/leaderboard';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   COCOTTE FOOT — 1v1 arena football (2D canvas). Shared ball, host-authoritative
   (host = smallest id, cf. Pong). Own cocotte simulated locally; opponent + ball come
   from the network, interpolated. Bot mode is fully local. Engine pur/testé dans ./engine.
   ===================================================== */

type Phase = 'menu' | 'waiting' | 'playing' | 'over';
type Role = 'host' | 'guest' | 'ai';

const SEND_HZ = 20;
const STEP = 1000 / 60;
const SCALE = 2.6; // world units → backing pixels
const VIEW_W = FIELD.W * SCALE;
const VIEW_H = FIELD.H * SCALE;
const COL_ME = '#4da3ff';
const COL_OPP = '#ff5a5f';

interface Keys { left: boolean; right: boolean; jump: boolean; }
const readInput = (k: Keys, t: Keys): PlayerInput => ({
	move: ((k.right || t.right ? 1 : 0) - (k.left || t.left ? 1 : 0)) as -1 | 0 | 1,
	jump: k.jump || t.jump,
});

/** Simple, beatable bot: chase/lead the ball, hang back near its goal, head high balls. */
function botInput(w: World): PlayerInput {
	const me = w.players[1], ball = w.ball;
	let targetX = ball.x + ball.vx * 0.15;
	if (ball.x < FIELD.W * 0.4) targetX = FIELD.W * 0.66; // ball far away → hold position
	let move: -1 | 0 | 1 = 0;
	if (targetX < me.x - 6) move = -1;
	else if (targetX > me.x + 6) move = 1;
	const jump = me.onGround && ball.y < me.y - 10 && Math.abs(ball.x - me.x) < 42 && ball.vy > -20;
	return { move, jump };
}

export default function FootGame({ gameId }: { gameId: string }) {
	const [phase, setPhase] = useState<Phase>('menu');
	const [name, setName] = useState('');
	const [codeInput, setCodeInput] = useState('');
	const [codePanel, setCodePanel] = useState(false);
	const [roomCode, setRoomCode] = useState<string | null>(null);
	const [status, setStatus] = useState('');
	const [scoreMe, setScoreMe] = useState(0);
	const [scoreOpp, setScoreOpp] = useState(0);
	const [oppName, setOppName] = useState('Adversaire');
	const [youWon, setYouWon] = useState(false);
	const [confirmQuit, setConfirmQuit] = useState(false);
	const [copied, setCopied] = useState(false);
	const [goalFlash, setGoalFlash] = useState('');

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const runningRef = useRef(false);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const sendAccRef = useRef(0);

	const matchRef = useRef<Match | null>(null);
	const roleRef = useRef<Role>('ai');
	const startedRef = useRef(false);
	const phaseRef = useRef<Phase>('menu');

	const worldRef = useRef<World>(createWorld());
	const oppNetRef = useRef<{ x: number; y: number; vx: number; vy: number; face: 1 | -1 }>({ x: FIELD.W * 0.72, y: FLOOR - PLAYER_R, vx: 0, vy: 0, face: -1 });
	const oppRenderRef = useRef({ x: FIELD.W * 0.72, y: FLOOR - PLAYER_R, face: -1 as 1 | -1 });
	const ballRenderRef = useRef({ x: FIELD.W / 2, y: FIELD.H * 0.32 });
	const prevScoreRef = useRef({ l: 0, r: 0 });

	const keysRef = useRef<Keys>({ left: false, right: false, jump: false });
	const touchRef = useRef<Keys>({ left: false, right: false, jump: false });

	const { celebrating } = useCelebration(phase === 'over' && youWon);

	useEffect(() => { setName(playerName()); }, []);
	useEffect(() => { phaseRef.current = phase; }, [phase]);

	/* ---------- rendering ---------- */
	const drawCocotte = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, face: 1 | -1) => {
		ctx.save();
		ctx.translate(x, y);
		ctx.scale(face, 1);
		ctx.fillStyle = '#e34b4b'; // comb
		ctx.beginPath(); ctx.arc(-r * 0.2, -r, r * 0.3, 0, Math.PI * 2); ctx.arc(r * 0.2, -r, r * 0.3, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = color; // body
		ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.2; ctx.stroke();
		ctx.fillStyle = '#f0a830'; // beak
		ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.02); ctx.lineTo(r * 1.45, r * 0.2); ctx.lineTo(r * 0.7, r * 0.38); ctx.closePath(); ctx.fill();
		ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.28, r * 0.26, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.28, r * 0.13, 0, Math.PI * 2); ctx.fill();
		ctx.restore();
	};

	const drawBall = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) => {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(spin);
		ctx.fillStyle = '#fcfcfc';
		ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
		ctx.fillStyle = '#222';
		ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill(); // centre pentagon-ish
		for (let k = 0; k < 5; k++) {
			const a = (k / 5) * Math.PI * 2;
			ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.13, 0, Math.PI * 2); ctx.fill();
		}
		ctx.restore();
	};

	const drawGoal = (ctx: CanvasRenderingContext2D, side: 'l' | 'r') => {
		const S = SCALE, top = GOAL_TOP * S, floor = FLOOR * S;
		const x = side === 'l' ? 0 : VIEW_W;
		const depth = 14 * S * (side === 'l' ? 1 : -1);
		ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
		ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x, top); ctx.lineTo(x + depth, top); ctx.stroke(); // post + crossbar
		ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
		for (let gy = top; gy <= floor; gy += 9) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + depth, top + (gy - top) * 0.5); ctx.stroke(); } // net hint
	};

	const draw = useCallback(() => {
		const cv = canvasRef.current; if (!cv) return;
		const ctx = cv.getContext('2d'); if (!ctx) return;
		const S = SCALE, w = worldRef.current, role = roleRef.current;
		const mySide: Side = role === 'guest' ? 1 : 0;

		// sky
		const sky = ctx.createLinearGradient(0, 0, 0, FLOOR * S);
		sky.addColorStop(0, '#bfe3ff'); sky.addColorStop(1, '#e9f6ff');
		ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, FLOOR * S);
		// pitch
		ctx.fillStyle = '#5aa84a'; ctx.fillRect(0, FLOOR * S, VIEW_W, VIEW_H - FLOOR * S);
		ctx.fillStyle = '#4c9440'; ctx.fillRect(0, FLOOR * S, VIEW_W, 3);
		// centre line
		ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
		ctx.beginPath(); ctx.moveTo(VIEW_W / 2, 0); ctx.lineTo(VIEW_W / 2, FLOOR * S); ctx.stroke(); ctx.setLineDash([]);
		drawGoal(ctx, 'l'); drawGoal(ctx, 'r');

		// ball (host/ai: authoritative; guest: eased from network)
		const b = role === 'guest' ? ballRenderRef.current : w.ball;
		drawBall(ctx, b.x * S, b.y * S, BALL_R * S, w.ball.spin);
		// my cocotte (always local)
		const me = w.players[mySide];
		drawCocotte(ctx, me.x * S, me.y * S, PLAYER_R * S, COL_ME, me.face);
		// opponent (ai: local bot; net: eased)
		if (role === 'ai') { const o = w.players[1]; drawCocotte(ctx, o.x * S, o.y * S, PLAYER_R * S, COL_OPP, o.face); }
		else { const o = oppRenderRef.current; drawCocotte(ctx, o.x * S, o.y * S, PLAYER_R * S, COL_OPP, o.face); }
	}, []);

	/* ---------- score / win ---------- */
	const finish = useCallback((l: number, r: number) => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		const mySide = roleRef.current === 'guest' ? 1 : 0;
		setYouWon(mySide === 0 ? l > r : r > l);
		setPhase('over');
		trackGame(gameId, 'game_won');
	}, [gameId]);

	const applyScores = useCallback((l: number, r: number) => {
		const mySide = roleRef.current === 'guest' ? 1 : 0;
		setScoreMe(mySide === 0 ? l : r);
		setScoreOpp(mySide === 0 ? r : l);
		const prev = prevScoreRef.current;
		if (l > prev.l || r > prev.r) { setGoalFlash('BUT !'); setTimeout(() => setGoalFlash(''), 1100); }
		prevScoreRef.current = { l, r };
		if (l >= WIN_GOALS || r >= WIN_GOALS) finish(l, r);
	}, [finish]);

	/* ---------- main loop ---------- */
	const frame = useCallback((now: number) => {
		if (!runningRef.current) return;
		let dtMs = now - lastRef.current; lastRef.current = now;
		if (dtMs > 200) dtMs = 200;
		accRef.current += dtMs;
		const role = roleRef.current;
		const w = worldRef.current;
		const mySide: Side = role === 'guest' ? 1 : 0;

		while (accRef.current >= STEP) {
			accRef.current -= STEP;
			const dt = STEP / 1000;
			const inp = readInput(keysRef.current, touchRef.current);
			if (role === 'ai') {
				const r = step(w, dt, [inp, botInput(w)]);
				if (r.scorer !== null) applyScores(w.score.l, w.score.r);
			} else if (role === 'host') {
				applyPlayerPos(w.players[1], oppNetRef.current); // opponent from the network
				if (w.kickoff > 0) {
					w.kickoff -= dt;
					stepPlayer(w.players[0], inp, dt);
					separatePlayers(w.players[0], w.players[1]);
					w.ball.x = FIELD.W / 2; w.ball.y = FIELD.H * 0.32; w.ball.vx = 0; w.ball.vy = 0;
				} else {
					stepPlayer(w.players[0], inp, dt);
					separatePlayers(w.players[0], w.players[1]);
					const scorer = stepBall(w, dt);
					resolveKicks(w);
					if (scorer !== null) { applyScore(w, scorer); applyScores(w.score.l, w.score.r); }
				}
			} else {
				stepPlayer(w.players[1], inp, dt); // guest: only my own cocotte
			}
		}

		// ease networked entities
		const k = 0.32;
		const ot = oppNetRef.current;
		oppRenderRef.current.x += (ot.x - oppRenderRef.current.x) * k;
		oppRenderRef.current.y += (ot.y - oppRenderRef.current.y) * k;
		oppRenderRef.current.face = ot.face;
		if (role === 'guest') {
			ballRenderRef.current.x += (w.ball.x - ballRenderRef.current.x) * k;
			ballRenderRef.current.y += (w.ball.y - ballRenderRef.current.y) * k;
		}

		draw();

		// broadcast
		sendAccRef.current += dtMs;
		if (sendAccRef.current >= 1000 / SEND_HZ) {
			sendAccRef.current = 0;
			const m = matchRef.current;
			if (m && role !== 'ai') {
				m.sendPos(playerPos(w.players[mySide]));
				if (role === 'host') m.sendBall({ ...ballState(w), l: w.score.l, r: w.score.r, ko: w.kickoff } satisfies BallSync);
			}
		}
		rafRef.current = requestAnimationFrame(frame);
	}, [applyScores, draw]);

	const startLoop = useCallback(() => {
		runningRef.current = true;
		lastRef.current = performance.now();
		accRef.current = 0;
		sendAccRef.current = 0;
		rafRef.current = requestAnimationFrame(frame);
	}, [frame]);

	/* ---------- match lifecycle ---------- */
	const resetWorld = useCallback(() => {
		worldRef.current = createWorld();
		prevScoreRef.current = { l: 0, r: 0 };
		setScoreMe(0); setScoreOpp(0); setGoalFlash('');
		oppNetRef.current = { x: FIELD.W * 0.72, y: FLOOR - PLAYER_R, vx: 0, vy: 0, face: -1 };
		oppRenderRef.current = { x: FIELD.W * 0.72, y: FLOOR - PLAYER_R, face: -1 };
		ballRenderRef.current = { x: FIELD.W / 2, y: FIELD.H * 0.32 };
	}, []);

	const startMatch = useCallback((m: Match) => {
		if (startedRef.current) return;
		startedRef.current = true;
		roleRef.current = m.isHost() ? 'host' : 'guest';
		setConfirmQuit(false);
		resetWorld();
		m.onPos((p: PosMsg) => { oppNetRef.current = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face }; });
		m.onBall((b: BallSync) => {
			if (roleRef.current !== 'guest') return;
			const w = worldRef.current;
			w.ball.x = b.x; w.ball.y = b.y; w.ball.vx = b.vx; w.ball.vy = b.vy; w.kickoff = b.ko;
			if (phaseRef.current === 'over' && b.l === 0 && b.r === 0) { setPhase('playing'); startLoop(); } // host restarted
			applyScores(b.l, b.r);
		});
		trackGame(gameId, 'game_started');
		setPhase('playing');
		startLoop();
	}, [applyScores, gameId, resetWorld, startLoop]);

	const quitToMenu = useCallback(() => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		startedRef.current = false;
		matchRef.current?.leave();
		matchRef.current = null;
		setConfirmQuit(false);
		setPhase('menu');
	}, []);

	const beginNetMatch = useCallback((m: Match) => {
		matchRef.current = m;
		startedRef.current = false;
		setPhase('waiting');
		m.onPeers((peers) => {
			if (peers[0]) setOppName(peers[0].name || 'Adversaire');
			if (peers.length >= 1) startMatch(m);
			else if (startedRef.current) { setStatus('Adversaire parti.'); quitToMenu(); }
		});
	}, [startMatch, quitToMenu]);

	const ensureName = useCallback((): string => {
		const nm = (name || playerName()).trim();
		if (nm) setPlayerName(nm);
		return nm;
	}, [name]);

	const playQuick = useCallback(async () => {
		const nm = ensureName();
		if (!nm) { setStatus('Entre un pseudo.'); return; }
		setStatus('Recherche d’un adversaire…');
		const m = await joinRandom(nm);
		if (!m) { setStatus('Aucune partie libre. Réessaie ou joue contre le bot.'); return; }
		setStatus(''); setRoomCode(null); beginNetMatch(m);
	}, [ensureName, beginNetMatch]);

	const playCreateCode = useCallback(async () => {
		const nm = ensureName();
		if (!nm) { setStatus('Entre un pseudo.'); return; }
		const code = makeCode();
		const m = await joinByCode(nm, code);
		if (!m) { setStatus('Impossible de créer la partie.'); return; }
		setStatus(''); setRoomCode(code); beginNetMatch(m);
	}, [ensureName, beginNetMatch]);

	const playJoinCode = useCallback(async () => {
		const nm = ensureName();
		if (!nm) { setStatus('Entre un pseudo.'); return; }
		const code = codeInput.trim().toUpperCase();
		if (!code) { setStatus('Entre un code.'); return; }
		const m = await joinByCode(nm, code);
		if (!m) { setStatus('Partie pleine ou introuvable.'); return; }
		setStatus(''); setRoomCode(code); beginNetMatch(m);
	}, [ensureName, codeInput, beginNetMatch]);

	const playAI = useCallback(() => {
		roleRef.current = 'ai';
		matchRef.current = null;
		startedRef.current = true;
		setOppName('Ordinateur');
		setConfirmQuit(false);
		resetWorld();
		setRoomCode(null);
		trackGame(gameId, 'game_started');
		setPhase('playing');
		startLoop();
	}, [gameId, resetWorld, startLoop]);

	const rematch = useCallback(() => {
		if (roleRef.current === 'guest') return; // host / bot restarts
		resetWorld();
		setPhase('playing');
		startLoop();
		if (roleRef.current === 'host') matchRef.current?.sendBall({ ...ballState(worldRef.current), l: 0, r: 0, ko: worldRef.current.kickoff });
	}, [resetWorld, startLoop]);

	const copyCode = useCallback(() => {
		if (!roomCode) return;
		void navigator.clipboard?.writeText(roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
	}, [roomCode]);

	/* ---------- input ---------- */
	useEffect(() => {
		const k = keysRef.current;
		const down = (e: KeyboardEvent) => {
			if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
			if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'q') k.left = true;
			else if (e.key === 'ArrowRight' || e.key === 'd') k.right = true;
			else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'z' || e.key === ' ') k.jump = true;
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'q') k.left = false;
			else if (e.key === 'ArrowRight' || e.key === 'd') k.right = false;
			else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'z' || e.key === ' ') k.jump = false;
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
	}, []);

	useEffect(() => () => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		matchRef.current?.leave();
	}, []);

	const touch = (key: keyof Keys, v: boolean) => (e: React.PointerEvent) => { e.preventDefault(); touchRef.current[key] = v; };
	const mpOff = !multiplayerAvailable();

	return (
		<div className="fo-root">
			<style>{CSS}</style>
			<div className="fo-stage">
				<canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="fo-canvas" role="img" aria-label="Cocotte Foot" />
				{celebrating && <Celebration />}

				{phase === 'playing' && (
					<>
						<div className="fo-hud">
							<span style={{ color: COL_ME }}>Toi {scoreMe}</span>
							<span className="fo-sep">—</span>
							<span style={{ color: COL_OPP }}>{scoreOpp} {oppName}</span>
						</div>
						<button className="fo-quit" onClick={() => setConfirmQuit(true)}>✕</button>
						{goalFlash && <div className="fo-goal">{goalFlash}</div>}
					</>
				)}

				{confirmQuit && (
					<div className="fo-overlay">
						<div className="fo-card">
							<h2>Quitter la partie ?</h2>
							<button className="fo-btn fo-primary" onClick={quitToMenu}>Oui, quitter</button>
							<button className="fo-btn" onClick={() => setConfirmQuit(false)}>Continuer</button>
						</div>
					</div>
				)}

				{phase === 'menu' && (
					<div className="fo-overlay">
						<div className="fo-card">
							<h2>Cocotte Foot</h2>
							<p className="fo-sub">Duel 1 contre 1. Premier à {WIN_GOALS} buts gagne. Tape dans le ballon, il part en tir&nbsp;!</p>
							<input className="fo-name" value={name} maxLength={20} placeholder="Ton pseudo" onChange={(e) => setName(e.target.value)} />
							<button className="fo-btn fo-primary" disabled={mpOff} onClick={playQuick}>⚡ Partie rapide</button>
							<button className="fo-btn" disabled={mpOff} onClick={() => setCodePanel((v) => !v)}>🔑 Jouer avec un ami (code)</button>
							{codePanel && !mpOff && (
								<div className="fo-codepanel">
									<button className="fo-btn fo-small" onClick={playCreateCode}>Créer une partie</button>
									<div className="fo-coderow">
										<input className="fo-name fo-code" value={codeInput} maxLength={6} placeholder="CODE" onChange={(e) => setCodeInput(e.target.value.toUpperCase())} />
										<button className="fo-btn fo-small" onClick={playJoinCode}>Rejoindre</button>
									</div>
								</div>
							)}
							<button className="fo-btn" onClick={playAI}>🤖 Contre le bot</button>
							{status && <p className="fo-status">{status}</p>}
							{mpOff && <p className="fo-status">Multijoueur non configuré — seul le bot est dispo.</p>}
						</div>
					</div>
				)}

				{phase === 'waiting' && (
					<div className="fo-overlay">
						<div className="fo-card">
							<h2>En attente d'un adversaire…</h2>
							{roomCode && (
								<>
									<p className="fo-sub">Partage ce code (clique pour copier) :</p>
									<button className="fo-bigcode" onClick={copyCode}>{roomCode}</button>
									<p className="fo-copyhint">{copied ? 'Copié !' : ''}</p>
								</>
							)}
							<button className="fo-btn" onClick={quitToMenu}>Annuler</button>
						</div>
					</div>
				)}

				{phase === 'over' && (
					<div className="fo-overlay">
						<div className="fo-card">
							<h2>{youWon ? '🎉 Gagné !' : 'Perdu…'}</h2>
							<p className="fo-sub">{scoreMe} — {scoreOpp}</p>
							{roleRef.current === 'guest'
								? <p className="fo-status">En attente que l'hôte relance…</p>
								: <button className="fo-btn fo-primary" onClick={rematch}>Rejouer</button>}
							<button className="fo-btn" onClick={quitToMenu}>Menu</button>
						</div>
					</div>
				)}
			</div>

			{phase === 'playing' && (
				<div className="fo-pad">
					<div className="fo-dpad">
						<button className="fo-tbtn" aria-label="Gauche" onPointerDown={touch('left', true)} onPointerUp={touch('left', false)} onPointerLeave={touch('left', false)} onPointerCancel={touch('left', false)}>◀</button>
						<button className="fo-tbtn" aria-label="Droite" onPointerDown={touch('right', true)} onPointerUp={touch('right', false)} onPointerLeave={touch('right', false)} onPointerCancel={touch('right', false)}>▶</button>
					</div>
					<button className="fo-tbtn fo-jump" aria-label="Sauter" onPointerDown={touch('jump', true)} onPointerUp={touch('jump', false)} onPointerLeave={touch('jump', false)} onPointerCancel={touch('jump', false)}>⤴ SAUT</button>
				</div>
			)}

			<p className="fo-help">Déplace-toi ◀ ▶, saute pour faire la tête, et fonce dans le ballon pour tirer. Clavier : ← → et Espace / ↑.</p>
		</div>
	);
}

const CSS = `
.fo-root { --fo-accent: var(--accent-regular); width: 100%; max-width: 900px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
.fo-stage { position: relative; width: 100%; aspect-ratio: ${FIELD.W} / ${FIELD.H}; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-md); background: #bfe3ff; }
.fo-canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.fo-hud { position: absolute; top: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 10px; font-weight: 900; font-size: clamp(15px, 3.5vw, 22px); text-shadow: 0 1px 3px rgba(0,0,0,0.35); pointer-events: none; }
.fo-sep { color: rgba(255,255,255,0.8); }
.fo-goal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: clamp(30px, 9vw, 68px); color: #fff; text-shadow: 0 3px 10px rgba(0,0,0,0.5); pointer-events: none; animation: fo-pop 0.3s ease; }
@keyframes fo-pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.fo-quit { position: absolute; top: 8px; right: 10px; border: none; background: rgba(0,0,0,0.35); color: #fff; font: inherit; font-weight: 700; border-radius: 999px; width: 30px; height: 30px; cursor: pointer; }
.fo-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(10,14,20,0.55); backdrop-filter: blur(2px); }
.fo-card { background: var(--gray-999); border: 2px solid var(--fo-accent); border-radius: 16px; padding: 20px 26px; box-shadow: var(--shadow-lg); text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; max-width: 360px; width: 88%; }
.fo-card h2 { margin: 0; font-family: var(--font-brand); font-size: 22px; }
.fo-sub { margin: 0; color: var(--gray-300); font-size: 13px; line-height: 1.5; }
.fo-status { margin: 0; color: var(--gray-300); font-size: 12.5px; }
.fo-name { font: inherit; color: var(--gray-0); background: var(--gray-900); border: 1.5px solid var(--gray-700); border-radius: 999px; padding: 9px 16px; width: 100%; text-align: center; }
.fo-name:focus-visible { outline: none; border-color: var(--fo-accent); }
.fo-btn { border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-0); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 18px; cursor: pointer; width: 100%; transition: background-color var(--theme-transition), border-color var(--theme-transition); }
.fo-btn:hover:not(:disabled) { border-color: var(--fo-accent); }
.fo-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.fo-primary { background: var(--fo-accent); color: var(--accent-text-over); border-color: var(--fo-accent); }
.fo-small { width: auto; font-size: 13px; padding: 8px 14px; }
.fo-codepanel { display: flex; flex-direction: column; gap: 8px; width: 100%; align-items: center; }
.fo-coderow { display: flex; gap: 8px; width: 100%; }
.fo-code { text-transform: uppercase; letter-spacing: 3px; font-weight: 800; }
.fo-bigcode { font-family: var(--font-brand); font-size: 34px; font-weight: 800; letter-spacing: 6px; background: var(--gray-900); border: 2px dashed var(--fo-accent); color: var(--fo-accent); border-radius: 12px; padding: 10px 20px; cursor: pointer; }
.fo-copyhint { min-height: 16px; margin: 0; color: var(--fo-accent); font-size: 12.5px; }
.fo-pad { width: 100%; display: flex; justify-content: space-between; gap: 12px; user-select: none; }
.fo-dpad { display: flex; gap: 12px; }
.fo-tbtn { border: none; background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 800; font-size: 22px; border-radius: 14px; padding: 14px 22px; cursor: pointer; touch-action: none; box-shadow: var(--shadow-sm); }
.fo-tbtn:active { background: var(--fo-accent); color: var(--accent-text-over); }
.fo-jump { font-size: 18px; padding: 14px 26px; }
.fo-help { max-width: 560px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin: 0; }
`;
