import { useState, useEffect, useRef, useCallback } from 'react';
import { PONG, createState, serve, movePaddle, stepBall, activatePower, addPickup, type PongState, type PowerId } from './engine';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, type Match, type PaddleMsg } from './net';
import { mulberry32 } from '../prng';
import { playerName, setPlayerName } from '../../lib/leaderboard';
import { useLevels } from '../../lib/useLevels';
import { pongLevels, type PongLevelCfg } from './levels';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';

type Phase = 'menu' | 'waiting' | 'playing' | 'over';
type Role = 'host' | 'guest' | 'ai';

const SEND_HZ = 30;
const VIEW_W = 800;
const VIEW_H = 480;
const SCALE = VIEW_W / PONG.W; // field units → backing pixels
const COL_ME = '#4da3ff';
const COL_OPP = '#ff5a5f';

const POWERS: { id: PowerId; icon: string; label: string }[] = [
	{ id: 'speed', icon: '⚡', label: 'Speed max' },
	{ id: 'curve', icon: '🌀', label: 'Trajectoire courbée' },
	{ id: 'jam', icon: '🌫️', label: 'Brouillage' },
	{ id: 'big', icon: '🛡️', label: 'Raquette XXL' },
];
const POWER_COLOR: Record<PowerId, string> = { speed: '#ffd60a', curve: '#b07cff', jam: '#7fd0ff', big: '#30d158' };
const POWER_ICON: Record<PowerId, string> = { speed: '⚡', curve: '🌀', jam: '🌫️', big: '🛡️' };

const randSeed = (): number => Math.floor(Math.random() * 2 ** 31);

export default function PongGame({ gameId }: { gameId: string }) {
	const lv = useLevels<PongLevelCfg>(gameId, pongLevels);
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
	const [myCharge, setMyCharge] = useState(0); // 0..chargeNeed (for the power bar)
	const [powers, setPowers] = useState(true); // menu choice: power-ups vs classic
	const [powersUi, setPowersUi] = useState(true); // whether the running match has powers (drives UI)

	const aiPowerCdRef = useRef(0); // AI power cooldown
	const chargeRef = useRef(0); // last pushed charge value (avoid setState every frame)
	const levelCfgRef = useRef<PongLevelCfg | null>(null); // non-null → levels match (ramps AI + serve speed)
	const targetRef = useRef(PONG.maxScore); // points to win the current match

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
	const decoysRef = useRef<{ x: number; y: number }[]>([]); // jam decoy balls
	const jamFrameRef = useRef(0);
	const spawnAccRef = useRef(0); // ground power-up spawn timer (host/ai)
	const chosenPowersRef = useRef(true); // mode picked at the menu, read when the match starts

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
		const phBase = PONG.paddleH * SCALE;
		const phL = phBase * (s.bigLT > 0 ? PONG.bigMult : 1);
		const phR = phBase * (s.bigRT > 0 ? PONG.bigMult : 1);
		// left paddle
		ctx.fillStyle = side === 'left' ? COL_ME : COL_OPP;
		ctx.fillRect(0, leftY * SCALE - phL / 2, pw, phL);
		// right paddle
		ctx.fillStyle = side === 'right' ? COL_ME : COL_OPP;
		ctx.fillRect(VIEW_W - pw, rightY * SCALE - phR / 2, pw, phR);
		// ground power-ups
		for (const p of s.pickups) {
			const px = p.x * SCALE, py = p.y * SCALE, pr = PONG.pickupR * SCALE;
			ctx.fillStyle = POWER_COLOR[p.power];
			ctx.beginPath();
			ctx.arc(px, py, pr, 0, Math.PI * 2);
			ctx.fill();
			ctx.font = `${pr * 1.2}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(POWER_ICON[p.power], px, py + 1);
		}
		// Jam: while the ball is on the jammed player's half, a few decoy balls flicker right
		// around the real one — same look, so you can't tell which is the real ball.
		const r = PONG.ballR * SCALE;
		const ballInLeft = ballX < PONG.W / 2;
		const jammedHere = (s.jamLT > 0 && ballInLeft) || (s.jamRT > 0 && !ballInLeft);
		ctx.fillStyle = s.curveT > 0 ? '#ffd60a' : '#f4f6fb'; // tinted while curving
		if (jammedHere) {
			const RAD = 26; // neighbourhood radius around the ball (field units)
			jamFrameRef.current += 1;
			if (decoysRef.current.length === 0 || jamFrameRef.current % 5 === 0) {
				decoysRef.current = Array.from({ length: 3 }, () => {
					const a = Math.random() * Math.PI * 2;
					const d = Math.random() * RAD;
					return {
						x: Math.max(0, Math.min(VIEW_W, (ballX + Math.cos(a) * d) * SCALE)),
						y: Math.max(0, Math.min(VIEW_H, (ballY + Math.sin(a) * d) * SCALE)),
					};
				});
			}
			for (const d of decoysRef.current) {
				ctx.beginPath();
				ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			decoysRef.current = [];
		}
		// real ball — hidden while jammed (only the flickering decoys show its rough area)
		if (!jammedHere) {
			ctx.beginPath();
			ctx.arc(ballX * SCALE, ballY * SCALE, r, 0, Math.PI * 2);
			ctx.fill();
		}
		// Serve pause: dim, show the score, and an expanding ring around the frozen ball.
		if (s.serveT > 0) {
			const p = s.serveT / PONG.serveDelay; // 1 → 0
			ctx.fillStyle = `rgba(8,10,18,${0.5 * p})`;
			ctx.fillRect(0, 0, VIEW_W, VIEW_H);
			ctx.fillStyle = '#f4f6fb';
			ctx.font = 'bold 72px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(`${s.scoreL} — ${s.scoreR}`, VIEW_W / 2, VIEW_H / 2);
			ctx.strokeStyle = `rgba(255,214,10,${p})`;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(ballX * SCALE, ballY * SCALE, PONG.ballR * SCALE * (1 + (1 - p) * 4), 0, Math.PI * 2);
			ctx.stroke();
		}
	}, []);

	/* ---------- main loop ---------- */
	const finishIfWon = useCallback((sL: number, sR: number) => {
		const target = targetRef.current;
		if (sL < target && sR < target) return false;
		// Solo: I'm always the left paddle (levels + AI training). Guest is right in net play.
		const side = roleRef.current === 'guest' ? 'right' : 'left';
		const myScore = side === 'left' ? sL : sR;
		const oppScore = side === 'left' ? sR : sL;
		const won = myScore >= target;
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		if (levelCfgRef.current) {
			// Levels match: grade by winning margin (opponent points conceded). No 'over' overlay.
			lv.finish({ won, score: target - oppScore, raw: { my: myScore, opp: oppScore } });
			return true;
		}
		setYouWon(won);
		setPhase('over');
		return true;
	}, [lv]);

	const aiMove = useCallback((y: number, s: PongState, dt: number): number => {
		// Track the ball when it comes toward the AI (right side); else drift to centre. Capped speed → beatable.
		// Levels ramp the reaction cap + add aim jitter so the AI gets sharper with the level.
		const cfg = levelCfgRef.current;
		const jitter = cfg ? (Math.random() * 2 - 1) * cfg.aiError : 0;
		const target = s.bvx > 0 ? s.by + jitter : PONG.H / 2;
		const cap = PONG.paddleSpeed * (cfg ? cfg.aiReaction : 0.82) * dt;
		const move = Math.max(-cap, Math.min(cap, target - y));
		return Math.max(PONG.paddleH / 2, Math.min(PONG.H - PONG.paddleH / 2, y + move));
	}, []);

	const syncCharge = useCallback((c: number) => {
		if (c !== chargeRef.current) {
			chargeRef.current = c;
			setMyCharge(c);
		}
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
				syncCharge(s.chargeR);
				if (finishIfWon(s.scoreL, s.scoreR)) return;
			} else {
				// host or ai: authoritative simulation. My paddle = left, opponent = right.
				// Spawn ground power-ups over time (host owns them; broadcast in state).
				spawnAccRef.current += dt;
				if (s.powersOn && spawnAccRef.current >= PONG.pickupEvery) {
					spawnAccRef.current = 0;
					if (s.pickups.length < PONG.maxPickups) {
						const x = PONG.W * 0.25 + rngRef.current() * PONG.W * 0.5;
						const y = PONG.pickupR + rngRef.current() * (PONG.H - 2 * PONG.pickupR);
						const power = POWERS[Math.floor(rngRef.current() * POWERS.length)].id;
						s.pickups = addPickup(s, x, y, power).pickups;
					}
				}
				s.leftY = myUpdate(s.leftY);
				s.rightY = role === 'ai' ? aiMove(s.rightY, s, dt) : oppPaddleRef.current;
				if (role === 'ai') {
					// AI spends a full charge on a random power, with a cooldown.
					aiPowerCdRef.current -= dt;
					if (s.chargeR >= PONG.chargeNeed && aiPowerCdRef.current <= 0) {
						const pick = POWERS[Math.floor(Math.random() * POWERS.length)].id;
						Object.assign(s, activatePower(s, 'right', pick));
						aiPowerCdRef.current = 1.2 + Math.random() * 1.6;
					}
				}
				const r = stepBall(s, dt);
				stateRef.current = r.state;
				if (r.scored) {
					setScoreMe(r.state.scoreL);
					setScoreOpp(r.state.scoreR);
					const ss = levelCfgRef.current?.serveSpeed ?? PONG.serveSpeed;
					stateRef.current = serve(r.state, rngRef.current, r.scored === 'left', ss); // serve toward the loser
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
				syncCharge(st.chargeL);
				if (finishIfWon(st.scoreL, st.scoreR)) return;
			}
			rafRef.current = requestAnimationFrame(frame);
		},
		[draw, finishIfWon, aiMove, syncCharge],
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
			setConfirmQuit(false);
			levelCfgRef.current = null;
			targetRef.current = PONG.maxScore;
			chargeRef.current = 0;
			setMyCharge(0);
			aiPowerCdRef.current = 0;
		spawnAccRef.current = 0;
			setScoreMe(0);
			setScoreOpp(0);
			myYRef.current = PONG.H / 2;
			oppPaddleRef.current = PONG.H / 2;
			renderBallRef.current = { x: PONG.W / 2, y: PONG.H / 2 };
			renderOppYRef.current = PONG.H / 2;

			if (host) {
				rngRef.current = mulberry32(randSeed());
				stateRef.current = createState(rngRef.current, chosenPowersRef.current);
				setPowersUi(chosenPowersRef.current);
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
					setPowersUi(st.powersOn); // adopt host's mode
				}
			});
			m.onPower((p) => {
				if (roleRef.current === 'host') stateRef.current = activatePower(stateRef.current, 'right', p); // guest's power
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
		setConfirmQuit(false);
		setPhase('menu');
	}, []);

	const copyCode = useCallback(() => {
		if (!roomCode) return;
		void navigator.clipboard?.writeText(roomCode).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [roomCode]);

	const triggerPower = useCallback((power: PowerId) => {
		const role = roleRef.current;
		if (role === 'guest') matchRef.current?.sendPower(power);
		else stateRef.current = activatePower(stateRef.current, 'left', power); // host/ai activate their own (left)
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
		chosenPowersRef.current = powers;
		const m = await joinRandom(nm, powers);
		if (!m) {
			setStatus('Aucune partie disponible, réessaie.');
			return;
		}
		setStatus('');
		beginNetMatch(m);
	}, [ensureName, beginNetMatch, powers]);

	const playJoinCode = useCallback(async () => {
		const nm = ensureName();
		if (!nm) return;
		const code = codeInput.trim().toUpperCase();
		if (code.length < 3) {
			setStatus('Entre le code reçu.');
			return;
		}
		setStatus('Connexion…');
		chosenPowersRef.current = powers;
		const m = await joinByCode(nm, code);
		if (!m) {
			setStatus('Partie introuvable ou pleine.');
			return;
		}
		setStatus('');
		setRoomCode(code);
		beginNetMatch(m);
	}, [ensureName, codeInput, beginNetMatch, powers]);

	const playCreateCode = useCallback(async () => {
		const nm = ensureName();
		if (!nm) return;
		if (!multiplayerAvailable()) {
			setStatus('Multijoueur non configuré.');
			return;
		}
		const code = makeCode();
		setStatus('');
		chosenPowersRef.current = powers;
		const m = await joinByCode(nm, code);
		if (!m) {
			setStatus('Réessaie.');
			return;
		}
		setRoomCode(code);
		beginNetMatch(m);
	}, [ensureName, beginNetMatch, powers]);

	const playAI = useCallback(() => {
		const nm = ensureName();
		if (!nm) return;
		matchRef.current = null;
		roleRef.current = 'ai';
		startedRef.current = true;
		setConfirmQuit(false);
		levelCfgRef.current = null;
		targetRef.current = PONG.maxScore;
		chargeRef.current = 0;
		setMyCharge(0);
		aiPowerCdRef.current = 0;
		spawnAccRef.current = 0;
		setOppName('Ordinateur');
		setScoreMe(0);
		setScoreOpp(0);
		myYRef.current = PONG.H / 2;
		rngRef.current = mulberry32(randSeed());
		chosenPowersRef.current = powers;
		stateRef.current = createState(rngRef.current, powers);
		setPowersUi(powers);
		setRoomCode(null);
		setPhase('playing');
		startLoop();
	}, [ensureName, startLoop, powers]);

	/* ---------- levels mode ---------- */
	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		levelCfgRef.current = cfg;
		targetRef.current = cfg.target;
		matchRef.current = null;
		roleRef.current = 'ai';
		startedRef.current = true;
		setConfirmQuit(false);
		chargeRef.current = 0;
		setMyCharge(0);
		aiPowerCdRef.current = 0;
		spawnAccRef.current = 0;
		setOppName('Ordinateur');
		setScoreMe(0);
		setScoreOpp(0);
		myYRef.current = PONG.H / 2;
		rngRef.current = mulberry32(cfg.seed);
		stateRef.current = createState(rngRef.current, false, cfg.serveSpeed); // classic pong for a clean skill signal
		setPowersUi(false);
		setRoomCode(null);
		setPhase('playing');
		startLoop();
	}, [lv, startLoop]);

	const armLevels = useCallback(() => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		levelCfgRef.current = null;
		targetRef.current = PONG.maxScore;
		matchRef.current = null;
		startedRef.current = false;
		setConfirmQuit(false);
		setPhase('menu');
		lv.enter();
	}, [lv]);

	const exitLevels = useCallback(() => {
		runningRef.current = false;
		cancelAnimationFrame(rafRef.current);
		levelCfgRef.current = null;
		targetRef.current = PONG.maxScore;
		startedRef.current = false;
		lv.exit();
		setPhase('menu');
	}, [lv]);

	const rematch = useCallback(() => {
		if (roleRef.current === 'guest') return; // host (or AI) controls the restart
		setConfirmQuit(false);
		chargeRef.current = 0;
		setMyCharge(0);
		aiPowerCdRef.current = 0;
		spawnAccRef.current = 0;
		setScoreMe(0);
		setScoreOpp(0);
		rngRef.current = mulberry32(randSeed());
		stateRef.current = createState(rngRef.current, chosenPowersRef.current);
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
			else if (e.key >= '1' && e.key <= '4') triggerPower(POWERS[Number(e.key) - 1].id); // engine ignores it if the meter isn't full
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
	}, [triggerPower]);

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

	const levelHint = lv.playing && levelCfgRef.current
		? `Niveau ${lv.level} · premier à ${targetRef.current} pts`
		: null;

	return (
		<div className="pg-root">
			<style>{CSS}</style>

			{/* Pong has no daily challenge, so a 2-segment toggle (Play vs Levels) instead of ModeToggle. */}
			<div className="pg-modetoggle" role="tablist" aria-label="Mode">
				<button
					role="tab"
					aria-selected={!lv.active}
					className={`pg-modeseg ${!lv.active ? 'active' : ''}`}
					onClick={() => { if (lv.active) exitLevels(); }}
				>
					🎮 Jouer
				</button>
				<button
					role="tab"
					aria-selected={lv.active}
					className={`pg-modeseg ${lv.active ? 'active' : ''}`}
					onClick={armLevels}
				>
					🎯 Niveaux
				</button>
			</div>

			{lv.active && (
				<div className="pg-leveltag">
					{lv.menu ? 'Progression — bats l\'ordi pour débloquer le niveau suivant' : levelHint}
				</div>
			)}

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
					<>
						<div className="pg-hud">
							<span style={{ color: COL_ME }}>Toi {scoreMe}</span>
							<span className="pg-sep">—</span>
							<span style={{ color: COL_OPP }}>{scoreOpp} {oppName}</span>
						</div>
						<button className="pg-quit" onClick={() => (lv.active ? lv.backToMenu() : setConfirmQuit(true))}>✕ Quitter</button>
					</>
				)}

				{lv.menu && (
					<div className="pg-leveloverlay">
						<LevelSelect progress={lv.progress} onPick={startLevel} />
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={pongLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={`Toi ${scoreMe} — ${scoreOpp} Ordi`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}

				{confirmQuit && (
					<div className="pg-overlay">
						<div className="pg-card">
							<h2>Quitter la partie ?</h2>
							<button className="pg-btn pg-primary" onClick={quitToMenu}>Oui, quitter</button>
							<button className="pg-btn" onClick={() => setConfirmQuit(false)}>Continuer</button>
						</div>
					</div>
				)}

				{phase === 'menu' && !lv.active && (
					<div className="pg-overlay">
						<div className="pg-card">
							<h2>Pong</h2>
							<p className="pg-sub">Premier à {PONG.maxScore} points gagne.</p>
							<div className="pg-modes" role="tablist" aria-label="Mode de jeu">
								<button role="tab" aria-selected={!powers} className={`pg-mode ${!powers ? 'active' : ''}`} onClick={() => setPowers(false)}>Classique</button>
								<button role="tab" aria-selected={powers} className={`pg-mode ${powers ? 'active' : ''}`} onClick={() => setPowers(true)}>Power-ups</button>
							</div>
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
									<p className="pg-sub">Partage ce code (clique pour copier) :</p>
									<button className="pg-bigcode" onClick={copyCode}>{roomCode}</button>
									<p className="pg-copyhint">{copied ? 'Copié !' : ''}</p>
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

			{phase === 'playing' && powersUi && (
				<div className="pg-powerbar">
					<div className="pg-meter" aria-label={`Jauge de pouvoir ${myCharge}/${PONG.chargeNeed}`}>
						{Array.from({ length: PONG.chargeNeed }, (_, i) => (
							<i key={i} className={i < myCharge ? 'on' : ''} />
						))}
					</div>
					<div className="pg-powers">
						{POWERS.map((p) => (
							<button key={p.id} className="pg-power" disabled={myCharge < PONG.chargeNeed} title={p.label} aria-label={p.label} onClick={() => triggerPower(p.id)}>
								<span aria-hidden="true">{p.icon}</span>
							</button>
						))}
					</div>
				</div>
			)}

			{phase === 'playing' && (
				<p className="pg-hint">
					Flèches ↑ ↓ (ou Z/S) · ou glisse le doigt{powersUi ? ' · pouvoirs au 5e renvoi (touches 1-4)' : ''}
				</p>
			)}
		</div>
	);
}

const CSS = `
.pg-root { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; width: 100%; }
.pg-modetoggle {
  width: 100%; max-width: 340px; margin: 0 auto; display: flex; gap: 4px; padding: 4px;
  background: var(--gray-999); border: 1.5px solid var(--gray-700); border-radius: 999px; box-shadow: var(--shadow-sm);
}
.pg-modeseg {
  flex: 1; border: none; background: transparent; color: var(--gray-300); font: inherit; font-weight: 700;
  font-size: 14px; padding: 11px 8px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.pg-modeseg.active { background: var(--accent-regular); color: var(--accent-text-over); }
.pg-modeseg:not(.active):hover { color: var(--gray-0); }
.pg-leveltag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin: -0.25rem 0 0; }
.pg-leveloverlay {
  position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
  padding: 1rem; overflow-y: auto; background: rgba(8,10,18,0.72); border-radius: 14px;
}
.pg-stage { position: relative; width: 100%; max-width: 680px; aspect-ratio: 5 / 3; }
.pg-canvas { width: 100%; height: 100%; display: block; object-fit: contain; border-radius: 14px; background: #0b0e14; touch-action: none; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
/* Site global fullscreen. Landscape: the court fills the screen. Portrait: keep the
   5/3 court at FULL WIDTH (a band), UI around — not a tiny centred strip. */
.game-page.gf-full .pg-root { max-width: none; width: 100%; }
.game-page.gf-full .pg-stage { max-width: none; }
.game-page.gf-full .pg-help { display: none; }
@media (orientation: landscape) {
  .game-page.gf-full .pg-root { height: 100%; }
  .game-page.gf-full .pg-stage { flex: 1; aspect-ratio: auto; border-radius: 0; }
  .game-page.gf-full .pg-quit { right: 132px; }
}
.pg-hud { position: absolute; top: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 0.5rem; font-family: var(--font-brand); font-weight: 700; font-size: 1.1rem; pointer-events: none; text-shadow: 0 1px 4px rgba(0,0,0,0.6); }
.pg-sep { color: var(--gray-300); }
.pg-overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(8,10,18,0.55); padding: 1rem; }
.pg-card { background: var(--gray-999, #0c0e14); border: 1px solid var(--gray-800, #2a2f3a); border-radius: 16px; padding: 1.25rem; width: min(340px, 100%); max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; text-align: center; }
.pg-card h2 { margin: 0; font-size: var(--text-xl); }
.pg-sub { margin: 0; color: var(--gray-300); font-size: var(--text-sm); }
.pg-modes { display: flex; gap: 0.4rem; }
.pg-mode { flex: 1; padding: 0.45rem 0.5rem; border-radius: 10px; border: 1px solid var(--gray-700, #3a4150); background: transparent; color: var(--gray-0, #fff); font-weight: 600; font-size: var(--text-sm); cursor: pointer; }
.pg-mode.active { border-color: transparent; background: var(--accent-regular, #7611a6); }
.pg-name { padding: 0.6rem 0.8rem; border-radius: 10px; border: 1px solid var(--gray-700, #3a4150); background: var(--gray-900, #14171f); color: var(--gray-0, #fff); font-size: 1rem; text-align: center; }
.pg-code { text-transform: uppercase; letter-spacing: 0.15em; }
.pg-coderow { display: flex; gap: 0.5rem; }
.pg-coderow .pg-name { flex: 1; min-width: 0; }
.pg-coderow .pg-small { flex: none; white-space: nowrap; }
.pg-codepanel { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; border: 1px dashed var(--gray-700, #3a4150); border-radius: 12px; }
.pg-btn { padding: 0.6rem 0.9rem; border-radius: 10px; border: 1px solid var(--gray-700, #3a4150); background: transparent; color: var(--gray-0, #fff); font-weight: 600; cursor: pointer; }
.pg-btn:hover:not(:disabled) { border-color: var(--accent-regular, #b07cff); }
.pg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pg-primary { background: var(--accent-regular, #7611a6); border-color: transparent; }
.pg-small { padding: 0.45rem 0.7rem; font-size: var(--text-sm); }
.pg-bigcode { font-family: var(--font-brand); font-size: 2rem; font-weight: 800; letter-spacing: 0.3em; color: var(--accent-regular, #b07cff); background: none; border: none; cursor: pointer; padding: 0.1rem 0.3rem; }
.pg-bigcode:hover { filter: brightness(1.15); }
.pg-quit { position: absolute; top: 8px; right: 10px; z-index: 2; padding: 0.35rem 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: rgba(8,10,18,0.55); color: #f4f6fb; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
.pg-quit:hover { border-color: var(--accent-regular, #b07cff); }
.pg-copyhint { margin: 0; color: var(--accent-regular, #b07cff); font-size: var(--text-sm); min-height: 1.1em; }
.pg-status { margin: 0; color: var(--gray-300); font-size: var(--text-sm); }
.pg-hint { color: var(--gray-400); font-size: var(--text-sm); text-align: center; margin: 0; }
.pg-powerbar { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; width: 100%; }
.pg-meter { display: flex; gap: 4px; }
.pg-meter i { width: 26px; height: 7px; border-radius: 2px; background: var(--gray-700, #3a4150); transition: background 0.15s; }
.pg-meter i.on { background: var(--accent-regular, #b07cff); }
.pg-powers { display: flex; gap: 0.5rem; }
.pg-power { width: 48px; height: 48px; border-radius: 12px; border: 1px solid var(--gray-700, #3a4150); background: var(--gray-900, #14171f); font-size: 1.5rem; cursor: pointer; display: grid; place-items: center; transition: transform 0.1s, border-color 0.15s; }
.pg-power:not(:disabled) { border-color: var(--accent-regular, #b07cff); box-shadow: 0 0 10px rgba(176,124,255,0.35); }
.pg-power:not(:disabled):hover { transform: translateY(-2px); }
.pg-power:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-spinner { width: 28px; height: 28px; border: 3px solid var(--gray-700, #3a4150); border-top-color: var(--accent-regular, #b07cff); border-radius: 50%; margin: 0.25rem auto; animation: pg-spin 0.8s linear infinite; }
@keyframes pg-spin { to { transform: rotate(360deg); } }
`;
