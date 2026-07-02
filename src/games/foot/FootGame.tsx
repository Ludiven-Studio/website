import { useState, useEffect, useRef, useCallback } from 'react';
import {
	createWorld, stepPlayer, stepBall, resolveKicks, applyScore, step, separateAll,
	playerPos, applyPlayerPos, applyBall, ballState,
	FIELD, FLOOR, GOAL_TOP, PLAYER_R, BALL_R, WIN_GOALS, DASH_DETECT,
	type World, type PlayerInput, type Side, type SlotPos,
} from './engine';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, type Match, type PosMsg, type StateMsg } from './net';
import { playerName, setPlayerName } from '../../lib/leaderboard';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   COCOTTE FOOT — 2v2 arena football (2D canvas). Shared ball, host-authoritative
   (host = smallest id, cf. Pong). Slots 0,1 = left team; 2,3 = right team. Host = slot 0
   (+ bot teammate slot 1), guest = slot 2 (+ bot teammate slot 3); the host simulates the
   ball and the bots. Own cocotte is simulated locally; everything else comes from the host,
   interpolated. Bot mode is fully local. Engine pur/testé dans ./engine.
   ===================================================== */

type Phase = 'menu' | 'waiting' | 'playing' | 'over';
type Role = 'host' | 'guest' | 'ai';

const SEND_HZ = 20;
const STEP = 1000 / 60;
const SCALE = 2.0; // world units → backing pixels
const VIEW_W = FIELD.W * SCALE;
const VIEW_H = FIELD.H * SCALE;
const COL_T0 = '#4da3ff'; // left team (blue)
const COL_T1 = '#ff5a5f'; // right team (red)
const DOUBLE_TAP_MS = 280; // window for a left-left / right-right dash
const teamOf = (slot: number): Side => (slot < 2 ? 0 : 1);

interface Keys { left: boolean; right: boolean; jump: boolean; }
const readInput = (k: Keys, t: Keys): PlayerInput => ({
	move: ((k.right || t.right ? 1 : 0) - (k.left || t.left ? 1 : 0)) as -1 | 0 | 1,
	jump: k.jump || t.jump,
});

interface BotSt { wiggle: number; dir: -1 | 0 | 1; jump: boolean; }
const freshBotSt = (): BotSt[] => [0, 1, 2, 3].map(() => ({ wiggle: 0, dir: 0 as -1 | 0 | 1, jump: false }));

/** Team-aware bot: get on the own-goal side of the ball to push it toward the opponent; a
 *  backup cocotte hangs near its own half; head high balls that are close. When jammed against
 *  another cocotte it occasionally wiggles off in a random direction (and sometimes hops) to
 *  break the deadlock. Beatable on purpose. */
function botFor(w: World, slot: number, st: BotSt): PlayerInput {
	const me = w.players[slot], ball = w.ball, team = me.team;
	if (st.wiggle > 0) { st.wiggle--; return { move: st.dir, jump: st.jump }; } // finish a random escape burst
	for (let i = 0; i < w.players.length; i++) { // stuck against a neighbour?
		if (i === slot) continue;
		const o = w.players[i];
		if (Math.hypot(o.x - me.x, o.y - me.y) < PLAYER_R * 2 + 3 && Math.random() < 0.05) {
			st.wiggle = 16 + Math.floor(Math.random() * 20); // ~0.3–0.6s
			st.dir = Math.random() < 0.5 ? -1 : 1;
			st.jump = Math.random() < 0.4; // sometimes hop out
			return { move: st.dir, jump: st.jump };
		}
	}
	const attackDir = team === 0 ? 1 : -1;
	let targetX = ball.x - attackDir * (PLAYER_R + BALL_R) * 0.9; // stand behind the ball to shove it forward
	if (slot === 1 || slot === 3) { // backup
		const homeX = team === 0 ? FIELD.W * 0.28 : FIELD.W * 0.72;
		const ballOurSide = team === 0 ? ball.x < FIELD.W * 0.5 : ball.x > FIELD.W * 0.5;
		if (!ballOurSide) targetX = homeX;
	}
	let move: -1 | 0 | 1 = 0;
	if (targetX < me.x - 5) move = -1; else if (targetX > me.x + 5) move = 1;
	const jump = me.onGround && ball.y < me.y - 12 && Math.abs(ball.x - me.x) < 46 && ball.vy > -20;
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
	const mySlotRef = useRef(0); // 0 = host/bot (left), 2 = guest (right)

	const worldRef = useRef<World>(createWorld());
	const netPosRef = useRef<SlotPos[]>([]);         // raw networked positions per slot
	const slotRenderRef = useRef<{ x: number; y: number; face: 1 | -1 }[]>([]); // eased render positions
	const ballRenderRef = useRef({ x: FIELD.W / 2, y: FIELD.H * 0.3 });
	const prevScoreRef = useRef({ l: 0, r: 0 });
	const botStRef = useRef(freshBotSt());

	const keysRef = useRef<Keys>({ left: false, right: false, jump: false });
	const touchRef = useRef<Keys>({ left: false, right: false, jump: false });
	const lastTapRef = useRef({ left: 0, right: 0 });
	const dashQueuedRef = useRef<-1 | 0 | 1>(0);

	const { celebrating } = useCelebration(phase === 'over' && youWon);

	useEffect(() => { setName(playerName()); }, []);
	useEffect(() => { phaseRef.current = phase; }, [phase]);

	const isNetSlot = (role: Role, slot: number) => (role === 'host' && slot === 2) || (role === 'guest' && slot !== 2);

	const seedRender = useCallback(() => {
		const w = worldRef.current;
		netPosRef.current = w.players.map(playerPos);
		slotRenderRef.current = w.players.map((p) => ({ x: p.x, y: p.y, face: p.face }));
		ballRenderRef.current = { x: w.ball.x, y: w.ball.y };
	}, []);

	/* ---------- rendering ---------- */
	const drawCocotte = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, face: 1 | -1, isMe: boolean) => {
		if (isMe) { ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
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
		ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
		for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
		ctx.restore();
	};

	const drawGoal = (ctx: CanvasRenderingContext2D, side: 'l' | 'r') => {
		const S = SCALE, top = GOAL_TOP * S, floor = FLOOR * S;
		const x = side === 'l' ? 0 : VIEW_W;
		const depth = 14 * S * (side === 'l' ? 1 : -1);
		ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
		ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x, top); ctx.lineTo(x + depth, top); ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
		for (let gy = top; gy <= floor; gy += 9) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + depth, top + (gy - top) * 0.5); ctx.stroke(); }
	};

	const draw = useCallback(() => {
		const cv = canvasRef.current; if (!cv) return;
		const ctx = cv.getContext('2d'); if (!ctx) return;
		const S = SCALE, w = worldRef.current, role = roleRef.current, mySlot = mySlotRef.current;

		const sky = ctx.createLinearGradient(0, 0, 0, FLOOR * S);
		sky.addColorStop(0, '#bfe3ff'); sky.addColorStop(1, '#e9f6ff');
		ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, FLOOR * S);
		ctx.fillStyle = '#5aa84a'; ctx.fillRect(0, FLOOR * S, VIEW_W, VIEW_H - FLOOR * S);
		ctx.fillStyle = '#4c9440'; ctx.fillRect(0, FLOOR * S, VIEW_W, 3);
		ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
		ctx.beginPath(); ctx.moveTo(VIEW_W / 2, 0); ctx.lineTo(VIEW_W / 2, FLOOR * S); ctx.stroke(); ctx.setLineDash([]);
		drawGoal(ctx, 'l'); drawGoal(ctx, 'r');

		for (let slot = 0; slot < 4; slot++) {
			const net = isNetSlot(role, slot);
			const src = net ? slotRenderRef.current[slot] : w.players[slot];
			const color = teamOf(slot) === 0 ? COL_T0 : COL_T1;
			const vx = net ? netPosRef.current[slot].vx : w.players[slot].vx;
			if (Math.abs(vx) > DASH_DETECT) { // flash: motion-blur ghosts trailing behind
				const dir = Math.sign(vx);
				for (let g = 3; g >= 1; g--) {
					ctx.globalAlpha = 0.1 * (4 - g);
					drawCocotte(ctx, (src.x - dir * g * 5) * S, src.y * S, PLAYER_R * S, color, src.face as 1 | -1, false);
				}
				ctx.globalAlpha = 1;
			}
			drawCocotte(ctx, src.x * S, src.y * S, PLAYER_R * S, color, src.face as 1 | -1, slot === mySlot);
		}
		const b = role === 'guest' ? ballRenderRef.current : w.ball;
		drawBall(ctx, b.x * S, b.y * S, BALL_R * S, w.ball.spin);
	}, []);

	/* ---------- score / win ---------- */
	const finish = useCallback((l: number, r: number) => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		const myTeam = teamOf(mySlotRef.current);
		setYouWon(myTeam === 0 ? l > r : r > l);
		setPhase('over');
		trackGame(gameId, 'game_won');
	}, [gameId]);

	const applyScores = useCallback((l: number, r: number) => {
		const myTeam = teamOf(mySlotRef.current);
		setScoreMe(myTeam === 0 ? l : r);
		setScoreOpp(myTeam === 0 ? r : l);
		const prev = prevScoreRef.current;
		if (l > prev.l || r > prev.r) { setGoalFlash('BUT !'); setTimeout(() => setGoalFlash(''), 1100); }
		prevScoreRef.current = { l, r };
		if (l >= WIN_GOALS || r >= WIN_GOALS) finish(l, r);
	}, [finish]);

	/* ---------- main loop ---------- */
	const frame = useCallback((now: number) => {
		if (!runningRef.current) return;
		let dtMs = now - lastRef.current; lastRef.current = now;
		if (dtMs > 200) dtMs = 200;
		accRef.current += dtMs;
		const role = roleRef.current, w = worldRef.current, mySlot = mySlotRef.current;

		const dashDir = dashQueuedRef.current; dashQueuedRef.current = 0; // consume the queued double-tap once
		while (accRef.current >= STEP) {
			accRef.current -= STEP;
			const dt = STEP / 1000;
			const inp = readInput(keysRef.current, touchRef.current);
			if (dashDir !== 0) inp.dash = true; // engine's dashT guard ignores repeats within the frame
			const bs = botStRef.current;
			if (role === 'ai') {
				const r = step(w, dt, [inp, botFor(w, 1, bs[1]), botFor(w, 2, bs[2]), botFor(w, 3, bs[3])]);
				if (r.scorer !== null) applyScores(w.score.l, w.score.r);
			} else if (role === 'host') {
				applyPlayerPos(w.players[2], netPosRef.current[2]); // guest from the network
				const live = w.kickoff <= 0;
				if (!live) w.kickoff -= dt;
				stepPlayer(w.players[0], inp, dt);
				stepPlayer(w.players[1], botFor(w, 1, bs[1]), dt);
				stepPlayer(w.players[3], botFor(w, 3, bs[3]), dt);
				separateAll(w.players);
				if (live) {
					const scorer = stepBall(w, dt);
					resolveKicks(w);
					if (scorer !== null) { applyScore(w, scorer); applyScores(w.score.l, w.score.r); }
				} else {
					w.ball.x = FIELD.W / 2; w.ball.y = FIELD.H * 0.3; w.ball.vx = 0; w.ball.vy = 0;
				}
			} else {
				stepPlayer(w.players[2], inp, dt); // guest: only my own cocotte
			}
		}

		// ease networked entities
		const k = 0.32;
		for (let slot = 0; slot < 4; slot++) {
			if (!isNetSlot(role, slot)) continue;
			const t = netPosRef.current[slot], r = slotRenderRef.current[slot];
			r.x += (t.x - r.x) * k; r.y += (t.y - r.y) * k; r.face = t.face;
		}
		if (role === 'guest') { ballRenderRef.current.x += (w.ball.x - ballRenderRef.current.x) * k; ballRenderRef.current.y += (w.ball.y - ballRenderRef.current.y) * k; }

		draw();

		// broadcast
		sendAccRef.current += dtMs;
		if (sendAccRef.current >= 1000 / SEND_HZ) {
			sendAccRef.current = 0;
			const m = matchRef.current;
			if (m && role === 'host') {
				const slots: PosMsg[] = [0, 1, 3].map((s) => ({ slot: s, ...playerPos(w.players[s]) }));
				m.sendState({ ...ballState(w), l: w.score.l, r: w.score.r, ko: w.kickoff, slots } satisfies StateMsg);
			} else if (m && role === 'guest') {
				m.sendPos({ slot: mySlot, ...playerPos(w.players[mySlot]) });
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
		botStRef.current = freshBotSt();
		setScoreMe(0); setScoreOpp(0); setGoalFlash('');
		seedRender();
	}, [seedRender]);

	const startMatch = useCallback((m: Match) => {
		if (startedRef.current) return;
		startedRef.current = true;
		const host = m.isHost();
		roleRef.current = host ? 'host' : 'guest';
		mySlotRef.current = host ? 0 : 2;
		setConfirmQuit(false);
		resetWorld();
		m.onPos((p: PosMsg) => { netPosRef.current[p.slot] = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face }; });
		m.onState((s: StateMsg) => {
			if (roleRef.current !== 'guest') return;
			const w = worldRef.current;
			applyBall(w, s); w.kickoff = s.ko;
			for (const sp of s.slots) netPosRef.current[sp.slot] = { x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy, face: sp.face };
			if (phaseRef.current === 'over' && s.l === 0 && s.r === 0) { setPhase('playing'); startLoop(); } // host restarted
			applyScores(s.l, s.r);
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
		mySlotRef.current = 0;
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
		if (roleRef.current === 'host') {
			const w = worldRef.current;
			const slots: PosMsg[] = [0, 1, 3].map((s) => ({ slot: s, ...playerPos(w.players[s]) }));
			matchRef.current?.sendState({ ...ballState(w), l: 0, r: 0, ko: w.kickoff, slots });
		}
	}, [resetWorld, startLoop]);

	const copyCode = useCallback(() => {
		if (!roomCode) return;
		void navigator.clipboard?.writeText(roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
	}, [roomCode]);

	/* ---------- input ---------- */
	// Two quick presses of the same direction (within DOUBLE_TAP_MS) queue a dash.
	const registerTap = useCallback((dir: 'left' | 'right') => {
		const now = performance.now(), last = lastTapRef.current;
		if (now - last[dir] < DOUBLE_TAP_MS) dashQueuedRef.current = dir === 'left' ? -1 : 1;
		last[dir] = now;
	}, []);

	useEffect(() => {
		const k = keysRef.current;
		const down = (e: KeyboardEvent) => {
			if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
			if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'q') { if (!k.left) registerTap('left'); k.left = true; } // rising edge only (skip auto-repeat)
			else if (e.key === 'ArrowRight' || e.key === 'd') { if (!k.right) registerTap('right'); k.right = true; }
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
	}, [registerTap]);

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
							<span style={{ color: COL_T0 }}>Bleus {teamOf(mySlotRef.current) === 0 ? scoreMe : scoreOpp}</span>
							<span className="fo-sep">—</span>
							<span style={{ color: COL_T1 }}>{teamOf(mySlotRef.current) === 0 ? scoreOpp : scoreMe} Rouges</span>
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
							<p className="fo-sub">2 contre 2 (avec un coéquipier bot). Premier à {WIN_GOALS} buts gagne. Fonce dans le ballon, il part en tir&nbsp;!</p>
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
							<p className="fo-sub">{scoreMe} — {scoreOpp}{oppName ? ` · vs ${oppName}` : ''}</p>
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
						<button className="fo-tbtn" aria-label="Gauche" onPointerDown={(e) => { touch('left', true)(e); registerTap('left'); }} onPointerUp={touch('left', false)} onPointerLeave={touch('left', false)} onPointerCancel={touch('left', false)}>◀</button>
						<button className="fo-tbtn" aria-label="Droite" onPointerDown={(e) => { touch('right', true)(e); registerTap('right'); }} onPointerUp={touch('right', false)} onPointerLeave={touch('right', false)} onPointerCancel={touch('right', false)}>▶</button>
					</div>
					<button className="fo-tbtn fo-jump" aria-label="Sauter" onPointerDown={touch('jump', true)} onPointerUp={touch('jump', false)} onPointerLeave={touch('jump', false)} onPointerCancel={touch('jump', false)}>⤴ SAUT</button>
				</div>
			)}

			<p className="fo-help">Déplace-toi ◀ ▶ et appuie sur Saut pour bondir — <strong>re-tape Saut en l'air pour planer</strong>. <strong>Double-tape ◀◀ / ▶▶ pour un dash-éclair</strong> qui bouscule les autres poules. Fonce dans le ballon pour tirer (il décolle au sol). Clavier : ← → et Espace / ↑. Tu es la cocotte cerclée d’or.</p>
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
.fo-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(10,14,20,0.55); backdrop-filter: blur(2px); }
.fo-card { background: var(--gray-999); border: 2px solid var(--fo-accent); border-radius: 16px; padding: 20px 26px; box-shadow: var(--shadow-lg); text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; max-width: 360px; width: 88%; max-height: 90vh; overflow-y: auto; }
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
