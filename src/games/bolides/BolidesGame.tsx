import { useState, useEffect, useRef, useCallback } from 'react';
import {
	createGame, resetGame, stepGame, stepGuest, applySim, setRemotePose, collectEvents, buildSim, readPose,
	pct, NAMES, PALETTE, DIFFS, CFG, CAR_COUNT, type GameState, type NetEvent,
} from './engine';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, MAX_PLAYERS, type Match, type BolidePeer, type GoMsg } from './net';
import { createRenderer, type Renderer } from './render3d';
import { usePointerDrag } from '../usePointerDrag';
import { trackGame } from '../../lib/analytics';
import { getDaily, saveDailyRun, loadDailyRun, dailyWeekdayLabel, playerName } from '../../lib/leaderboard';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   BOLIDES — React shell. Owns the fixed-step loop and the HUD; the simulation
   (engine.ts) and the 3D (render3d.ts) run outside React state so per-frame car
   moves never trigger a rerender. Loop: sortir -> tracer -> reboucler -> capturer;
   couper une trace ennemie = kill. Mourir ne finit pas la partie : on réapparaît au
   point de départ après 3 s. La course s'arrête quand quelqu'un dépasse 50 %.
   Défi du jour = arène + bots déterministes (seed partagé) ; score = meilleur %.
   ===================================================== */

type Phase = 'menu' | 'playing' | 'dead';
type Mode = 'libre' | 'defi' | 'online';
type MpPhase = 'menu' | 'connecting' | 'lobby'; // what the online tab shows before the flag drops
interface DailyState { best: number; tries: number }
const STEP = 1000 / 60;
const NET_MS = 50; // 20 packets/s — a pose is 6 numbers, a host tick a few dozen
const AUTO_START = 10; // seconds the host waits once a second driver shows up
// Kept under CFG.driftJab on purpose: holding a key carves, it never breaks traction.
const KEY_RAMP = 2.2; // steer units per second when a key is held (~0.45 s to full lock)
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const toTenths = (p: number) => Math.round(p * 10); // % -> stored tenths of a percent
const fmtPct = (v: number) => formatScore(DAILY_LB.bolides.fmt, v);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Row { id: number; name: string; pct: number; me: boolean }

export default function BolidesGame({ gameId }: { gameId: string }) {
	const [phase, setPhase] = useState<Phase>('menu');
	const [mode, setMode] = useState<Mode>('defi');
	const [board, setBoard] = useState<Row[]>([]);
	const [webglError, setWebglError] = useState(false);
	const [status, setStatus] = useState('');
	const [attempt, setAttempt] = useState(0); // remounts the Leaderboard so a replay retries its submit
	const [submitVal, setSubmitVal] = useState<number | undefined>(undefined);
	const [respawnIn, setRespawnIn] = useState(0); // seconds left before the player is back
	const [left, setLeft] = useState<number>(CFG.timeLimit); // seconds left in the race
	const [result, setResult] = useState({ pct: 0, best: 0, rank: 0, diff: 1, won: false, winner: 0, deaths: 0, byTime: false });
	const [labels, setLabels] = useState<string[]>(NAMES.slice()); // car id -> HUD name (driver names online)
	const [mpPhase, setMpPhase] = useState<MpPhase>('menu');
	const [mpCode, setMpCode] = useState<string | null>(null);
	const [codeInput, setCodeInput] = useState('');
	const [roster, setRoster] = useState<BolidePeer[]>([]);
	const [lobbyIn, setLobbyIn] = useState(-1); // auto-start countdown, -1 = no one else yet, nothing ticking
	const [amHost, setAmHost] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const miniRef = useRef<HTMLCanvasElement>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const joyBaseRef = useRef<HTMLDivElement>(null);
	const joyKnobRef = useRef<HTMLDivElement>(null);
	const stateRef = useRef<GameState>(createGame());
	const rendererRef = useRef<Renderer | null>(null);
	const keysRef = useRef({ left: false, right: false, up: false, down: false });
	const keySteerRef = useRef(0); // ramped key steer, see frame()
	const lastTapRef = useRef({ key: '', at: 0 }); // double-tap a side = flick the wheel over
	const dragRef = useRef({ active: false, steer: 0, throttle: 0, ox: 0, oy: 0 });
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const hudAccRef = useRef(0);
	const runningRef = useRef(false);
	const bestPctRef = useRef(0); // peak % during the current run
	const deathsRef = useRef(0); // player wrecks this run (cosmetic, shown on the end card)
	const dailyBestRef = useRef(0); // best % across today's attempts
	const modeRef = useRef<Mode>('defi');
	const matchRef = useRef<Match | null>(null);
	const onlineRef = useRef({ host: false, active: false }); // active = the flag has dropped
	const seatsRef = useRef<string[]>([]); // frozen roster: index = seat = car id - 1
	const pendingRef = useRef<NetEvent[]>([]); // host: grid events waiting for the next packet
	const netAccRef = useRef(0);
	const ignoreRef = useRef<number[]>([]); // car id -> clock before which its poses are stale
	const countRef = useRef(-1); // host's auto-start countdown
	const seenRef = useRef(0); // drivers counted last tick; a newcomer rewinds the countdown

	const labelsRef = useRef<string[]>(NAMES.slice());
	const applyLabels = useCallback((l: string[]) => { labelsRef.current = l; setLabels(l); }, []);

	const syncBoard = useCallback(() => {
		const s = stateRef.current;
		const rows: Row[] = s.cars.map((c) => ({ id: c.id, name: labelsRef.current[c.id], pct: pct(s, c.id), me: c.id === s.hero }));
		rows.sort((a, b) => b.pct - a.pct);
		setBoard(rows);
	}, []);

	const ensureRenderer = useCallback(() => {
		if (rendererRef.current) return true;
		if (!canvasRef.current) return false;
		const r = createRenderer(canvasRef.current, stateRef.current);
		if (!r) { setWebglError(true); return false; }
		r.setMinimap(miniRef.current);
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
		onlineRef.current.active = false;
		matchRef.current?.setPlaying(false);
		countRef.current = -1; // the rematch gets a full countdown, not the tail of the last one
		seenRef.current = 0;
		setLobbyIn(-1);
		const peak = Math.max(pct(s, s.hero), bestPctRef.current);
		const rank = 1 + s.cars.filter((c) => c.id !== s.hero && pct(s, c.id) > pct(s, s.hero)).length;
		const end = { won: s.winner === s.hero, winner: s.winner, deaths: deathsRef.current, byTime: s.overByTime };
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
			setResult({ pct: peak, best, rank, diff: s.diff, ...end });
		} else {
			setResult({ pct: peak, best: peak, rank, diff: s.diff, ...end });
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
		// A key is all-or-nothing, so ramp it: tapped straight to ±1 the car snaps to full
		// lock and there is no way to hold a shallow line.
		const target = (k.right ? 1 : 0) - (k.left ? 1 : 0);
		const rate = (dt / 1000) * KEY_RAMP;
		keySteerRef.current += Math.max(-rate, Math.min(rate, target - keySteerRef.current));
		const steer = d.active ? d.steer : keySteerRef.current;
		const throttle = d.active ? d.throttle : (k.up ? 1 : 0) - (k.down ? 1 : 0);
		const net = onlineRef.current;
		while (runningRef.current && accRef.current >= STEP) {
			accRef.current -= STEP;
			// A guest only drives its own car; the host rules on the grid and sends the verdict.
			if (net.active && !net.host) stepGuest(s, steer, throttle, STEP / 1000);
			else stepGame(s, steer, throttle, STEP / 1000);
		}
		const alpha = Math.min(1, accRef.current / STEP);
		for (const e of s.events) {
			if (e.type === 'death' && e.isPlayer) deathsRef.current++;
			// A driver we just put back home keeps sending poses from the crash site for one RTT.
			else if (e.type === 'respawn') ignoreRef.current[e.id] = s.clock + 1;
		}
		if (net.active && net.host) collectEvents(s, pendingRef.current);
		if (r) r.frame(s, alpha, dt / 1000);
		s.events.length = 0; // consumed by the renderer (FX) this frame

		if (net.active) {
			netAccRef.current += dt;
			if (netAccRef.current >= NET_MS) {
				netAccRef.current = 0;
				const m = matchRef.current;
				const me = s.cars[s.hero - 1];
				if (m && net.host) m.sendSim(buildSim(s, pendingRef.current));
				else if (m && me?.alive) m.sendPose({ i: m.selfId, p: readPose(me) });
			}
		}

		bestPctRef.current = Math.max(bestPctRef.current, pct(s, s.hero));
		hudAccRef.current += dt;
		if (hudAccRef.current >= 140) {
			hudAccRef.current = 0;
			syncBoard();
			const me = s.cars[s.hero - 1];
			setRespawnIn(me.alive ? 0 : Math.max(1, Math.ceil(me.respawnAt - s.clock)));
			setLeft(Math.max(0, Math.ceil(CFG.timeLimit - s.clock)));
		}

		if (s.over) { endGame(); return; }
		rafRef.current = requestAnimationFrame(frame);
	}, [syncBoard, endGame]);

	const run = useCallback(() => {
		runningRef.current = true;
		lastRef.current = performance.now();
		accRef.current = 0;
		hudAccRef.current = 0;
		bestPctRef.current = 0;
		deathsRef.current = 0;
		keySteerRef.current = 0;
		netAccRef.current = 0;
		setRespawnIn(0);
		setLeft(CFG.timeLimit);
		rafRef.current = requestAnimationFrame(frame);
	}, [frame]);

	/** Start a run for the given seed/diff and go live. Offline: car 1 is ours, the rest are bots. */
	const launch = useCallback((seed: number, diff: number) => {
		const s = stateRef.current;
		resetGame(s, seed, diff);
		s.hero = 1;
		s.record = false;
		for (const car of s.cars) { car.remote = false; car.isBot = car.id !== 1; }
		applyLabels(NAMES.slice());
		rendererRef.current?.reset();
		rendererRef.current?.resize();
		setSubmitVal(undefined);
		syncBoard();
		setPhase('playing');
		run();
	}, [run, syncBoard, applyLabels]);

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

	/* ---------- online ---------- */

	/** Everyone runs this on `go`: the seat order is frozen in `ids`, so each client works out
	 *  which car is its own and which are ghosts without another round trip. */
	const beginRace = useCallback((go: GoMsg) => {
		const m = matchRef.current;
		if (!m || !ensureRenderer()) return;
		const seat = go.ids.indexOf(m.selfId);
		if (seat < 0) return; // we arrived after the roster froze — sit this one out in the lobby
		const host = go.ids[0] === m.selfId;
		onlineRef.current = { host, active: true };
		seatsRef.current = go.ids;
		modeRef.current = 'online';
		pendingRef.current.length = 0;
		ignoreRef.current = [];

		const peers = m.peers();
		const labs = new Array(CAR_COUNT + 1).fill('');
		for (let id = 1; id <= CAR_COUNT; id++) {
			const who = go.ids[id - 1];
			labs[id] = !who ? NAMES[id] : who === m.selfId ? 'Toi' : peers.find((p) => p.id === who)?.name || 'Joueur';
		}
		applyLabels(labs);

		const s = stateRef.current;
		resetGame(s, go.seed, go.diff);
		s.hero = seat + 1;
		s.record = host; // only the host logs trail cells for broadcast
		for (const car of s.cars) {
			const taken = car.id - 1 < go.ids.length;
			car.isBot = !taken;
			// The host drives the bots; a guest owns nothing but its own car.
			car.remote = host ? taken && car.id !== s.hero : car.id !== s.hero;
		}
		m.setPlaying(true);
		setStatus('');
		setSubmitVal(undefined);
		rendererRef.current?.reset();
		rendererRef.current?.resize();
		syncBoard();
		setPhase('playing');
		run();
		trackGame(gameId, 'game_started', { mode: 'online' });
	}, [ensureRenderer, applyLabels, syncBoard, run, gameId]);

	const startOnlineRace = useCallback(() => {
		const m = matchRef.current;
		if (!m) return;
		const go: GoMsg = { seed: (Math.random() * 2 ** 31) >>> 0, diff: 1, ids: m.ids() };
		m.sendGo(go);
		beginRace(go);
	}, [beginRace]);

	const leaveOnline = useCallback(() => {
		stop();
		matchRef.current?.leave();
		matchRef.current = null;
		onlineRef.current = { host: false, active: false };
		setRoster([]);
		setMpCode(null);
		setLobbyIn(-1);
		setAmHost(false);
		setMpPhase('menu');
		setPhase('menu');
	}, [stop]);

	/** Attach every channel handler once, right after joining. */
	const wire = useCallback((m: Match) => {
		m.onPeers((peers) => {
			setRoster(peers);
			setAmHost(m.isHost());
			const net = onlineRef.current;
			if (!net.active) return;
			const hostId = seatsRef.current[0];
			if (hostId && hostId !== m.selfId && !peers.some((p) => p.id === hostId)) {
				setStatus("L'hôte a quitté — course interrompue.");
				endGame();
				return;
			}
			if (!net.host) return;
			// A driver who leaves mid-race hands their car over to a bot rather than freezing it.
			const here = new Set(peers.map((p) => p.id));
			seatsRef.current.forEach((id, i) => {
				const car = stateRef.current.cars[i];
				if (!car || !car.remote || id === m.selfId || here.has(id)) return;
				car.remote = false;
				car.isBot = true;
			});
		});
		m.onLobby((l) => setLobbyIn(l.in));
		m.onGo((go) => beginRace(go));
		m.onPose((msg) => {
			const net = onlineRef.current;
			if (!net.active || !net.host) return;
			const s = stateRef.current;
			if (s.clock < (ignoreRef.current[msg.p.id] ?? 0)) return; // stale: sent before they saw the respawn
			setRemotePose(s, msg.p);
		});
		m.onSim((sm) => {
			const net = onlineRef.current;
			if (net.active && !net.host) applySim(stateRef.current, sm);
		});
	}, [beginRace, endGame]);

	const enterLobby = useCallback(async (make: () => Promise<Match | null>, code: string | null, fail: string) => {
		if (!multiplayerAvailable()) { setStatus('Multijoueur indisponible.'); return; }
		setStatus('');
		setMpCode(code);
		setMpPhase('connecting');
		const m = await make();
		if (!m) { setMpPhase('menu'); setStatus(fail); return; }
		matchRef.current = m;
		countRef.current = -1;
		seenRef.current = 0;
		setLobbyIn(-1);
		wire(m);
		setMpPhase('lobby');
	}, [wire]);

	const me16 = () => (playerName() || 'Joueur').slice(0, 16);
	const mpQuick = () => enterLobby(() => joinRandom(me16()), null, 'Aucun salon libre, réessaie.');
	const mpCreate = () => { const c = makeCode(); return enterLobby(() => joinByCode(me16(), c), c, 'Connexion impossible.'); };
	const mpJoin = () => {
		const c = codeInput.trim().toUpperCase();
		if (!c) return;
		return enterLobby(() => joinByCode(me16(), c), c, 'Code plein ou invalide.');
	};

	/* Host's auto-start: once a second driver is here, count down out loud so everyone sees it.
	   Alone, nothing ticks — the host launches against bots whenever they feel like it. */
	useEffect(() => {
		if (mode !== 'online' || mpPhase !== 'lobby') return;
		const id = setInterval(() => {
			const m = matchRef.current;
			if (!m || !m.isHost() || onlineRef.current.active) return;
			const here = m.peers().length + 1;
			const grew = here > seenRef.current; // a latecomer gets the full countdown, not its tail
			seenRef.current = here;
			if (here < 2) countRef.current = -1;
			else if (grew || countRef.current < 0) countRef.current = AUTO_START;
			else countRef.current -= 1;
			if (here >= MAX_PLAYERS) countRef.current = 0; // grid full, no reason to wait
			setLobbyIn(countRef.current);
			m.sendLobby({ in: countRef.current });
			if (countRef.current === 0) startOnlineRace();
		}, 1000);
		return () => clearInterval(id);
	}, [mode, mpPhase, startOnlineRace]);

	const backToMenu = useCallback(() => {
		stop();
		if (modeRef.current === 'online') { leaveOnline(); return; }
		setPhase('menu');
	}, [stop, leaveOnline]);

	const switchMode = useCallback((m: Mode) => {
		stop();
		if (matchRef.current) leaveOnline();
		setMode(m);
		setMpPhase('menu');
		setPhase('menu');
	}, [stop, leaveOnline]);

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
			// A held key can only ramp, so it always grips. Double-tapping a side slams the
			// steer over in one frame — that is the keyboard's flick, and it breaks traction.
			if (used && !e.repeat) {
				const k = keysRef.current;
				const dir = k.left && !k.right ? -1 : k.right && !k.left ? 1 : 0;
				if (dir !== 0) {
					const now = performance.now();
					if (e.key === lastTapRef.current.key && now - lastTapRef.current.at < 260) keySteerRef.current = dir;
					lastTapRef.current = { key: e.key, at: now };
				}
			}
			if (used || (runningRef.current && NAV.has(e.key))) e.preventDefault();
		};
		const onUp = (e: KeyboardEvent) => { set(e.key, false); };
		window.addEventListener('keydown', onDown, { passive: false });
		window.addEventListener('keyup', onUp);
		return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
	}, []);

	/* Touch/mouse: a relative joystick where the finger lands — up/down = throttle/brake,
	   left/right = steer. Positioned via refs so dragging never rerenders React. */
	const JOY_R = 96; // px radius for full deflection — a long throw is what buys small corrections
	const JOY_VIS = 0.5; // the ring is drawn at half that radius (see .bo-joy-base)
	// Squared response: the first third of the throw barely turns, full lock still sits at the rim.
	const expo = (v: number) => v * Math.abs(v);
	const positionJoy = (cx: number, cy: number, dx: number, dy: number) => {
		const rect = boardRef.current?.getBoundingClientRect();
		if (!rect) return;
		const base = joyBaseRef.current, knob = joyKnobRef.current;
		if (base) { base.style.left = `${cx - rect.left}px`; base.style.top = `${cy - rect.top}px`; }
		if (knob) {
			// The ring is drawn smaller than the throw so it doesn't sit over half the arena;
			// the knob is scaled to match, so the rim still means full lock.
			const cl = (v: number) => Math.max(-JOY_R, Math.min(JOY_R, v)) * JOY_VIS;
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
			d.steer = expo(Math.max(-1, Math.min(1, dx / JOY_R)));
			d.throttle = Math.max(-1, Math.min(1, -dy / (JOY_R * 0.65))); // up = accelerate
			positionJoy(d.ox, d.oy, dx, dy);
		},
		() => {
			const d = dragRef.current;
			d.active = false; d.steer = 0; d.throttle = 0;
			if (joyBaseRef.current) joyBaseRef.current.style.display = 'none';
			if (joyKnobRef.current) joyKnobRef.current.style.display = 'none';
		},
	);

	// Same sort as net.ts ids(): index in this list is the seat, so the dot matches the car colour.
	const selfId = matchRef.current?.selfId ?? '';
	const seatList = [...roster.map((p) => ({ id: p.id, name: p.name, me: false })), { id: selfId, name: 'Toi', me: true }]
		.sort((a, b) => (a.id < b.id ? -1 : 1));

	return (
		<div className="bo-root">
			<style>{CSS}</style>

			<div className="bo-modetoggle">
				<ModeToggle
					daily={mode === 'defi'}
					onFree={() => switchMode('libre')}
					onDaily={() => switchMode('defi')}
					showOnline
					onlineActive={mode === 'online'}
					onOnline={() => switchMode('online')}
				/>
			</div>

			<div className="bo-boardwrap" ref={boardRef}>
				<canvas ref={canvasRef} className="bo-canvas" role="img" aria-label="Bolides" onPointerDown={drag.onPointerDown} />

				{/* Relative drag joystick (shown at the finger while dragging). */}
				<div ref={joyBaseRef} className="bo-joy-base" />
				<div ref={joyKnobRef} className="bo-joy-knob" />

				<canvas
					ref={miniRef}
					className="bo-minimap"
					width={150}
					height={150}
					style={{ display: phase === 'playing' ? 'block' : 'none' }}
					aria-hidden="true"
				/>

				{phase === 'playing' && (
					<ol className="bo-leaderboard">
						{board.map((r) => (
							<li key={r.id} className={r.me ? 'me' : ''}>
								<span className="bo-row">
									<span className="bo-dot" style={{ background: hex(PALETTE[r.id]) }} />
									{r.name} · {r.pct.toFixed(1)}%
								</span>
								{/* Distance to the 50 % buzzer, which the raw number alone never makes obvious. */}
								<span className="bo-bar">
									<span style={{ width: `${Math.min(100, (r.pct / CFG.winPct) * 100)}%`, background: hex(PALETTE[r.id]) }} />
								</span>
							</li>
						))}
						<li className="goal">{mmss(left)} · KO à {CFG.winPct} %</li>
					</ol>
				)}

				{phase === 'playing' && respawnIn > 0 && (
					<div className="bo-respawn">
						<strong>Reparti dans {respawnIn}…</strong>
						<span>Tu repars du point de départ, ton terrain reste à toi.</span>
					</div>
				)}

				{webglError && <div className="bo-overlay"><div className="bo-card">3D indisponible (WebGL manquant).</div></div>}

				{phase === 'menu' && !webglError && mode === 'online' && (
					<div className="bo-overlay">
						<div className="bo-card">
							{mpPhase === 'lobby' ? (
								<>
									<h2>Salon</h2>
									{mpCode && <p className="bo-code">Code&nbsp;: <strong>{mpCode}</strong></p>}
									<ul className="bo-roster">
										{seatList.map((p, i) => (
											<li key={p.id} className={p.me ? 'me' : ''}>
												<span className="bo-dot" style={{ background: hex(PALETTE[i + 1]) }} />{p.name}
											</li>
										))}
									</ul>
									<p className="bo-modehint">
										{roster.length + 1}/{MAX_PLAYERS} pilotes · les places libres sont tenues par des bots
									</p>
									<p className="bo-sub">
										{roster.length === 0
											? 'Personne d\'autre pour l\'instant — partage ton code, ou pars seul contre les bots.'
											: lobbyIn > 0
												? `Départ automatique dans ${lobbyIn}…`
												: 'Départ imminent…'}
									</p>
									{amHost ? (
										<button className="bo-play" onClick={startOnlineRace}>
											{roster.length === 0 ? '▶ Jouer contre les bots' : '▶ Lancer maintenant'}
										</button>
									) : (
										<p className="bo-hint">L'hôte peut lancer la course avant la fin du décompte.</p>
									)}
									<button className="bo-quit bo-leave" onClick={leaveOnline}>Quitter le salon</button>
								</>
							) : mpPhase === 'connecting' ? (
								<>
									<h2>Connexion…</h2>
									<p className="bo-sub">Recherche d'un salon libre.</p>
									<button className="bo-quit bo-leave" onClick={leaveOnline}>Annuler</button>
								</>
							) : (
								<>
									<h2>Course en ligne</h2>
									<p className="bo-sub">
										Jusqu'à <strong>{MAX_PLAYERS} pilotes</strong> dans la même arène. Mêmes règles&nbsp;:
										boucle pour capturer, coupe la trace d'un rival pour l'envoyer au stand.
										Dès qu'un second pilote arrive, la course part toute seule en {AUTO_START} s —
										l'hôte peut lancer avant. Les places vides sont tenues par des bots.
									</p>
									<button className="bo-play" onClick={mpQuick}>⚡ Partie rapide</button>
									<button className="bo-second" onClick={mpCreate}>🔑 Créer un code ami</button>
									<div className="bo-join">
										<input
											value={codeInput}
											onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 4))}
											placeholder="CODE"
											maxLength={4}
											aria-label="Code ami"
										/>
										<button onClick={mpJoin} disabled={codeInput.trim().length < 4}>Rejoindre</button>
									</div>
									{status && <p className="bo-hint">{status}</p>}
								</>
							)}
						</div>
					</div>
				)}

				{phase === 'menu' && !webglError && mode !== 'online' && (
					<div className="bo-overlay">
						<div className="bo-card">
							<h2>Bolides</h2>
							<p className="bo-sub">
								Sors de ta zone, trace une boucle et reviens chez toi pour <strong>capturer</strong> le terrain.
								<strong> {Math.round(CFG.timeLimit / 60)} minutes</strong> : le plus grand territoire l'emporte,
								ou victoire immédiate à <strong>{CFG.winPct} %</strong>. Ta trace est vulnérable : si un rival la coupe,
								tu exploses — coupe la leur pour les éliminer. Une sortie de piste ne coûte que {CFG.respawnPlayer} s :
								tu repars du point de départ, ton terrain reste à toi.
							</p>
							<p className="bo-modehint">
								{mode === 'defi'
									? `Arène du jour · ${dailyWeekdayLabel()} · même setup pour tous · classement partagé`
									: 'Arène aléatoire · score local'}
							</p>
							<button className="bo-play" onClick={play}>▶ Jouer</button>
							{status && <p className="bo-hint">{status}</p>}
							<p className="bo-hint">Glisse le doigt : haut/bas = accélérer/freiner, gauche/droite = tourner. Un coup sec sur le côté = drift. Clavier : flèches ou ZQSD, double-tape un côté pour drifter.</p>
						</div>
					</div>
				)}

				{phase === 'dead' && (
					<div className="bo-overlay">
						<div className="bo-card">
							<h2>{result.won ? 'Arène conquise !' : 'Perdu'}</h2>
							<p className="bo-sub">
								{result.byTime
									? `Temps écoulé — ${result.won ? 'tu gardes' : `${labels[result.winner] ?? 'un rival'} garde`} le plus grand territoire.`
									: result.won
										? `Tu as passé la barre des ${CFG.winPct} %.`
										: `${labels[result.winner] ?? 'Un rival'} a pris ${CFG.winPct} % de l'arène avant toi.`}
							</p>
							<p className="bo-score">
								{result.pct.toFixed(1)}%
								<span>
									de terrain · {result.rank}<sup>{result.rank === 1 ? 'er' : 'e'}</sup> sur {board.length || 4}
									{result.deaths > 0 && ` · ${result.deaths} sortie${result.deaths > 1 ? 's' : ''} de piste`}
								</span>
							</p>
							{mode === 'defi' && (
								<p className="bo-best">Meilleur du jour : <strong>{fmtPct(toTenths(result.best))}</strong> · {DIFFS[result.diff]?.label}</p>
							)}
							{mode === 'online' ? (
								<>
									<p className="bo-hint bo-rematch">
										{roster.length === 0
											? 'Plus personne dans le salon — relance contre les bots ou quitte.'
											: lobbyIn > 0 ? `Revanche dans ${lobbyIn}…` : 'Revanche imminente…'}
									</p>
									{amHost && <button className="bo-play" onClick={startOnlineRace}>↺ Relancer</button>}
									<button className="bo-quit bo-leave" onClick={leaveOnline}>Quitter le salon</button>
								</>
							) : (
								<button className="bo-play" onClick={play}>↺ Rejouer</button>
							)}
						</div>
					</div>
				)}
			</div>

			{phase === 'playing' && (
				<div className="bo-actions">
					{mode !== 'online' && <button className="bo-restart" onClick={play}>↺ Recommencer</button>}
					<button className="bo-quit" onClick={backToMenu}>Quitter</button>
				</div>
			)}

			{mode === 'defi' && (
				<div className="bo-lb">
					<Leaderboard
						key={`lb-${gameId}-${attempt}`}
						game={gameId}
						metric="score"
						submitValue={phase === 'dead' ? submitVal : undefined}
						format={fmtPct}
					/>
				</div>
			)}

			<p className="bo-help">
				<strong>Glisse le doigt</strong> sur l'écran : haut/bas pour accélérer ou freiner, gauche/droite pour tourner.
				Un mouvement progressif trace une courbe posée&nbsp;; un coup sec sur le côté fait <strong>drifter</strong>&nbsp;:
				l'arrière glisse, puis la voiture se replace et boucle le virage bien plus vite
				(au clavier&nbsp;: flèches ou ZQSD, double-tape un côté pour partir en glisse).
				Le but&nbsp;: être le premier à contrôler {CFG.winPct}&nbsp;% de l'arène.
				Sors, boucle, reviens → capture. Recroiser ta propre trace efface la boucle en cours, sans plus&nbsp;:
				tu repars de là. En revanche, si un rival coupe ta trace, tu réapparais au point de départ après 3&nbsp;s
				pendant que les autres continuent — alors coupe la leur en premier.
				{mode === 'defi' && ' Le défi du jour partage la même arène et le même classement pour tout le monde.'}
				{mode === 'online' && ` En ligne, jusqu'à ${MAX_PLAYERS} pilotes courent dans la même arène : partie rapide pour tomber sur n'importe qui, code ami pour jouer entre vous. Les places libres restent tenues par des bots.`}
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
/* Fullscreen means the ARENA is fullscreen: drop the page padding, let the board eat the
   viewport and float the few controls over it. The mode tabs and the online leaderboard only
   leave the game, so they go away until we come back out. */
.game-page.gf-full:has(.bo-root) { padding: 0; }
.game-page.gf-full .bo-root { max-width: none; width: 100%; height: 100%; display: flex; flex-direction: column; }
.game-page.gf-full .bo-boardwrap { flex: 1; min-height: 0; aspect-ratio: auto; }
.game-page.gf-full .bo-canvas { border-radius: 0; border: none; }
.game-page.gf-full .bo-overlay { border-radius: 0; }
.game-page.gf-full .bo-help,
.game-page.gf-full .bo-modetoggle,
.game-page.gf-full .bo-lb { display: none; }
/* Keep the standings clear of the "⛶ Quitter" button pinned to the same corner. */
.game-page.gf-full .bo-leaderboard { top: max(54px, calc(env(safe-area-inset-top) + 46px)); }
.game-page.gf-full .bo-minimap { top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); }
.game-page.gf-full .bo-actions {
  position: fixed; z-index: 4; margin: 0;
  right: max(8px, env(safe-area-inset-right)); bottom: max(10px, env(safe-area-inset-bottom));
}
.bo-leaderboard {
  position: absolute; top: 8px; right: 8px; margin: 0; padding: 8px 12px; list-style: none;
  background: rgba(0,0,0,0.55); color: #fff; border-radius: 10px; font-size: 12.5px; font-weight: 700;
  font-variant-numeric: tabular-nums; display: flex; flex-direction: column; gap: 3px;
}
.bo-leaderboard li { display: flex; flex-direction: column; gap: 3px; min-width: 118px; }
.bo-row { display: flex; align-items: center; gap: 6px; }
.bo-bar { display: block; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.16); overflow: hidden; }
.bo-bar span { display: block; height: 100%; border-radius: 2px; transition: width 0.14s linear; }
.bo-leaderboard li.me { color: #ffe27a; }
.bo-leaderboard li.goal { display: block; color: rgba(255,255,255,0.6); font-weight: 600; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.18); padding-top: 4px; margin-top: 1px; }
.bo-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.bo-respawn {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2; text-align: center;
  background: rgba(6,8,16,0.72); color: #fff; border-radius: 14px; padding: 14px 22px; pointer-events: none;
  display: flex; flex-direction: column; gap: 4px;
}
.bo-respawn strong { font-family: var(--font-brand); font-size: 22px; font-weight: 600; }
.bo-respawn span { font-size: 12px; color: var(--gray-300); }
.bo-minimap {
  position: absolute; top: 8px; left: 8px; width: 108px; height: 108px; z-index: 1;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.35);
  pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.game-page.gf-full .bo-minimap { width: 132px; height: 132px; }
.bo-joy-base, .bo-joy-knob { position: absolute; display: none; border-radius: 50%; pointer-events: none; transform: translate(-50%, -50%); z-index: 3; }
.bo-joy-base { width: 96px; height: 96px; background: rgba(255,255,255,0.04); border: 1.5px solid rgba(255,255,255,0.14); }
.bo-joy-knob { width: 34px; height: 34px; background: rgba(255,255,255,0.16); border: 1.5px solid rgba(255,255,255,0.32); }
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
.bo-second { display: block; margin: 10px auto 0; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 14px; border-radius: 999px; padding: 10px 22px; cursor: pointer; }
.bo-leave { display: block; margin: 12px auto 0; }
.bo-join { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }
.bo-join input {
  width: 108px; text-align: center; font: inherit; font-weight: 800; font-size: 18px; letter-spacing: 3px;
  text-transform: uppercase; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  border-radius: 12px; padding: 8px 6px;
}
.bo-join button { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 12px; padding: 8px 14px; cursor: pointer; }
.bo-join button:disabled { opacity: 0.45; cursor: default; }
.bo-code { font-size: 13px; color: var(--gray-300); margin: 0 0 10px; }
.bo-code strong { font-size: 26px; letter-spacing: 5px; color: var(--bo-accent); font-family: var(--font-brand); }
.bo-roster { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 5px; align-items: center; font-size: 13.5px; font-weight: 600; }
.bo-roster li { display: flex; align-items: center; gap: 7px; }
.bo-roster li.me { color: #ffe27a; }
.bo-rematch { margin-bottom: 4px; }
.bo-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin: 1rem auto 0; }
`;
