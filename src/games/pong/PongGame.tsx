import { useState, useEffect, useRef, useCallback } from 'react';
import { PONG, createState, serve, movePaddle, stepBall, type PongState } from './engine';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, type Match, type PaddleMsg } from './net';
import { mulberry32 } from '../prng';
import { playerName, setPlayerName } from '../../lib/leaderboard';

type Phase = 'menu' | 'waiting' | 'playing' | 'over';
type Role = 'host' | 'guest' | 'ai';

const SEND_HZ = 30;
const VIEW_W = 800;
const VIEW_H = 480;
const SCALE = VIEW_W / PONG.W; // field units → backing pixels
const COL_ME = '#4da3ff';
const COL_OPP = '#ff5a5f';

const randSeed = (): number => Math.floor(Math.random() * 2 ** 31);

export default function PongGame({ gameId }: { gameId: string }) {
	void gameId;
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

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const runningRef = useRef(false);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const sendAccRef = useRef(0);

	const matchRef = useRef<Match | null>(null);
	const roleRef = useRef<Role>('ai');
	const startedRef = useRef(false);

	const stateRef = useRef<PongState>(createState(mulberry32(1)));
	const rngRef = useRef(mulberry32(1));
	const myYRef = useRef(PONG.H / 2); // guest's own paddle (right side)
	const oppPaddleRef = useRef(PONG.H / 2); // host: guest paddle received
	const renderBallRef = useRef({ x: PONG.W / 2, y: PONG.H / 2 }); // guest: eased ball
	const renderOppYRef = useRef(PONG.H / 2); // guest: eased opponent paddle

	const inputDirRef = useRef(0); // keyboard -1 up / +1 down
	const pointerYRef = useRef<number | null>(null); // drag target (field units)

	useEffect(() => {
		setName(playerName());
	}, []);

	/* ---------- rendering ---------- */
	const draw = useCallback((s: PongState, ballX: number, ballY: number, leftY: number, rightY: number) => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const side = roleRef.current === 'guest' ? 'right' : 'left';

		ctx.fillStyle = '#0b0e14';
		ctx.fillRect(0, 0, VIEW_W, VIEW_H);
		// centre dashed line
		ctx.strokeStyle = 'rgba(255,255,255,0.18)';
		ctx.lineWidth = 3;
		ctx.setLineDash([10, 16]);
		ctx.beginPath();
		ctx.moveTo(VIEW_W / 2, 0);
		ctx.lineTo(VIEW_W / 2, VIEW_H);
		ctx.stroke();
		ctx.setLineDash([]);

		const pw = PONG.paddleW * SCALE;
		const ph = PONG.paddleH * SCALE;
		// left paddle
		ctx.fillStyle = side === 'left' ? COL_ME : COL_OPP;
		ctx.fillRect(0, leftY * SCALE - ph / 2, pw, ph);
		// right paddle
		ctx.fillStyle = side === 'right' ? COL_ME : COL_OPP;
		ctx.fillRect(VIEW_W - pw, rightY * SCALE - ph / 2, pw, ph);
		// ball
		ctx.fillStyle = '#f4f6fb';
		ctx.beginPath();
		ctx.arc(ballX * SCALE, ballY * SCALE, PONG.ballR * SCALE, 0, Math.PI * 2);
		ctx.fill();
		void s;
	}, []);

	/* ---------- main loop ---------- */
	const finishIfWon = useCallback((sL: number, sR: number) => {
		if (sL < PONG.maxScore && sR < PONG.maxScore) return false;
		const side = roleRef.current === 'guest' ? 'right' : 'left';
		const myScore = side === 'left' ? sL : sR;
		setYouWon(myScore >= PONG.maxScore);
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		setPhase('over');
		return true;
	}, []);

	const aiMove = useCallback((y: number, s: PongState, dt: number): number => {
		// Track the ball when it comes toward the AI (right side); else drift to centre. Capped speed → beatable.
		const target = s.bvx > 0 ? s.by : PONG.H / 2;
		const cap = PONG.paddleSpeed * 0.82 * dt;
		const move = Math.max(-cap, Math.min(cap, target - y));
		return Math.max(PONG.paddleH / 2, Math.min(PONG.H - PONG.paddleH / 2, y + move));
	}, []);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min((now - lastRef.current) / 1000, 0.05);
			lastRef.current = now;
			const role = roleRef.current;
			const s = stateRef.current;

			// My paddle position from input (pointer drag has priority, else keyboard).
			const myUpdate = (y: number): number => {
				if (pointerYRef.current != null) {
					const target = Math.max(PONG.paddleH / 2, Math.min(PONG.H - PONG.paddleH / 2, pointerYRef.current));
					const step = PONG.paddleSpeed * 1.8 * dt;
					return y + Math.max(-step, Math.min(step, target - y));
				}
				return movePaddle(y, inputDirRef.current, dt);
			};

			if (role === 'guest') {
				myYRef.current = myUpdate(myYRef.current);
				sendAccRef.current += dt;
				if (sendAccRef.current >= 1 / SEND_HZ) {
					sendAccRef.current = 0;
					matchRef.current?.sendPaddle(myYRef.current);
				}
				// Ease rendered ball/opponent toward the latest authoritative state.
				const k = Math.min(1, dt * 22);
				renderBallRef.current.x += (s.bx - renderBallRef.current.x) * k;
				renderBallRef.current.y += (s.by - renderBallRef.current.y) * k;
				renderOppYRef.current += (s.leftY - renderOppYRef.current) * k;
				draw(s, renderBallRef.current.x, renderBallRef.current.y, renderOppYRef.current, myYRef.current);
				if (finishIfWon(s.scoreL, s.scoreR)) return;
			} else {
				// host or ai: authoritative simulation. My paddle = left, opponent = right.
				s.leftY = myUpdate(s.leftY);
				s.rightY = role === 'ai' ? aiMove(s.rightY, s, dt) : oppPaddleRef.current;
				const r = stepBall(s, dt);
				stateRef.current = r.state;
				if (r.scored) {
					setScoreMe(r.state.scoreL);
					setScoreOpp(r.state.scoreR);
					stateRef.current = serve(r.state, rngRef.current, r.scored === 'left'); // serve toward the loser
				}
				const st = stateRef.current;
				if (role === 'host') {
					sendAccRef.current += dt;
					if (sendAccRef.current >= 1 / SEND_HZ) {
						sendAccRef.current = 0;
						matchRef.current?.sendState(st);
					}
				}
				draw(st, st.bx, st.by, st.leftY, st.rightY);
				if (finishIfWon(st.scoreL, st.scoreR)) return;
			}
			rafRef.current = requestAnimationFrame(frame);
		},
		[draw, finishIfWon, aiMove],
	);

	const startLoop = useCallback(() => {
		runningRef.current = true;
		lastRef.current = performance.now();
		sendAccRef.current = 0;
		rafRef.current = requestAnimationFrame(frame);
	}, [frame]);

	/* ---------- match lifecycle ---------- */
	const startMatch = useCallback(
		(m: Match) => {
			if (startedRef.current) return;
			startedRef.current = true;
			const host = m.isHost();
			roleRef.current = host ? 'host' : 'guest';
			setScoreMe(0);
			setScoreOpp(0);
			myYRef.current = PONG.H / 2;
			oppPaddleRef.current = PONG.H / 2;
			renderBallRef.current = { x: PONG.W / 2, y: PONG.H / 2 };
			renderOppYRef.current = PONG.H / 2;

			if (host) {
				rngRef.current = mulberry32(randSeed());
				stateRef.current = createState(rngRef.current);
				m.sendState(stateRef.current);
			} else {
				stateRef.current = createState(mulberry32(1)); // placeholder until first state arrives
			}

			m.onPaddle((p: PaddleMsg) => {
				if (roleRef.current === 'host') oppPaddleRef.current = p.y;
			});
			m.onState((st: PongState) => {
				if (roleRef.current === 'guest') {
					stateRef.current = st;
					setScoreMe(st.scoreR);
					setScoreOpp(st.scoreL);
				}
			});

			setPhase('playing');
			startLoop();
		},
		[startLoop],
	);

	const beginNetMatch = useCallback(
		(m: Match) => {
			matchRef.current = m;
			startedRef.current = false;
			setPhase('waiting');
			m.onPeers((peers) => {
				if (peers[0]) setOppName(peers[0].name || 'Adversaire');
				if (peers.length >= 1) {
					startMatch(m);
				} else if (startedRef.current) {
					// opponent left mid-game
					setStatus('Adversaire parti.');
					quitToMenu();
				}
			});
		},
		[startMatch],
	);

	const quitToMenu = useCallback(() => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		startedRef.current = false;
		matchRef.current?.leave();
		matchRef.current = null;
		setPhase('menu');
	}, []);

	/* ---------- menu actions ---------- */
	const ensureName = useCallback((): string | null => {
		const nm = (name || playerName()).trim();
		if (!nm) {
			setStatus('Entre un pseudo.');
			return null;
		}
		setPlayerName(nm);
		return nm;
	}, [name]);

	const playQuick = useCallback(async () => {
		const nm = ensureName();
		if (!nm) return;
		if (!multiplayerAvailable()) {
			setStatus('Multijoueur non configuré.');
			return;
		}
		setStatus('Recherche d\'un adversaire…');
		setRoomCode(null);
		const m = await joinRandom(nm);
		if (!m) {
			setStatus('Aucune partie disponible, réessaie.');
			return;
		}
		setStatus('');
		beginNetMatch(m);
	}, [ensureName, beginNetMatch]);

	const playJoinCode = useCallback(async () => {
		const nm = ensureName();
		if (!nm) return;
		const code = codeInput.trim().toUpperCase();
		if (code.length < 3) {
			setStatus('Entre le code reçu.');
			return;
		}
		setStatus('Connexion…');
		const m = await joinByCode(nm, code);
		if (!m) {
			setStatus('Partie introuvable ou pleine.');
			return;
		}
		setStatus('');
		setRoomCode(code);
		beginNetMatch(m);
	}, [ensureName, codeInput, beginNetMatch]);

	const playCreateCode = useCallback(async () => {
		const nm = ensureName();
		if (!nm) return;
		if (!multiplayerAvailable()) {
			setStatus('Multijoueur non configuré.');
			return;
		}
		const code = makeCode();
		setStatus('');
		const m = await joinByCode(nm, code);
		if (!m) {
			setStatus('Réessaie.');
			return;
		}
		setRoomCode(code);
		beginNetMatch(m);
	}, [ensureName, beginNetMatch]);

	const playAI = useCallback(() => {
		const nm = ensureName();
		if (!nm) return;
		matchRef.current = null;
		roleRef.current = 'ai';
		startedRef.current = true;
		setOppName('Ordinateur');
		setScoreMe(0);
		setScoreOpp(0);
		myYRef.current = PONG.H / 2;
		rngRef.current = mulberry32(randSeed());
		stateRef.current = createState(rngRef.current);
		setRoomCode(null);
		setPhase('playing');
		startLoop();
	}, [ensureName, startLoop]);

	const rematch = useCallback(() => {
		if (roleRef.current === 'guest') return; // host (or AI) controls the restart
		setScoreMe(0);
		setScoreOpp(0);
		rngRef.current = mulberry32(randSeed());
		stateRef.current = createState(rngRef.current);
		if (roleRef.current === 'host') matchRef.current?.sendState(stateRef.current);
		setPhase('playing');
		startLoop();
	}, [startLoop]);

	// Guest auto-resumes when the host serves a fresh game after a game-over.
	useEffect(() => {
		if (phase !== 'over' || roleRef.current !== 'guest') return;
		const m = matchRef.current;
		if (!m) return;
		m.onState((st: PongState) => {
			stateRef.current = st;
			setScoreMe(st.scoreR);
			setScoreOpp(st.scoreL);
			if (st.scoreL === 0 && st.scoreR === 0) {
				setPhase('playing');
				startLoop();
			}
		});
	}, [phase, startLoop]);

	/* ---------- input ---------- */
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (['ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
			if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'z') inputDirRef.current = -1;
			else if (e.key === 'ArrowDown' || e.key === 's') inputDirRef.current = 1;
		};
		const up = (e: KeyboardEvent) => {
			if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'z') && inputDirRef.current === -1) inputDirRef.current = 0;
			else if ((e.key === 'ArrowDown' || e.key === 's') && inputDirRef.current === 1) inputDirRef.current = 0;
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	}, []);

	const pointer = (e: React.PointerEvent) => {
		const cv = canvasRef.current;
		if (!cv) return;
		const rect = cv.getBoundingClientRect();
		pointerYRef.current = ((e.clientY - rect.top) / rect.height) * PONG.H;
	};
	const pointerEnd = () => {
		pointerYRef.current = null;
	};

	useEffect(() => () => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		matchRef.current?.leave();
	}, []);

	const mpOff = !multiplayerAvailable();

	return (
		<div className="pg-root">
			<style>{CSS}</style>
			<div className="pg-stage">
				<canvas
					ref={canvasRef}
					width={VIEW_W}
					height={VIEW_H}
					className="pg-canvas"
					role="img"
					aria-label="Pong"
					onPointerDown={pointer}
					onPointerMove={(e) => pointerYRef.current != null && pointer(e)}
					onPointerUp={pointerEnd}
					onPointerLeave={pointerEnd}
				/>

				{phase === 'playing' && (
					<div className="pg-hud">
						<span style={{ color: COL_ME }}>Toi {scoreMe}</span>
						<span className="pg-sep">—</span>
						<span style={{ color: COL_OPP }}>{scoreOpp} {oppName}</span>
					</div>
				)}

				{phase === 'menu' && (
					<div className="pg-overlay">
						<div className="pg-card">
							<h2>Pong</h2>
							<p className="pg-sub">Premier à {PONG.maxScore} points gagne.</p>
							<input className="pg-name" value={name} maxLength={20} placeholder="Ton pseudo" onChange={(e) => setName(e.target.value)} />
							<button className="pg-btn pg-primary" disabled={mpOff} onClick={playQuick}>⚡ Partie rapide</button>
							<button className="pg-btn" disabled={mpOff} onClick={() => setCodePanel((v) => !v)}>🔑 Jouer avec un code</button>
							{codePanel && !mpOff && (
								<div className="pg-codepanel">
									<button className="pg-btn pg-small" onClick={playCreateCode}>Créer une partie</button>
									<div className="pg-coderow">
										<input className="pg-name pg-code" value={codeInput} maxLength={6} placeholder="CODE" onChange={(e) => setCodeInput(e.target.value.toUpperCase())} />
										<button className="pg-btn pg-small" onClick={playJoinCode}>Rejoindre</button>
									</div>
								</div>
							)}
							<button className="pg-btn" onClick={playAI}>🤖 Entraînement (vs ordinateur)</button>
							{status && <p className="pg-status">{status}</p>}
							{mpOff && <p className="pg-status">Multijoueur non configuré — seul l'entraînement est dispo.</p>}
						</div>
					</div>
				)}

				{phase === 'waiting' && (
					<div className="pg-overlay">
						<div className="pg-card">
							<h2>En attente d'un adversaire…</h2>
							{roomCode && (
								<>
									<p className="pg-sub">Partage ce code :</p>
									<div className="pg-bigcode">{roomCode}</div>
								</>
							)}
							<div className="pg-spinner" />
							<button className="pg-btn" onClick={quitToMenu}>Annuler</button>
						</div>
					</div>
				)}

				{phase === 'over' && (
					<div className="pg-overlay">
						<div className="pg-card">
							<h2>{youWon ? '🏆 Gagné !' : 'Perdu'}</h2>
							<p className="pg-sub">Toi {scoreMe} — {scoreOpp} {oppName}</p>
							{roleRef.current !== 'guest' ? (
								<button className="pg-btn pg-primary" onClick={rematch}>Rejouer</button>
							) : (
								<p className="pg-status">En attente que l'hôte relance…</p>
							)}
							<button className="pg-btn" onClick={quitToMenu}>Quitter</button>
						</div>
					</div>
				)}
			</div>

			{phase === 'playing' && <p className="pg-hint">Flèches ↑ ↓ (ou Z/S) · ou glisse le doigt sur le terrain</p>}
		</div>
	);
}

const CSS = `
.pg-root { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; width: 100%; }
.pg-stage { position: relative; width: 100%; max-width: 680px; aspect-ratio: 5 / 3; }
.pg-canvas { width: 100%; height: 100%; display: block; border-radius: 14px; background: #0b0e14; touch-action: none; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
.pg-hud { position: absolute; top: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 0.5rem; font-family: var(--font-brand); font-weight: 700; font-size: 1.1rem; pointer-events: none; text-shadow: 0 1px 4px rgba(0,0,0,0.6); }
.pg-sep { color: var(--gray-300); }
.pg-overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(8,10,18,0.55); border-radius: 14px; padding: 1rem; }
.pg-card { background: var(--gray-999, #0c0e14); border: 1px solid var(--gray-800, #2a2f3a); border-radius: 16px; padding: 1.25rem; width: min(340px, 100%); display: flex; flex-direction: column; gap: 0.6rem; text-align: center; }
.pg-card h2 { margin: 0; font-size: var(--text-xl); }
.pg-sub { margin: 0; color: var(--gray-300); font-size: var(--text-sm); }
.pg-name { padding: 0.6rem 0.8rem; border-radius: 10px; border: 1px solid var(--gray-700, #3a4150); background: var(--gray-900, #14171f); color: var(--gray-0, #fff); font-size: 1rem; text-align: center; }
.pg-code { text-transform: uppercase; letter-spacing: 0.2em; }
.pg-coderow { display: flex; gap: 0.5rem; }
.pg-coderow .pg-name { flex: 1; }
.pg-codepanel { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; border: 1px dashed var(--gray-700, #3a4150); border-radius: 12px; }
.pg-btn { padding: 0.6rem 0.9rem; border-radius: 10px; border: 1px solid var(--gray-700, #3a4150); background: transparent; color: var(--gray-0, #fff); font-weight: 600; cursor: pointer; }
.pg-btn:hover:not(:disabled) { border-color: var(--accent-regular, #b07cff); }
.pg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pg-primary { background: var(--accent-regular, #7611a6); border-color: transparent; }
.pg-small { padding: 0.45rem 0.7rem; font-size: var(--text-sm); }
.pg-bigcode { font-family: var(--font-brand); font-size: 2rem; font-weight: 800; letter-spacing: 0.3em; color: var(--accent-regular, #b07cff); }
.pg-status { margin: 0; color: var(--gray-300); font-size: var(--text-sm); }
.pg-hint { color: var(--gray-400); font-size: var(--text-sm); text-align: center; margin: 0; }
.pg-spinner { width: 28px; height: 28px; border: 3px solid var(--gray-700, #3a4150); border-top-color: var(--accent-regular, #b07cff); border-radius: 50%; margin: 0.25rem auto; animation: pg-spin 0.8s linear infinite; }
@keyframes pg-spin { to { transform: rotate(360deg); } }
`;
