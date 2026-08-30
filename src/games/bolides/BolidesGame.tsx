import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import {
	createGame, resetGame, stepGame, stepGuest, applySim, setRemotePose, collectEvents, buildSim, readPose,
	pct, NAMES, PALETTE, DIFFS, CFG, CAR_COUNT, type GameState, type NetEvent,
} from './engine';
import { joinRandom, joinByCode, makeCode, multiplayerAvailable, goCars, MAX_PLAYERS, type Match, type BolidePeer, type GoMsg } from './net';
import { createRenderer, type Renderer } from './render3d';
// Importing the roster is what installs it into the engine (setCarLookup), so this import
// must stay even if only one symbol is used.
import { BOLIDES, DEFAULT_CAR, carById, ownedCars, selectedCar, selectCar, type Bolide } from './cars';
import * as sfx from './sfx';
import { usePointerDrag } from '../usePointerDrag';
import { trackGame, trackEvent } from '../../lib/analytics';
import { getDaily, saveDailyRun, loadDailyRun, dailyWeekdayLabel, playerName } from '../../lib/leaderboard';
import { balance, buyCar, WALLET_EVENT } from '../../lib/wallet';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import ModeToggle from '../../components/ModeToggle';
import Cocoin from '../../components/Cocoin';

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
const KEY_RAMP = 2.2; // steer units per second (~0.45 s to full lock) — a key is all-or-nothing
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const toTenths = (p: number) => Math.round(p * 10); // % -> stored tenths of a percent
const fmtPct = (v: number) => formatScore(DAILY_LB.bolides.fmt, v);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const BAR_LABELS: [keyof Bolide['bars'], string][] = [
	['speed', 'Vitesse'], ['accel', 'Reprise'], ['grip', 'Accroche'], ['trail', 'Trace'],
];

// Base-5 digits of the seed: deterministic, so the daily deals the same field to everyone.
// Never rng() — the sim's stream must stay identical whatever the UI did before the flag.
const botCar = (seed: number, seat: number): string => BOLIDES[Math.floor(seed / 5 ** seat) % BOLIDES.length].id;
/** Seat-ordered bolides for an offline grid: our pick in seat 0, bots behind it. */
const offlineCars = (hero: string, seed: number): string[] =>
	Array.from({ length: CAR_COUNT }, (_, i) => (i === 0 ? hero : botCar(seed, i)));

// Presence only carries a name, so the car rides in it. Split on the first separator and
// only trust a known id, so an older client just reads as the default car.
const CAR_SEP = '|';
const tagName = (car: string, name: string) => `${car}${CAR_SEP}${name}`;
const peerCarOf = (raw: string): string => {
	const id = raw.slice(0, raw.indexOf(CAR_SEP));
	return BOLIDES.some((b) => b.id === id) ? id : DEFAULT_CAR;
};
const peerNameOf = (raw: string): string => {
	const i = raw.indexOf(CAR_SEP);
	return i > 0 && BOLIDES.some((b) => b.id === raw.slice(0, i)) ? raw.slice(i + 1) : raw;
};

interface Row { id: number; name: string; pct: number; me: boolean; rank: number }
const PIPS = [0, 1, 2, 3, 4];
const REF_BAR = 3; // the free roadster reads 3 on every axis — the pips are graded against it

/* --- garage art: a top-down silhouette per car ---
   The shop is the one screen whose job is to sell a car, so it cannot show a sticker. Half-width
   at the waist, at the nose and at the tail, in a 44x64 box pointing up. */
const CAR_ART: Record<string, [w: number, nose: number, tail: number]> = {
	roadster: [13, 7, 12],
	comet: [11, 5, 10],
	hornet: [14, 9, 13],
	drifter: [12, 8, 15],
	bunker: [15, 11, 15],
};

function CarArt({ id, tint }: { id: string; tint: string }) {
	const [w, nose, tail] = CAR_ART[id] ?? CAR_ART.roadster;
	const body = `M22 3C${22 + nose} 6 ${22 + w} 15 ${22 + w} 30C${22 + w} 44 ${22 + tail} 53 ${22 + tail * 0.8} 60`
		+ `L${22 - tail * 0.8} 60C${22 - tail} 53 ${22 - w} 44 ${22 - w} 30C${22 - w} 15 ${22 - nose} 6 22 3Z`;
	return (
		<svg className="bo-carart" viewBox="0 0 44 64" aria-hidden="true">
			<g fill="#1C2030" stroke="#585F7A" strokeWidth="1">
				<rect x={22 + w - 2} y="13" width="5" height="11" rx="2" />
				<rect x={17 - w} y="13" width="5" height="11" rx="2" />
				<rect x={22 + tail - 2} y="39" width="6" height="14" rx="2" />
				<rect x={16 - tail} y="39" width="6" height="14" rx="2" />
			</g>
			<path d={body} fill={tint} stroke="#05060C" strokeWidth="1.6" />
			<ellipse cx={22 - w * 0.35} cy="22" rx={w * 0.3} ry="12" fill="#fff" opacity="0.22" />
			<ellipse cx="22" cy="31" rx={w * 0.52} ry="10" fill="#0A0E1A" opacity="0.92" />
			<g fill="#fff" opacity="0.85">
				<rect x={22 + w - 4.2} y="14" width="1.6" height="38" rx="0.8" />
				<rect x={24.6 - w} y="14" width="1.6" height="38" rx="0.8" />
				<rect x={22 - tail * 0.62} y="55.5" width={tail * 1.24} height="2.6" rx="1.3" />
			</g>
			<g fill="#FFF6D0">
				<rect x={22 - nose - 0.5} y="7" width="3.4" height="2.4" rx="1.2" />
				<rect x={19 + nose - 0.5} y="7" width="3.4" height="2.4" rx="1.2" />
			</g>
		</svg>
	);
}

export default function BolidesGame({ gameId }: { gameId: string }) {
	const [phase, setPhase] = useState<Phase>('menu');
	const [mode, setMode] = useState<Mode>('defi');
	const [board, setBoard] = useState<Row[]>([]);
	const [webglError, setWebglError] = useState(false);
	const [status, setStatus] = useState('');
	const [attempt, setAttempt] = useState(0); // remounts the Leaderboard so a replay retries its submit
	const [submitVal, setSubmitVal] = useState<number | undefined>(undefined);
	const [respawnIn, setRespawnIn] = useState(0); // seconds left before the player is back
	const [firstDeath, setFirstDeath] = useState(false); // the "what happened" line, once per run
	const [startHint, setStartHint] = useState(false); // touch control chip, first seconds of a race
	const [left, setLeft] = useState<number>(CFG.timeLimit); // seconds left in the race
	const [result, setResult] = useState({ pct: 0, best: 0, rank: 0, diff: 1, won: false, winner: 0, deaths: 0, byTime: false });
	const [labels, setLabels] = useState<string[]>(NAMES.slice()); // car id -> HUD name (driver names online)
	const [mpPhase, setMpPhase] = useState<MpPhase>('menu');
	const [mpCode, setMpCode] = useState<string | null>(null);
	const [codeInput, setCodeInput] = useState('');
	const [roster, setRoster] = useState<BolidePeer[]>([]);
	const [lobbyIn, setLobbyIn] = useState(-1); // auto-start countdown, -1 = no one else yet, nothing ticking
	const [amHost, setAmHost] = useState(false);
	const [car, setCar] = useState<string>(() => selectedCar());
	const [garage, setGarage] = useState(false);
	const [coins, setCoins] = useState(0);
	const [bought, setBought] = useState<{ id: string; price: number } | null>(null); // one-shot buy feedback
	const [sound, setSound] = useState(() => sfx.isEnabled());

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const miniRef = useRef<HTMLCanvasElement>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const joyBaseRef = useRef<HTMLDivElement>(null);
	const joyKnobRef = useRef<HTMLDivElement>(null);
	const vigRef = useRef<HTMLDivElement>(null);
	const carsRef = useRef<HTMLUListElement>(null);
	const stateRef = useRef<GameState>(createGame());
	const rendererRef = useRef<Renderer | null>(null);
	const keysRef = useRef({ left: false, right: false, up: false });
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
	const carRef = useRef<string>(car); // our pick, read from the loop and from net callbacks
	const seatCarsRef = useRef<string[]>(offlineCars(car, stateRef.current.seed)); // index = seat
	const meshSigRef = useRef(''); // the field the renderer built its meshes for
	const rejoinRef = useRef<{ make: (name: string) => Promise<Match | null>; code: string | null; fail: string } | null>(null);

	const labelsRef = useRef<string[]>(NAMES.slice());
	const applyLabels = useCallback((l: string[]) => { labelsRef.current = l; setLabels(l); }, []);

	const syncBoard = useCallback(() => {
		const s = stateRef.current;
		const rows: Row[] = s.cars.map((c) => ({ id: c.id, name: labelsRef.current[c.id], pct: pct(s, c.id), me: c.id === s.hero, rank: 0 }));
		rows.sort((a, b) => b.pct - a.pct);
		rows.forEach((r, i) => { r.rank = i + 1; });
		setBoard(rows);
	}, []);

	const ensureRenderer = useCallback(() => {
		if (rendererRef.current) return true;
		if (!canvasRef.current) return false;
		const r = createRenderer(canvasRef.current, stateRef.current, seatCarsRef.current);
		if (!r) { setWebglError(true); return false; }
		r.setMinimap(miniRef.current);
		rendererRef.current = r;
		meshSigRef.current = seatCarsRef.current.join(',');
		return true;
	}, []);

	/** Seat the given bolides. The renderer builds one silhouette per seat when it is created,
	 *  so a different field means a new renderer — otherwise everyone drives the base shape. */
	const seatCars = useCallback((ids: string[]) => {
		seatCarsRef.current = ids;
		if (rendererRef.current && meshSigRef.current === ids.join(',')) return;
		rendererRef.current?.dispose();
		rendererRef.current = null;
		ensureRenderer();
	}, [ensureRenderer]);

	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	// Ref callback, not an effect: it fires once when the end card mounts, and the arena canvases
	// still hold the final frame at that point.
	const finalMapRef = useCallback((el: HTMLCanvasElement | null) => {
		if (el) rendererRef.current?.snapshotMap(el);
	}, []);

	const endGame = useCallback(() => {
		const s = stateRef.current;
		stop();
		sfx.stopLoops();
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
		const hero = s.cars[s.hero - 1];
		const dt = Math.min(now - lastRef.current, 200);
		lastRef.current = now;
		accRef.current += dt;
		const k = keysRef.current, d = dragRef.current;
		// A key is all-or-nothing, so ramp it: tapped straight to ±1 the car snaps to full
		// lock and there is no way to hold a shallow line. The ramp advances per PHYSICS step,
		// not per rendered frame, so how far the wheel is over never depends on the frame rate.
		const target = (k.right ? 1 : 0) - (k.left ? 1 : 0);
		const rate = (STEP / 1000) * KEY_RAMP;
		// No brake anywhere: -1 is the car's base speed, and the gas is the only way up from it.
		const throttle = d.active ? d.throttle : (k.up ? 1 : -1);
		const net = onlineRef.current;
		while (runningRef.current && accRef.current >= STEP) {
			accRef.current -= STEP;
			keySteerRef.current += Math.max(-rate, Math.min(rate, target - keySteerRef.current));
			const steer = d.active ? d.steer : keySteerRef.current;
			// A guest only drives its own car; the host rules on the grid and sends the verdict.
			if (net.active && !net.host) stepGuest(s, steer, throttle, STEP / 1000);
			else stepGame(s, steer, throttle, STEP / 1000);
		}
		const alpha = Math.min(1, accRef.current / STEP);
		// Only the hero is audible: a bot dying every few seconds would be constant chatter.
		for (const e of s.events) {
			if (e.type === 'capture') { if (e.id === s.hero) sfx.capture(e.gain); }
			else if (e.type === 'kill') { if (e.killer === s.hero) sfx.kill(); }
			else if (e.type === 'death') { if (e.isPlayer) { deathsRef.current++; sfx.death(); setFirstDeath(deathsRef.current === 1); } }
			else if (e.type === 'snap') { if (e.isPlayer) sfx.snap(); }
			else if (e.type === 'win') { if (e.id === s.hero) sfx.win(); else sfx.lose(); }
			else if (e.type === 'respawn') {
				// A driver we just put back home keeps sending poses from the crash site for one RTT.
				ignoreRef.current[e.id] = s.clock + 1;
				if (e.id === s.hero) sfx.respawn();
			}
		}
		if (net.active && net.host) collectEvents(s, pendingRef.current);
		if (r) r.frame(s, alpha, dt / 1000);
		s.events.length = 0; // consumed by the renderer (FX) this frame

		// Every frame, unconditionally: 0 is how a loop is stopped, and it fades instead of cutting.
		const sp01 = Math.min(1, hero.speed / hero.cfg.maxSpeed);
		// The whole [-1, 1] is now gas, so clamping the negative half to 0 would leave half the
		// throw with an identical engine note.
		sfx.engine(sp01, (throttle + 1) / 2);
		sfx.skid(hero.drifting ? sp01 : 0);
		sfx.scrape(hero.scraping ? sp01 : 0);

		if (net.active) {
			netAccRef.current += dt;
			if (netAccRef.current >= NET_MS) {
				netAccRef.current = 0;
				const m = matchRef.current;
				if (m && net.host) m.sendSim(buildSim(s, pendingRef.current));
				else if (m && hero?.alive) m.sendPose({ i: m.selfId, p: readPose(hero) });
			}
		}

		bestPctRef.current = Math.max(bestPctRef.current, pct(s, s.hero));
		hudAccRef.current += dt;
		if (hudAccRef.current >= 140) {
			hudAccRef.current = 0;
			// Written straight onto the node, like the joystick: React never rerenders for this.
			vigRef.current?.style.setProperty('--bo-rush', (r?.fx.rush ?? 0).toFixed(2));
			syncBoard();
			setRespawnIn(hero.alive ? 0 : Math.max(1, Math.ceil(hero.respawnAt - s.clock)));
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
		setFirstDeath(false);
		setLeft(CFG.timeLimit);
		setStartHint(true);
		rafRef.current = requestAnimationFrame(frame);
	}, [frame]);

	/* The touch hint is a race-start chip, not permanent HUD: it must leave on its own. */
	useEffect(() => {
		if (!startHint) return;
		const t = setTimeout(() => setStartHint(false), 2600);
		return () => clearTimeout(t);
	}, [startHint]);

	/** Start a run for the given seed/diff and go live. Offline: car 1 is ours, the rest are bots. */
	const launch = useCallback((seed: number, diff: number) => {
		const s = stateRef.current;
		const ids = offlineCars(carRef.current, seed);
		resetGame(s, seed, diff, ids);
		s.hero = 1;
		s.record = false;
		for (const c of s.cars) { c.remote = false; c.isBot = c.id !== 1; }
		applyLabels(NAMES.slice());
		seatCars(ids);
		rendererRef.current?.reset();
		rendererRef.current?.resize();
		setSubmitVal(undefined);
		syncBoard();
		setPhase('playing');
		run();
	}, [run, syncBoard, applyLabels, seatCars]);

	/** On a touch device the page-sized board is a stamp, so borrow the shared "Plein écran"
	 *  button. It must stay inside the click handler or the browser refuses the request. */
	const goImmersive = useCallback(() => {
		if (!window.matchMedia?.('(pointer: coarse)').matches) return;
		if (document.querySelector('.game-page.gf-full')) return;
		document.querySelector<HTMLButtonElement>('.game-head .gf-btn')?.click();
	}, []);

	const play = useCallback(async () => {
		sfx.unlock();
		goImmersive();
		setGarage(false);
		if (!ensureRenderer()) return;
		modeRef.current = mode;
		if (mode === 'libre') {
			dailyBestRef.current = 0;
			launch((Math.random() * 2 ** 31) >>> 0, 1);
			trackGame(gameId, 'game_started', { mode: 'free', car: carRef.current });
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
		trackGame(gameId, 'game_started', { mode: 'daily', car: carRef.current });
	}, [ensureRenderer, mode, launch, gameId, goImmersive]);

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
			const peer = peers.find((p) => p.id === who);
			labs[id] = !who ? NAMES[id] : who === m.selfId ? 'Toi' : (peer && peerNameOf(peer.name)) || 'Joueur';
		}
		applyLabels(labs);

		// Seats and cars are read from the same message at the same moment: if they ever drifted
		// apart by one, every client would simulate different physics and the race would desync.
		const cars = goCars(go, CAR_COUNT);
		const s = stateRef.current;
		resetGame(s, go.seed, go.diff, cars);
		s.hero = seat + 1;
		s.record = host; // only the host logs trail cells for broadcast
		for (const c of s.cars) {
			const taken = c.id - 1 < go.ids.length;
			c.isBot = !taken;
			// The host drives the bots; a guest owns nothing but its own car.
			c.remote = host ? taken && c.id !== s.hero : c.id !== s.hero;
		}
		seatCars(cars);
		m.setPlaying(true);
		setStatus('');
		setSubmitVal(undefined);
		setGarage(false);
		rendererRef.current?.reset();
		rendererRef.current?.resize();
		syncBoard();
		setPhase('playing');
		run();
		trackGame(gameId, 'game_started', { mode: 'online', car: cars[seat] });
	}, [ensureRenderer, applyLabels, syncBoard, run, seatCars, gameId]);

	const startOnlineRace = useCallback(() => {
		const m = matchRef.current;
		if (!m) return;
		const seed = (Math.random() * 2 ** 31) >>> 0;
		const ids = m.ids();
		const peers = m.peers();
		// Parallel to `ids` and padded to the full grid, so empty seats get a bot bolide too.
		const cars = Array.from({ length: CAR_COUNT }, (_, i) => {
			const who = ids[i];
			if (!who) return botCar(seed, i);
			if (who === m.selfId) return carRef.current;
			return peerCarOf(peers.find((p) => p.id === who)?.name ?? '');
		});
		const go: GoMsg = { seed, diff: 1, ids, cars };
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
				const c = stateRef.current.cars[i];
				if (!c || !c.remote || id === m.selfId || here.has(id)) return;
				c.remote = false;
				c.isBot = true;
			});
		});
		m.onLobby((l) => {
			setLobbyIn(l.in);
			if (l.in >= 0 && l.in <= 3) sfx.countdown(l.in);
		});
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

	const enterLobby = useCallback(async (make: (name: string) => Promise<Match | null>, code: string | null, fail: string) => {
		if (!multiplayerAvailable()) { setStatus('Multijoueur indisponible.'); return; }
		sfx.unlock();
		goImmersive();
		setStatus('');
		setGarage(false);
		setMpCode(code);
		setMpPhase('connecting');
		rejoinRef.current = { make, code, fail };
		const m = await make(tagName(carRef.current, me16()));
		if (!m) { setMpPhase('menu'); setStatus(fail); return; }
		matchRef.current = m;
		countRef.current = -1;
		seenRef.current = 0;
		setLobbyIn(-1);
		wire(m);
		setMpPhase('lobby');
	}, [wire, goImmersive]);

	const me16 = () => (playerName() || 'Joueur').slice(0, 16);
	const mpQuick = () => enterLobby((n) => joinRandom(n), null, 'Aucun salon libre, réessaie.');
	const mpCreate = () => { const c = makeCode(); return enterLobby((n) => joinByCode(n, c), c, 'Connexion impossible.'); };
	const mpJoin = () => {
		const c = codeInput.trim().toUpperCase();
		if (!c) return;
		return enterLobby((n) => joinByCode(n, c), c, 'Code plein ou invalide.');
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
			if (countRef.current >= 0 && countRef.current <= 3) sfx.countdown(countRef.current); // the host never hears its own broadcast
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
		setGarage(false);
		setMpPhase('menu');
		setPhase('menu');
	}, [stop, leaveOnline]);

	/* ---------- garage ---------- */

	/** Presence announces the car inside the driver name and net.ts cannot re-announce it,
	 *  so swapping bolides in a lobby is a quick leave and re-join of the same room. */
	const rejoinLobby = useCallback(async () => {
		const j = rejoinRef.current;
		if (!j) return;
		matchRef.current?.leave();
		matchRef.current = null;
		onlineRef.current = { host: false, active: false };
		setRoster([]);
		setAmHost(false);
		setLobbyIn(-1);
		setMpPhase('connecting');
		await new Promise((r) => setTimeout(r, 900)); // let our old presence drop before we re-appear
		await enterLobby(j.make, j.code, j.fail);
	}, [enterLobby]);

	const pickCar = useCallback((id: string) => {
		selectCar(id);
		const now = selectedCar();
		carRef.current = now;
		setCar(now);
		sfx.unlock();
		sfx.ui();
		trackEvent('bolides:pick_car', { car: now });
		if (runningRef.current) return;
		if (mpPhase === 'lobby') { void rejoinLobby(); return; }
		// Refresh the still preview so the menu shows the bolide that was just picked.
		const s = stateRef.current;
		const ids = offlineCars(now, s.seed);
		resetGame(s, s.seed, s.diff, ids);
		seatCars(ids);
		rendererRef.current?.reset();
		rendererRef.current?.resize();
		rendererRef.current?.frame(s, 1, 0);
	}, [mpPhase, rejoinLobby, seatCars]);

	const buy = useCallback((b: Bolide) => {
		if (!buyCar(b.id, b.price)) return;
		trackEvent('cocottes:buy_car', { car: b.id, price: b.price });
		setCoins(balance());
		setBought({ id: b.id, price: b.price });
		pickCar(b.id);
		sfx.win(); // spending a whole balance deserves more than a click
	}, [pickCar]);

	const openGarage = useCallback(() => {
		sfx.unlock();
		setCoins(balance());
		setBought(null);
		setGarage(true);
	}, []);

	/** Bring a row to the top of the list viewport. Scrolling the <ul> itself, not
	 *  scrollIntoView, so the page behind the modal never jumps. */
	const showCar = useCallback((id: string) => {
		const ul = carsRef.current;
		const li = ul?.querySelector<HTMLElement>(`[data-car="${id}"]`);
		if (!ul || !li) return;
		ul.scrollTop = Math.max(0, li.offsetTop - ul.offsetTop - 4);
	}, []);

	useEffect(() => { if (garage) showCar(car); }, [garage, car, showCar]);

	useEffect(() => {
		if (!bought) return;
		showCar(bought.id);
		const t = setTimeout(() => setBought(null), 1700);
		return () => clearTimeout(t);
	}, [bought, showCar]);

	const toggleSound = useCallback(() => {
		const on = !sfx.isEnabled();
		sfx.setEnabled(on);
		setSound(on);
	}, []);

	/* Show the arena as a still preview behind the menu; wire resize + cleanup. */
	useEffect(() => {
		const s = stateRef.current;
		const pick = selectedCar();
		carRef.current = pick;
		setCar(pick);
		const ids = offlineCars(pick, s.seed);
		resetGame(s, s.seed, s.diff, ids);
		seatCarsRef.current = ids;
		if (ensureRenderer()) {
			rendererRef.current!.resize();
			rendererRef.current!.frame(s, 1, 0);
		}
		// Resizing clears the buffer, so a paused board (menu, end card) must be redrawn or it
		// goes black — visible now that the overlays no longer cover the whole board.
		const onResize = () => {
			const r = rendererRef.current;
			if (!r) return;
			r.resize();
			if (!runningRef.current) r.frame(stateRef.current, 1, 0);
		};
		const onFs = () => requestAnimationFrame(onResize);
		// A racer that keeps revving in a background tab is the worst bug this file can ship.
		const onHide = () => { if (document.hidden) sfx.stopLoops(); };
		const onGesture = () => sfx.unlock(); // iOS refuses to start audio outside a gesture
		window.addEventListener('resize', onResize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pointerdown', onGesture, { once: true });
		window.addEventListener('keydown', onGesture, { once: true });
		return () => {
			window.removeEventListener('resize', onResize);
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('visibilitychange', onHide);
			window.removeEventListener('pointerdown', onGesture);
			window.removeEventListener('keydown', onGesture);
			stop();
			sfx.stopLoops();
			rendererRef.current?.dispose();
			rendererRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* The balance can change from another island on the page (the cocoin bar, a toast). */
	useEffect(() => {
		const sync = () => setCoins(balance());
		sync();
		window.addEventListener(WALLET_EVENT, sync);
		return () => window.removeEventListener(WALLET_EVENT, sync);
	}, []);

	/* Read-only snapshot for the Playwright smoke checks (harmless). */
	useEffect(() => {
		const w = window as unknown as { __bolides?: () => unknown };
		w.__bolides = () => ({ car: carRef.current, seats: seatCarsRef.current, sound: sfx.stats() });
		return () => { delete w.__bolides; };
	}, []);

	/* Keyboard: steer (left/right) + gas (up). There is no brake key: the car always rolls. */
	useEffect(() => {
		const NAV = new Set([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
		const set = (key: string, down: boolean): boolean => {
			const r = keysRef.current;
			if (key === 'ArrowLeft' || key === 'a' || key === 'q') return ((r.left = down), true);
			if (key === 'ArrowRight' || key === 'd') return ((r.right = down), true);
			if (key === 'ArrowUp' || key === 'w' || key === 'z') return ((r.up = down), true);
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

	/* Touch/mouse: a relative joystick where the finger lands — how FAR it is dragged is the
	   speed, how far sideways is the steer. Positioned via refs so dragging never rerenders. */
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
			d.active = true; d.ox = cx; d.oy = cy; d.steer = 0; d.throttle = -1; // -1 is the floor, not a brake
			if (joyBaseRef.current) joyBaseRef.current.style.display = 'block';
			if (joyKnobRef.current) joyKnobRef.current.style.display = 'block';
			positionJoy(cx, cy, 0, 0);
		},
		(cx, cy) => {
			const d = dragRef.current;
			if (!d.active) return;
			const dx = cx - d.ox, dy = cy - d.oy;
			d.steer = expo(Math.max(-1, Math.min(1, dx / JOY_R)));
			// Speed is the DISTANCE from where the finger landed, whatever the direction. On the
			// old up/down axis, pulling sideways to steer cut the throttle, so every corner was
			// paid for in speed. Now a full-lock throw is also full gas.
			d.throttle = Math.min(1, Math.hypot(dx, dy) / JOY_R) * 2 - 1;
			positionJoy(d.ox, d.oy, dx, dy);
		},
		() => {
			const d = dragRef.current;
			d.active = false; d.steer = 0; d.throttle = -1;
			if (joyBaseRef.current) joyBaseRef.current.style.display = 'none';
			if (joyKnobRef.current) joyKnobRef.current.style.display = 'none';
		},
	);

	// Same sort as net.ts ids(): index in this list is the seat, so the dot matches the car colour.
	const selfId = matchRef.current?.selfId ?? '';
	const seatList = [
		...roster.map((p) => ({ id: p.id, name: peerNameOf(p.name), car: peerCarOf(p.name), me: false })),
		{ id: selfId, name: 'Toi', car, me: true },
	].sort((a, b) => (a.id < b.id ? -1 : 1));

	const mine = carById(car);
	const garageButton = (
		<button className="bo-second bo-garagebtn" onClick={openGarage}>
			🏎️ Garage · {mine.emoji} {mine.label}
		</button>
	);

	const owned = new Set(ownedCars().map((b) => b.id));
	const carPicker = (
		<div className="bo-overlay bo-garageoverlay">
			<div className="bo-card bo-garagecard">
				<div className="bo-garagehead">
					<h2>Garage</h2>
					<p className="bo-wallet">
						<Cocoin size={16} /> <strong>{coins}</strong> <span>cocoins</span>
						{bought && <em className="bo-spend">−{bought.price}</em>}
					</p>
				</div>
				<p className="bo-legend"><span /> Repère&nbsp;: la Cocotte GT vaut 3 plots sur chaque axe.</p>
				<ul className="bo-cars" ref={carsRef}>
					{BOLIDES.map((b) => {
						const has = owned.has(b.id);
						const on = b.id === car;
						const short = b.price - coins;
						return (
							<li
								key={b.id}
								data-car={b.id}
								className={`${on ? 'on' : ''}${bought?.id === b.id ? ' just' : ''}`}
								style={{ '--bo-tint': b.tint } as CSSProperties}
							>
								<span className="bo-caremoji"><CarArt id={b.id} tint={b.tint} /><i>{b.emoji}</i></span>
								<div className="bo-carbody">
									<div className="bo-carhead">
										<strong className="bo-carname">{b.label}</strong>
										{has ? (
											<button
												className={`bo-pick ${on ? 'on' : ''}`}
												onClick={() => pickCar(b.id)}
												disabled={on}
											>{bought?.id === b.id ? '✓ Débloqué !' : on ? '✓ Équipé' : 'Choisir'}</button>
										) : (
											<span className="bo-buywrap">
												<button
													className="bo-buy"
													disabled={coins < b.price}
													onClick={() => buy(b)}
													aria-label={`Acheter ${b.label} pour ${b.price} cocoins`}
													title={coins < b.price ? `Il te manque ${short} cocoins` : undefined}
												>
													Acheter {b.price} <Cocoin size={13} />
												</button>
												{coins < b.price && <em className="bo-short">manque {short}</em>}
											</span>
										)}
									</div>
									<span className="bo-carbars">
										{BAR_LABELS.map(([k, fr]) => {
											const v = b.bars[k];
											// Below the reference the whole bar warns; above it, only the bonus pips glow.
											const pip = (i: number) => (i >= v ? '' : v < REF_BAR ? 'on down' : i >= REF_BAR ? 'on up' : 'on');
											return (
												<span key={k} className="bo-statline">
													<em>{fr} <b>{v}</b></em>
													<span className="bo-statbar" role="img" aria-label={`${fr} ${v} sur 5`}>
														{PIPS.map((i) => <span key={i} className={pip(i)} />)}
													</span>
												</span>
											);
										})}
									</span>
									<p className="bo-pitch">{b.pitch}</p>
								</div>
							</li>
						);
					})}
				</ul>
				<p className="bo-fair">
					Aucun bolide n'est plus fort qu'un autre&nbsp;: taux de victoire mesuré entre 22&nbsp;% et 29&nbsp;%
					sur 1 200 courses simulées. Ils se jouent différemment, c'est tout.
				</p>
				<button className="bo-play bo-garageclose" onClick={() => setGarage(false)}>Fermer</button>
			</div>
		</div>
	);

	return (
		<div className={`bo-root${phase === 'playing' ? ' racing' : ''}`}>
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
				<canvas ref={canvasRef} className="bo-canvas" role="img" aria-label="Caisses à peinture" onPointerDown={drag.onPointerDown} />

				{/* Before the minimap and the standings in DOM order, so it never darkens them. */}
				{phase === 'playing' && (
					<div className="bo-vignette" ref={vigRef}><i className="bo-rushtint" /></div>
				)}

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
						{/* Rank order, always: a pinned hero row contradicts its own ordinal and reads
						    as last place. The accent bar on .me is what makes it findable. */}
						{board.map((r) => (
							<li key={r.id} className={r.me ? 'me' : ''}>
								<span className="bo-row">
									<span className={`bo-dot bo-dot-${r.id}`} style={{ backgroundColor: hex(PALETTE[r.id]) }} />
									<b className="bo-rank">{r.rank}<sup>{r.rank === 1 ? 'er' : 'e'}</sup></b>
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
						<strong style={{ '--bo-ring': respawnIn / CFG.respawnPlayer } as CSSProperties}>{respawnIn}</strong>
						<span>{firstDeath ? 'Retour au départ, ton terrain reste à toi.' : 'Retour au départ…'}</span>
					</div>
				)}

				{phase === 'playing' && startHint && respawnIn === 0 && (
					<div className="bo-startchip">Glisse&nbsp;: écart = vitesse, côté = braquer</div>
				)}

				{webglError && <div className="bo-overlay"><div className="bo-card">3D indisponible (WebGL manquant).</div></div>}

				{garage && !webglError && carPicker}

				{phase === 'menu' && !webglError && !garage && mode === 'online' && (
					<div className="bo-overlay">
						<div className="bo-card">
							{mpPhase === 'lobby' ? (
								<>
									<h2>Salon</h2>
									{mpCode && <p className="bo-code">Code&nbsp;: <strong>{mpCode}</strong></p>}
									<ul className="bo-roster">
										{seatList.map((p, i) => (
											<li key={p.id} className={p.me ? 'me' : ''}>
												<span className={`bo-dot bo-dot-${i + 1}`} style={{ backgroundColor: hex(PALETTE[i + 1]) }} />{p.name}
												<span className="bo-carchip">{carById(p.car).emoji} {carById(p.car).label}</span>
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
									{garageButton}
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
									{garageButton}
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

				{phase === 'menu' && !webglError && !garage && mode !== 'online' && (
					<div className="bo-overlay">
						<div className="bo-card">
							<h2>Caisses à peinture</h2>
							<p className="bo-sub">
								Sors de ta zone, trace une boucle, reviens chez toi pour <strong>repeindre</strong>.
								<strong> {Math.round(CFG.timeLimit / 60)} minutes</strong>, ou victoire immédiate
								à <strong>{CFG.winPct} %</strong>.
							</p>
							<p className="bo-modehint">
								{mode === 'defi'
									? `Arène du jour · ${dailyWeekdayLabel()} · même setup pour tous · classement partagé`
									: 'Arène aléatoire · score local'}
							</p>
							<button className="bo-play" onClick={play}>▶ Jouer</button>
							{garageButton}
							{status && <p className="bo-hint">{status}</p>}
							<p className="bo-hint">Glisse&nbsp;: plus tu t'éloignes du doigt, plus tu vas vite (pas de frein) ; le côté braque. Doucement ça tourne court&nbsp;; tenir le virage sur la peinture (ou à fond sur le sol nu) fait drifter. Clavier&nbsp;: flèches ou ZQSD.</p>
						</div>
					</div>
				)}

				{phase === 'dead' && !garage && (
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
							{/* Map beside the score, not above it: stacked, it pushed Rejouer under the
							    card's own scroll on a windowed desktop board (487px of content for 382). */}
							<div className="bo-recap">
								<canvas ref={finalMapRef} className="bo-finalmap" width={320} height={320} role="img" aria-label="Carte finale de l'arène" />
								<div className="bo-recaptext">
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
								</div>
							</div>
							{mode === 'online' ? (
								<>
									<p className="bo-hint bo-rematch">
										{roster.length === 0
											? 'Plus personne dans le salon — relance contre les bots ou quitte.'
											: lobbyIn > 0 ? `Revanche dans ${lobbyIn}…` : 'Revanche imminente…'}
									</p>
									{amHost && <button className="bo-play" onClick={startOnlineRace}>↺ Relancer</button>}
									{garageButton}
									<button className="bo-quit bo-leave" onClick={leaveOnline}>Quitter le salon</button>
								</>
							) : (
								<>
									<button className="bo-play" onClick={play}>↺ Rejouer</button>
									{garageButton}
								</>
							)}
						</div>
					</div>
				)}
			</div>

			<div className="bo-actions">
				{phase === 'playing' && mode !== 'online' && <button className="bo-restart" onClick={play}>↺ Recommencer</button>}
				{phase === 'playing' && <button className="bo-quit" onClick={backToMenu}>Quitter</button>}
				<button
					className="bo-act"
					onClick={toggleSound}
					aria-pressed={sound}
					aria-label="Son"
					title={sound ? 'Couper le son' : 'Activer le son'}
				>{sound ? '🔊' : '🔇'}</button>
			</div>

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
				<strong>Glisse le doigt</strong> sur l'écran : la caisse n'a pas de frein, elle roule toujours.
				C'est l'<strong>écart au point où tu as posé le doigt</strong> qui donne la vitesse, dans n'importe
				quelle direction&nbsp;: doigt immobile = allure minimale, doigt loin = plein gaz. Le côté (gauche/droite)
				braque. Braquer à fond coûte donc zéro vitesse (au clavier&nbsp;: flèches ou ZQSD, ↑ = gaz).
				Plus tu roules lentement, plus tu tournes court&nbsp;: au ralenti la caisse pivote presque sur place,
				à pleine vitesse elle ouvre grand le virage.
				Ce qui fait <strong>drifter</strong>, c'est l'appui, pas le coup de volant&nbsp;: sur la
				<strong> peinture fraîche</strong> il suffit de <strong>tenir</strong> le virage à allure normale pour partir
				en travers&nbsp;; sur le <strong>sol nu</strong> les pneus tiennent, sauf à fond. Ramène le doigt
				vers son point de départ et l'adhérence revient. En glisse tu perds de la vitesse mais tu boucles
				plus court&nbsp;: c'est le marché.
				Le but&nbsp;: être le premier à contrôler {CFG.winPct}&nbsp;% de l'arène.
				Sors, boucle, reviens → capture. Recroiser ta propre trace efface la boucle en cours, sans plus&nbsp;:
				tu repars de là. En revanche, si un rival coupe ta trace, tu réapparais au point de départ après 3&nbsp;s
				pendant que les autres continuent — alors coupe la leur en premier. Une trace se coupe
				<strong> partout</strong>, y compris chez toi&nbsp;: le rival qui traverse ton territoire y laisse
				une ligne que tu peux trancher sans sortir de chez toi.
				{mode === 'defi' && ' Le défi du jour partage la même arène et le même classement pour tout le monde.'}
				{mode === 'online' && ` En ligne, jusqu'à ${MAX_PLAYERS} pilotes courent dans la même arène : partie rapide pour tomber sur n'importe qui, code ami pour jouer entre vous. Les places libres restent tenues par des bots.`}
			</p>
		</div>
	);
}

const CSS = `
.bo-root {
  --bo-accent: var(--accent-regular);
  /* On-glass palette: the cards float over a neon-midnight arena, so they cannot borrow the
     page greys — in the light theme those turn every panel into a white slab. */
  --bo-neon: #B981FF; --bo-blue: #3D8BFF; --bo-ink: #E8E2FF; --bo-ink-dim: #B4A8DC;
  --bo-line: rgba(61,139,255,0.32);
  width: 100%; max-width: 640px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body);
}
.bo-boardwrap { position: relative; width: 100%; aspect-ratio: 16 / 10; margin-inline: auto; }
.bo-canvas {
  width: 100%; height: 100%; display: block; background: #05030F;
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
.game-page.gf-full .bo-act { font-size: 14px; padding: 4px 10px; min-width: 32px; }
.bo-leaderboard {
  position: absolute; top: 8px; right: 8px; margin: 0; padding: 8px 12px; list-style: none;
  background: rgba(0,0,0,0.55); color: #fff; border-radius: 10px; font-size: 12.5px; font-weight: 700;
  font-variant-numeric: tabular-nums; display: flex; flex-direction: column; gap: 3px;
}
.bo-leaderboard li { display: flex; flex-direction: column; gap: 3px; min-width: 118px; }
.bo-row { display: flex; align-items: center; gap: 6px; }
.bo-rank { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.62); min-width: 15px; }
.bo-rank sup { font-size: 0.75em; }
.bo-bar { display: block; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.16); overflow: hidden; }
.bo-bar span { display: block; height: 100%; border-radius: 2px; transition: width 0.14s linear; }
/* The rows reshuffle by rank, so "find me" rides on the accent bar, not on a fixed position. */
.bo-leaderboard li.me {
  color: #fff; background: rgba(61,139,255,0.26); border-left: 3px solid var(--bo-blue);
  margin-left: -9px; padding: 2px 0 2px 6px; border-radius: 0 6px 6px 0;
}
.bo-leaderboard li.me .bo-rank { color: #fff; }
.bo-leaderboard li.goal { display: block; color: rgba(255,255,255,0.6); font-weight: 600; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.18); padding-top: 4px; margin-top: 1px; }
/* The floor hatch fixed ownership on the ground, but the standings are where you actually read
   the race: Vert and Jaune merge under deuteranopia, Rouge and Vert under protanopia. Each dot
   repeats the pattern its own territory carries, so the HUD and the floor name the same rival.
   Set the colour with backgroundColor, never the background shorthand: it wipes the pattern. */
.bo-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.5); }
.bo-dot-2 { background-image: repeating-linear-gradient(45deg, rgba(0,0,0,0.5) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.5) 0 2px, transparent 2px 4px); }
.bo-dot-3 { background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.55) 0 1.5px, transparent 1.5px 3px); }
.bo-dot-4 { background-image: repeating-linear-gradient(-45deg, rgba(0,0,0,0.55) 0 2px, transparent 2px 4px); }
/* A pill under the action, not a panel over it: dying is the moment you most need to see the
   board — who cut you, and where. */
.bo-respawn, .bo-startchip {
  position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 3;
  max-width: calc(100% - 20px); pointer-events: none; color: #fff;
  background: rgba(6,8,16,0.80); border: 1px solid rgba(255,255,255,0.20); border-radius: 999px;
  box-shadow: 0 3px 14px rgba(0,0,0,0.5);
}
.bo-respawn { display: flex; align-items: center; gap: 8px; padding: 4px 14px 4px 4px; border-radius: 15px; }
.bo-respawn strong {
  flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  font-family: var(--font-brand); font-size: 14px; font-weight: 600; color: #fff;
  background: conic-gradient(#FF6B8B calc(var(--bo-ring, 1) * 1turn), rgba(255,255,255,0.16) 0);
  box-shadow: inset 0 0 0 3px rgba(6,8,16,0.92);
}
.bo-respawn span { font-size: 11.5px; font-weight: 600; }
.bo-startchip {
  display: none; padding: 6px 14px; font-size: 12px; font-weight: 700; white-space: nowrap;
  animation: bo-chip 2.6s ease-out forwards;
}
@keyframes bo-chip { 0% { opacity: 0; } 12% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@media (pointer: coarse) { .bo-startchip { display: block; } }
.game-page.gf-full .bo-respawn, .game-page.gf-full .bo-startchip { bottom: max(10px, calc(env(safe-area-inset-bottom) + 6px)); }
.bo-minimap {
  position: absolute; top: 8px; left: 8px; width: 108px; height: 108px; z-index: 1;
  border-radius: 8px; border: 1px solid rgba(201,182,255,0.28); background: #05030F;
  pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.game-page.gf-full .bo-minimap { width: 132px; height: 132px; }
/* Corner falloff only — static, so it is rasterised once and never again. --bo-rush is written
   on it every 140 ms but only the child reads it, and only through opacity (compositor-only). */
.bo-vignette {
  position: absolute; inset: 0; z-index: 1; pointer-events: none; border-radius: 12px;
  background: radial-gradient(ellipse 82% 72% at 50% 46%, rgba(0,0,0,0) 58%, rgba(4,2,14,0.34) 100%);
  box-shadow: inset 0 0 70px rgba(21,11,46,0.36);
}
/* Speed. Radial streaks pointing away from the vanishing point read as velocity; the darkening
   the old vignette bought at full rush only made the frame smaller. */
.bo-rushtint {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  opacity: calc(var(--bo-rush, 0) * 0.62); will-change: opacity;
  background:
    repeating-conic-gradient(from 0deg at 50% 46%, rgba(255,160,240,0.30) 0deg 0.9deg, rgba(255,160,240,0) 0.9deg 7deg),
    radial-gradient(circle at 50% 46%, rgba(255,47,208,0) 30%, rgba(255,47,208,0.16) 100%);
  -webkit-mask-image: radial-gradient(circle at 50% 46%, transparent 32%, #000 92%);
  mask-image: radial-gradient(circle at 50% 46%, transparent 32%, #000 92%);
}
.game-page.gf-full .bo-vignette { border-radius: 0; }
.bo-joy-base, .bo-joy-knob { position: absolute; display: none; border-radius: 50%; pointer-events: none; transform: translate(-50%, -50%); z-index: 3; }
/* Over fullbright cyan territory a 4 % white ring is nothing: the joystick has to survive both
   the dark floor and a painted one. */
.bo-joy-base { width: 96px; height: 96px; background: rgba(0,0,0,0.28); border: 2px solid rgba(255,255,255,0.55); }
.bo-joy-knob { width: 34px; height: 34px; background: rgba(255,255,255,0.85); box-shadow: 0 0 0 2px rgba(0,0,0,0.4); }
.bo-actions { display: flex; gap: 10px; justify-content: center; margin-top: 0.7rem; }
.bo-restart, .bo-quit { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 8px 18px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.bo-restart { background: var(--bo-accent); color: var(--accent-text-over); border-color: transparent; }
.bo-act { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(10,10,22,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 6px 12px; min-width: 36px; cursor: pointer; backdrop-filter: blur(4px); }
.bo-act:hover:not(:disabled) { border-color: var(--bo-accent); color: #fff; }
.bo-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; padding: 8px; background: rgba(6,8,16,0.5); backdrop-filter: blur(2px); border-radius: 12px; }
/* Dark glass, not a page card: the blurred arena behind it stays part of the picture, and the
   first and last screens of a night race no longer flash white. A short board must scroll the
   card, never clip its last line. */
.bo-card {
  background: color-mix(in oklab, #150B2E 88%, transparent);
  backdrop-filter: blur(16px) saturate(1.15); -webkit-backdrop-filter: blur(16px) saturate(1.15);
  border: 1px solid var(--bo-line); border-radius: 18px; padding: 22px 26px; text-align: center;
  box-shadow: 0 0 24px rgba(255,46,99,0.16), 0 24px 60px rgba(0,0,0,0.6);
  color: var(--bo-ink); max-width: 360px; max-height: 100%; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--bo-neon) transparent;
}
.bo-card::-webkit-scrollbar { width: 8px; }
.bo-card::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.bo-card::-webkit-scrollbar-track { background: rgba(90,70,140,0.16); border-radius: 4px; }
.bo-card::-webkit-scrollbar-thumb { background: var(--bo-neon); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
.bo-card h2 { font-family: var(--font-brand); font-weight: 600; font-size: 26px; margin: 0 0 8px; color: var(--bo-blue); }
.bo-card strong { color: #fff; }
.bo-sub { color: var(--bo-ink-dim); font-size: 13px; margin: 0 0 12px; line-height: 1.55; }
.bo-modehint { color: var(--bo-ink-dim); font-size: 11.5px; margin: 0 0 14px; }
.bo-play { border: none; background: linear-gradient(180deg, #9333EA, #6D28D9); color: #fff; font: inherit; font-weight: 700; font-size: 16px; border-radius: 999px; padding: 12px 30px; cursor: pointer; box-shadow: 0 4px 18px rgba(147,51,234,0.45); }
.bo-hint { color: var(--bo-ink-dim); font-size: 11.5px; margin: 12px 0 0; }
.bo-score { font-size: 30px; font-weight: 800; margin: 4px 0 10px; color: var(--bo-neon); font-variant-numeric: tabular-nums; }
.bo-score span { display: block; font-size: 13px; font-weight: 600; color: var(--bo-ink-dim); margin-top: 2px; }
.bo-score sup { font-size: 0.6em; }
.bo-best { color: var(--bo-ink-dim); font-size: 13px; margin: 0 0 16px; }
.bo-best strong { color: #fff; }
/* Final arena, drawn from the same canvases as the overview. Dark plate under it, or the
   unclaimed tarmac blends into the card and the map loses its own edges. */
.bo-recap { display: flex; align-items: center; gap: 14px; margin: 6px 0 14px; }
.bo-recaptext { flex: 1; min-width: 0; }
.bo-recap .bo-score { margin: 0; }
.bo-recap .bo-best { margin: 6px 0 0; }
.bo-finalmap { flex: none; width: 132px; height: 132px; border-radius: 10px; border: 1px solid rgba(140,120,220,0.38); background: #05030F; box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
.bo-second { display: block; margin: 10px auto 0; border: 1.5px solid var(--bo-line); background: rgba(255,255,255,0.07); color: var(--bo-ink); font: inherit; font-weight: 600; font-size: 14px; border-radius: 999px; padding: 10px 22px; cursor: pointer; }
.bo-second:hover { border-color: var(--bo-blue); color: #fff; }
.bo-leave { display: block; margin: 12px auto 0; }
.bo-join { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }
.bo-join input {
  width: 108px; text-align: center; font: inherit; font-weight: 800; font-size: 18px; letter-spacing: 3px;
  text-transform: uppercase; border: 1.5px solid var(--bo-line); background: rgba(0,0,0,0.35); color: #fff;
  border-radius: 12px; padding: 8px 6px;
}
.bo-join button { border: 1.5px solid var(--bo-line); background: rgba(255,255,255,0.07); color: var(--bo-ink); font: inherit; font-weight: 600; font-size: 13px; border-radius: 12px; padding: 8px 14px; cursor: pointer; }
.bo-join button:disabled { opacity: 0.45; cursor: default; }
.bo-code { font-size: 13px; color: var(--bo-ink-dim); margin: 0 0 10px; }
.bo-code strong { font-size: 26px; letter-spacing: 5px; color: var(--bo-neon); font-family: var(--font-brand); }
.bo-roster { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 5px; align-items: center; font-size: 13.5px; font-weight: 600; }
.bo-roster li { display: flex; align-items: center; gap: 7px; }
.bo-roster li.me { color: #C9B6FF; }
.bo-carchip { font-size: 11.5px; font-weight: 600; color: var(--bo-ink-dim); }
.bo-rematch { margin-bottom: 4px; }

/* --- garage --- */
.bo-garagebtn { font-size: 13px; padding: 8px 18px; }
/* A shop sized to the board can only ever show one and a half cars, and on a phone the board is
   206px tall — so the garage is a viewport modal, not a board child. */
.bo-garageoverlay {
  position: fixed; inset: 0; z-index: 10000; align-items: center; border-radius: 0;
  padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
  background: rgba(6,8,16,0.66); backdrop-filter: blur(6px);
}
.bo-garagecard {
  max-width: 720px; width: 100%; margin: 0 auto; text-align: left; max-height: 100%;
  display: flex; flex-direction: column; min-height: 0; padding: 12px 14px; overflow: hidden;
}
.bo-garagehead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.bo-garagecard h2 { font-size: 21px; margin: 0; }
.bo-wallet { display: flex; align-items: center; gap: 5px; margin: 0; font-size: 14px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
.bo-wallet span { font-size: 11px; font-weight: 600; color: var(--bo-ink-dim); }
/* The wallet number changing is not an event; this is. */
.bo-spend { font-style: normal; font-size: 13px; font-weight: 800; color: #FF6B8B; animation: bo-spend 1.1s ease-out forwards; }
@keyframes bo-spend { 0% { opacity: 0; transform: translateY(-6px); } 25% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(10px); } }
.bo-legend { display: flex; align-items: center; gap: 5px; margin: 0 0 8px; font-size: 9.5px; font-weight: 600; color: var(--bo-ink-dim); }
.bo-legend span { position: relative; width: 12px; height: 8px; border-radius: 2px; background: var(--bo-blue); }
.bo-legend span::after { content: ''; position: absolute; left: calc(60% - 0.5px); top: -3px; bottom: -3px; width: 1px; background: #fff; }
.bo-fair { margin: 8px 0; font-size: 10.5px; line-height: 1.45; color: var(--bo-ink-dim); background: rgba(0,0,0,0.28); border: 1px solid var(--bo-line); border-radius: 9px; padding: 6px 9px; }
.bo-cars {
  list-style: none; margin: 0; padding: 0 4px 12px 0; gap: 8px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); align-content: start;
  flex: 1; min-height: 180px; overflow-y: auto; scrollbar-gutter: stable;
  overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  scroll-snap-type: y proximity;
  scrollbar-width: thin; scrollbar-color: var(--bo-neon) transparent;
  /* Overlay scrollbars hide themselves at rest, so the fade is the only "more below" hint.
     The 12px bottom padding keeps it off the last row once you reach the end. */
  mask-image: linear-gradient(to bottom, #000 calc(100% - 14px), transparent);
}
.bo-cars::-webkit-scrollbar { width: 8px; }
.bo-cars::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.bo-cars::-webkit-scrollbar-track { background: rgba(90,70,140,0.16); border-radius: 4px; }
.bo-cars::-webkit-scrollbar-thumb { background: var(--bo-neon); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
/* Each card is lit by its own car: five light sources beat five grey boxes. */
.bo-cars li {
  display: flex; align-items: flex-start; gap: 9px; padding: 8px 10px; border-radius: 12px;
  background:
    radial-gradient(120% 130% at 6% -10%, color-mix(in srgb, var(--bo-tint, #B981FF) 22%, transparent), transparent 58%),
    rgba(255,255,255,0.05);
  border: 1px solid rgba(130,110,200,0.24); scroll-snap-align: start;
}
.bo-cars li.on {
  border-color: var(--bo-tint, var(--bo-neon));
  background:
    radial-gradient(120% 130% at 6% -10%, color-mix(in srgb, var(--bo-tint, #B981FF) 30%, transparent), transparent 62%),
    color-mix(in srgb, var(--bo-tint, #B981FF) 12%, rgba(255,255,255,0.05));
  box-shadow: inset 3px 0 0 var(--bo-tint, var(--bo-neon));
}
/* The old keyframe landed on the equipped styling the card would have anyway, so buying was a
   visual no-op. Spending a whole balance has to move. */
.bo-cars li.just { animation: bo-bought 1.6s cubic-bezier(0.2,0.9,0.3,1); }
@keyframes bo-bought {
  0% { transform: scale(1.04); box-shadow: 0 0 0 4px var(--bo-tint, #B981FF), 0 0 28px var(--bo-tint, #B981FF); }
  55% { transform: none; box-shadow: 0 0 0 2px var(--bo-tint, #B981FF), 0 0 18px color-mix(in srgb, var(--bo-tint, #B981FF) 60%, transparent); }
  100% { transform: none; box-shadow: inset 3px 0 0 var(--bo-tint, #B981FF); }
}
.bo-caremoji {
  position: relative; flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid;
  place-items: center; overflow: hidden;
  background: radial-gradient(circle at 50% 118%, var(--bo-tint, #B981FF) -40%, #0B0718 70%);
  border: 1px solid color-mix(in srgb, var(--bo-tint, #B981FF) 55%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--bo-tint, #B981FF) 40%, transparent);
}
.bo-carart { width: 30px; height: 44px; display: block; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--bo-tint, #B981FF) 70%, transparent)); }
.bo-caremoji i { position: absolute; right: 1px; bottom: 0; font-size: 11px; font-style: normal; line-height: 1; opacity: 0.9; }
.bo-carbody { flex: 1; min-width: 0; }
.bo-carhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; }
.bo-carname { font-size: 14px; font-weight: 700; color: #fff; }
.bo-carbars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 8px; margin: 5px 0 0; }
.bo-statline { display: flex; flex-direction: column; gap: 3px; }
.bo-statline em { font-style: normal; font-size: 8.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--bo-ink-dim); display: flex; justify-content: flex-start; gap: 4px; }
.bo-statline em b { color: #fff; font-size: 9.5px; }
/* Five countable pips beat a length you have to eyeball. Empty pips stay visible, the full tick
   over the third marks the free car's reference, green = above it, amber = below. */
.bo-statbar { position: relative; display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; height: 8px; }
.bo-statbar::after { content: ''; position: absolute; left: calc(60% - 0.5px); top: -3px; bottom: -3px; width: 1px; background: #fff; opacity: 0.85; }
.bo-statbar span { border-radius: 1.5px; background: rgba(150,130,210,0.32); }
.bo-statbar span.on { background: var(--bo-blue); }
.bo-statbar span.on.up { background: #3BE08A; }
.bo-statbar span.on.down { background: #FFB020; }
.bo-pitch { margin: 5px 0 0; font-size: 11px; line-height: 1.4; color: var(--bo-ink-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bo-cars li.on .bo-pitch, .bo-cars li:hover .bo-pitch { -webkit-line-clamp: 6; }
/* No hover means no escape hatch, and the clamp always cuts at the drawback clause. */
@media (hover: none) { .bo-pitch { -webkit-line-clamp: 4; } }
.bo-buywrap { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.bo-pick, .bo-buy {
  flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border: none; font: inherit; font-weight: 700; font-size: 11px; border-radius: 999px; padding: 5px 10px;
  cursor: pointer; background: var(--bo-neon); color: #1A0B2E; white-space: nowrap;
}
.bo-pick.on { background: var(--bo-tint, var(--bo-neon)); color: #0B0718; cursor: default; }
.bo-buy:disabled { background: rgba(255,255,255,0.09); color: var(--bo-ink-dim); cursor: not-allowed; }
.bo-short { font-style: normal; font-size: 9px; font-weight: 700; color: var(--bo-ink-dim); white-space: nowrap; }
.bo-garageclose { align-self: center; flex: none; font-size: 14px; padding: 9px 26px; margin-top: 2px; }
.bo-help { max-width: 460px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin: 1rem auto 0; }

/* --- narrow / short: the board is the game, the HUD is a garnish --- */
@media (max-width: 700px), (max-height: 560px) {
  .bo-boardwrap { aspect-ratio: 3 / 4; max-height: 70svh; }
  /* 3/4 pins the board to 436px on a 390px phone, so max-height never binds and 155px of the
     screen is wasted. While racing the board takes the height it is allowed. */
  .bo-root.racing .bo-boardwrap { aspect-ratio: auto; height: 70svh; max-height: none; }
  .bo-root.racing .bo-help, .bo-root.racing .bo-modetoggle { display: none; }
  /* The menu overlay is the idle state, not a modal: it must stay inside the board or it
     covers the mode tabs and the page for good. It gets a taller board and a tighter card
     instead, so the CTA still lands above the fold. */
  .bo-overlay { padding: 6px; }
  .bo-card { max-width: 100%; padding: 14px 15px; max-height: 100%; }
  .bo-card h2 { font-size: 22px; }
  .bo-sub { font-size: 12px; line-height: 1.45; margin-bottom: 8px; }
  .bo-modehint { margin-bottom: 10px; }
  .bo-play { font-size: 15px; padding: 11px 26px; }
  .bo-recap { gap: 10px; margin-bottom: 10px; }
  .bo-finalmap { width: 104px; height: 104px; }
  .bo-garagecard { padding: 12px 14px; }
  .bo-cars { grid-template-columns: 1fr; min-height: 40vh; }
  .bo-fair { font-size: 10px; margin: 6px 0; }
  .bo-minimap { width: 74px; height: 74px; top: 6px; left: 6px; }
  .bo-leaderboard { top: 6px; right: 6px; padding: 5px 7px; font-size: 10.5px; gap: 2px; }
  .bo-leaderboard li { min-width: 0; }
  .bo-leaderboard li.me { margin-left: -7px; padding-left: 4px; }
  /* On a 327px board the panel sat on the horizon, the only band that shows what is ahead.
     Leader + me is the whole story; the row after me covers the case where they are the same. */
  .bo-leaderboard li:not(:first-child):not(.me):not(.goal) { display: none; }
  /* The trailing :not(.goal) is load-bearing, not decoration: without it this rule scores one
     class less than the hide rule above and the runner-up stayed hidden whenever you led. */
  .bo-leaderboard li.me:first-child + li:not(.goal) { display: flex; }
  .bo-leaderboard .bo-dot { width: 10px; height: 10px; }
  .bo-leaderboard .bo-rank { font-size: 11px; }
  .bo-leaderboard .bo-rank sup { font-size: 1em; vertical-align: baseline; }
  .bo-leaderboard .bo-bar { display: none; } /* the % already carries it, and this is the look-ahead band */
  .bo-leaderboard li.goal { font-size: 10px; }
  .bo-help { font-size: 11.5px; }
  .bo-startchip { display: block; }
  .game-page.gf-full .bo-boardwrap, .game-page.gf-full .bo-root.racing .bo-boardwrap { max-height: none; height: auto; }
  .game-page.gf-full .bo-minimap { width: 84px; height: 84px; }
}
`;
