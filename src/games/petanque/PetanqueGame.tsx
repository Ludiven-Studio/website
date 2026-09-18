import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	makeTerrain, SURFACES, heightAt, PITCH_W, PITCH_L, type SurfaceId,
} from './terrain';
import {
	makeBoule, makeJack, place, stepSim, isSettled, throwVelocity,
	type Sim, type Boule, type Impact,
} from './engine';
import {
	initMatch13, applyJack, applyPlacedJack, applySettled, finishEnd, jackCheck, pointHolder,
	MIN_JACK, MAX_JACK, EDGE, BOULES_PER_SIDE, type Match13, type Side,
} from './rules13';
import { planThrow, planJack, launch } from './ai';
import {
	buildPitch3D, makeBouleMesh, makeCircleMesh, makeMarker, makeHalo, arcMesh, predictThrow,
	aimCamera, overviewCamera, elevationForPitch, addLights, makeFx, wx, wz,
	CAM_PITCH_MIN, CAM_PITCH_MAX, BOULE_R, type Pitch3D, type Fx,
} from './render3d';
import { usePointerDrag } from '../usePointerDrag';
import { isTypingTarget } from '../../lib/keyboard';
import { trackGame } from '../../lib/analytics';
import Celebration, { useCelebration } from '../../components/Celebration';

/* =====================================================
   PETANQUE — React island, 3D pitch (three.js).
   Glisser vers le haut = puissance, latéral = direction. L'inclinaison de la caméra décide de la
   hauteur du lob : rasante = portée haute, plongeante = roulette. Tête-à-tête en 13, 3 boules,
   règle officielle (celui qui n'a pas le point rejoue).
   Moteur pur et testé dans ./engine + ./rules13 ; ce fichier ne fait que le piloter.
   ===================================================== */

type Status = 'aim' | 'rolling' | 'placing' | 'end' | 'over';

const HUMAN: Side = 0;
const AI: Side = 1;
const STEP = 1000 / 60;

const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
type DiffKey = (typeof DIFF_ORDER)[number];
const DIFFS: Record<DiffKey, { label: string; skill: number; surface: SurfaceId; amp: number }> = {
	facile: { label: 'Facile', skill: 0.34, surface: 'terre-battue', amp: 0.018 },
	moyen: { label: 'Moyen', skill: 0.62, surface: 'gravier-fin', amp: 0.032 },
	difficile: { label: 'Difficile', skill: 0.86, surface: 'gravier-gros', amp: 0.050 },
};

const MIN_SPEED = 3.0;
const MAX_SPEED = 10.5;
const POWER_PX = 190; // vertical drag for full power
const YAW_PER_PX = 0.0021;
const YAW_MAX = 0.42; // rad off the lane axis — past this you are not on the pitch any more
const PITCH_PER_PX = 0.0042;
const CAM_DIST = 2.7;
const ROLL_PITCH = 0.40; // the view lifts while the boules run, whatever loft was chosen
const LOOK_TAU = 0.18;
const PITCH_TAU = 0.25;
const AI_THINK_MS = 700;
const END_CARD_MS = 2800;
const ROLL_CAP = 24; // s of simulated roll before we call it settled anyway

const DUST: Record<SurfaceId, number> = {
	'terre-battue': 0xc08a52,
	'gravier-fin': 0xa8a49a,
	'gravier-gros': 0x807a70,
	sable: 0xe8d2a0,
};

const LOFT_LABEL = (e: number): string => (e > 0.7 ? 'Portée' : e > 0.42 ? 'Demi-portée' : 'Roulette');

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
	Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	pitch: Pitch3D;
	lights: { dispose(): void };
	fx: Fx;
	bodies: THREE.Group; // boules + jack
	meshes: THREE.Mesh[]; // index-aligned with sim.bs
	circle: THREE.Mesh;
	marker: THREE.Mesh;
	rings: THREE.Group; // legal jack window, shown while throwing or placing it
	halos: THREE.Mesh[]; // index-aligned with sim.bs — see makeHalo
	arcAir: THREE.Mesh | null;
	arcRoll: THREE.Mesh | null;
}

/* Halo colours are the HUD's, not the boules': a steel boule and a bronze one are the same grey
   dot at 10 m, and the player has to know whose is whose to read the point. */
const HALO = [0x30d158, 0xff5f56, 0xffc107]; // you · opponent · jack
const HALO_PER_M = 0.016; // ring radius per metre of camera distance — ~20 px on a 700 px canvas
const HALO_MIN_R = 0.09; // m, so it never shrinks inside a boule up close

interface EndCard { text: string; mine: boolean }

const killMesh = (m: THREE.Mesh | null): void => {
	if (!m) return;
	m.geometry.dispose();
	(m.material as THREE.Material).dispose();
	m.parent?.remove(m);
};

/** The two guide rings that show where the jack may legally land. */
function windowRings(): THREE.Group {
	const g = new THREE.Group();
	for (const [r, c] of [[MIN_JACK, 0xffd166], [MAX_JACK, 0xffd166]] as const) {
		const geo = new THREE.RingGeometry(r - 0.035, r + 0.035, 96);
		geo.rotateX(-Math.PI / 2);
		const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
		m.renderOrder = 3;
		g.add(m);
	}
	g.visible = false;
	return g;
}

export default function PetanqueGame({ gameId }: { gameId: string }) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const arcPtsRef = useRef<THREE.Vector3[]>([]);

	const simRef = useRef<Sim | null>(null);
	const matchRef = useRef<Match13>(initMatch13(13, HUMAN));
	const jackRef = useRef<Boule | null>(null);
	const prevRef = useRef<{ x: number; y: number; z: number }[]>([]);
	const impactsRef = useRef<Impact[]>([]);
	const accRef = useRef(0);
	const alphaRef = useRef(1);
	const rollTimeRef = useRef(0);

	const statusRef = useRef<Status>('aim');
	const diffRef = useRef<DiffKey>('moyen');
	const aiPendingRef = useRef(false);
	const aiAtRef = useRef(0);
	const endAtRef = useRef(0);
	const rngRef = useRef(1); // AI plan counter — one per throw, so two plans never coincide

	// Aim state.
	const aimRef = useRef<{ x0: number; y0: number } | null>(null);
	const powerRef = useRef(0);
	const yawRef = useRef(0);
	const aimDirtyRef = useRef(false);
	const camPitchRef = useRef(0.55);
	const viewPitchRef = useRef(0.55);
	const overRef = useRef(false);
	const pinchRef = useRef<{ cy: number; pitch: number } | null>(null);
	const lookRef = useRef(new THREE.Vector3());
	const wantLook = useRef(new THREE.Vector3());
	const placeRef = useRef<{ x: number; y: number } | null>(null);

	const [match, setMatch] = useState<Match13>(matchRef.current);
	const [status, setStatus] = useState<Status>('aim');
	const [power, setPower] = useState(0);
	const [loft, setLoft] = useState(() => elevationForPitch(0.55));
	const [diff, setDiff] = useState<DiffKey>('moyen');
	const [over, setOver] = useState(false);
	const [card, setCard] = useState<EndCard | null>(null);
	const [webglError, setWebglError] = useState(false);
	const [placeOk, setPlaceOk] = useState(false);

	const won = match.phase === 'match-done' && match.winner === HUMAN;
	const { celebrating } = useCelebration(won);

	/* ---------- scene ---------- */

	const initScene = useCallback((): boolean => {
		if (g3Ref.current) return true;
		if (!canvasRef.current) return false;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
		} catch {
			setWebglError(true);
			return false;
		}
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 220);
		const lights = addLights(scene);
		const bodies = new THREE.Group();
		scene.add(bodies);
		const circle = makeCircleMesh();
		scene.add(circle);
		const marker = makeMarker(0x30d158);
		marker.visible = false;
		scene.add(marker);
		const rings = windowRings();
		scene.add(rings);

		g3Ref.current = {
			renderer, scene, camera, lights, bodies, circle, marker, rings,
			pitch: null as unknown as Pitch3D, // filled by newGame, which always runs next
			fx: makeFx(scene),
			meshes: [], halos: [], arcAir: null, arcRoll: null,
		};
		return true;
	}, []);

	const resize = useCallback(() => {
		const g = g3Ref.current, wrap = wrapRef.current;
		if (!g || !wrap) return;
		const w = wrap.clientWidth, h = wrap.clientHeight || Math.round(w * 0.625);
		g.renderer.setSize(w, h, false);
		g.camera.aspect = w / Math.max(1, h);
		g.camera.updateProjectionMatrix();
	}, []);

	/* ---------- bodies ---------- */

	const addBody = useCallback((b: Boule): Boule => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return b;
		s.bs.push(b);
		const m = makeBouleMesh(b.side);
		g.bodies.add(m);
		g.meshes.push(m);
		const h = makeHalo(b.side === -1 ? HALO[2] : HALO[b.side]);
		g.bodies.add(h);
		g.halos.push(h);
		prevRef.current.push({ x: b.x, y: b.y, z: b.z });
		return b;
	}, []);

	const clearBodies = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		for (const m of [...g.meshes, ...g.halos]) {
			g.bodies.remove(m);
			m.geometry.dispose();
			(m.material as THREE.Material).dispose();
		}
		g.meshes = [];
		g.halos = [];
		s.bs = [];
		prevRef.current = [];
		jackRef.current = null;
	}, []);

	const clearArc = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		killMesh(g.arcAir); killMesh(g.arcRoll);
		g.arcAir = g.arcRoll = null;
		g.marker.visible = false;
	}, []);

	/* ---------- a new game ---------- */

	const newGame = useCallback((key: DiffKey) => {
		if (!initScene()) return;
		const g = g3Ref.current;
		if (!g) return;
		const d = DIFFS[key];
		diffRef.current = key;
		setDiff(key);

		if (simRef.current) clearBodies();
		if (g.pitch) { g.scene.remove(g.pitch.group); g.pitch.dispose(); }
		const seed = (Math.random() * 1e9) | 0;
		const t = makeTerrain(seed, SURFACES[d.surface], d.amp);
		g.pitch = buildPitch3D(t);
		g.scene.add(g.pitch.group);

		simRef.current = { t, bs: [], rng: seed & 0xffff };
		prevRef.current = [];
		matchRef.current = initMatch13(13, HUMAN);
		setMatch(matchRef.current);
		statusRef.current = 'aim';
		setStatus('aim');
		setCard(null);
		setOver(false);
		aiPendingRef.current = false;
		powerRef.current = 0; yawRef.current = 0; aimRef.current = null;
		setPower(0);
		placeRef.current = null; setPlaceOk(false);
		clearArc();
		trackGame(gameId, 'game_started', { mode: 'libre', diff: key });
	}, [clearArc, clearBodies, gameId, initScene]);

	/* ---------- throwing ---------- */

	const aimHeading = useCallback((): { x: number; y: number } => {
		const m = matchRef.current;
		const y = yawRef.current;
		return { x: Math.sin(y) * m.dir, y: Math.cos(y) * m.dir };
	}, []);

	/* The bar interpolates the SQUARE of the speed, because what the player reads off it is a
	   distance and distance grows with v². Linear measured (J2) at 20 % of the travel landing in
	   the 6-10 m window and a third of the bar off the pitch; this reads 27-51 % and 0-7 %. */
	const speedOf = (p: number): number =>
		Math.sqrt(MIN_SPEED * MIN_SPEED + (MAX_SPEED * MAX_SPEED - MIN_SPEED * MIN_SPEED) * p);

	const doThrow = useCallback((side: Side, v: { vx: number; vy: number; vz: number }, asJack: boolean) => {
		const s = simRef.current, g = g3Ref.current;
		if (!s || !g) return;
		const b = launch(s, matchRef.current.circle, side, v, asJack);
		addBody(b);
		if (asJack) jackRef.current = b;
		clearArc();
		g.rings.visible = false;
		accRef.current = 0;
		rollTimeRef.current = 0;
		statusRef.current = 'rolling';
		setStatus('rolling');
		powerRef.current = 0;
		setPower(0);
	}, [addBody, clearArc]);

	const throwFromAim = useCallback(() => {
		const m = matchRef.current;
		const h = aimHeading();
		const v = throwVelocity(h.x, h.y, speedOf(powerRef.current), elevationForPitch(camPitchRef.current));
		doThrow(m.turn, v, m.phase === 'throw-jack');
	}, [aimHeading, doThrow]);

	/* ---------- what the AI does when its turn comes ---------- */

	const aiAct = useCallback(() => {
		const s = simRef.current, m = matchRef.current, g = g3Ref.current;
		if (!s || !g) return;
		const skill = DIFFS[diffRef.current].skill;
		const rng = rngRef.current++;

		if (m.phase === 'place-jack') {
			const j = jackRef.current;
			if (!j) return;
			j.x = m.circle.x;
			j.y = m.circle.y + m.dir * 7.4;
			j.live = true;
			place(s.t, j);
			matchRef.current = applyPlacedJack(m);
			setMatch(matchRef.current);
			statusRef.current = 'aim';
			setStatus('aim');
			return;
		}
		if (m.phase === 'throw-jack') {
			doThrow(AI, planJack(s, m, skill, rng), true);
			return;
		}
		const j = jackRef.current;
		if (!j) return;
		doThrow(AI, planThrow(s, j, m, AI, skill, rng), false);
	}, [doThrow]);

	/* ---------- one body has come to rest ---------- */

	const onSettled = useCallback(() => {
		const s = simRef.current, g = g3Ref.current;
		if (!s || !g) return;
		const m = matchRef.current;
		const j = jackRef.current;

		if (m.phase === 'throw-jack' && j) {
			const next = applyJack(m, j);
			matchRef.current = next;
			setMatch(next);
			if (next.phase === 'place-jack') {
				statusRef.current = 'placing';
				setStatus('placing');
				placeRef.current = { x: next.circle.x, y: next.circle.y + next.dir * 7.4 };
				setPlaceOk(next.turn === HUMAN);
			} else {
				statusRef.current = 'aim';
				setStatus('aim');
			}
			return;
		}

		if (!j) return;
		const next = applySettled(m, s.bs, j);
		matchRef.current = next;
		setMatch(next);
		if (next.phase !== 'end-done') {
			statusRef.current = 'aim';
			setStatus('aim');
			return;
		}
		const before = next.scores[0] + next.scores[1];
		const done = finishEnd(next, s.bs, j);
		const mine = done.scores[HUMAN] > next.scores[HUMAN];
		const got = done.scores[0] + done.scores[1] - before;
		matchRef.current = done;
		setMatch(done);
		setCard({ text: done.lastEvent ?? (got ? `${got} point${got > 1 ? 's' : ''}` : 'Mène nulle'), mine });
		statusRef.current = done.phase === 'match-done' ? 'over' : 'end';
		setStatus(statusRef.current);
		endAtRef.current = performance.now() + END_CARD_MS;
		if (done.phase === 'match-done') {
			setOver(true);
			trackGame(gameId, done.winner === HUMAN ? 'game_won' : 'game_over', { mode: 'libre', diff: diffRef.current });
		}
	}, [gameId]);

	/** Clear the ground and start the next end. Runs on the card's timer, or on a click. */
	const nextEnd = useCallback(() => {
		if (statusRef.current !== 'end') return;
		clearBodies();
		setCard(null);
		aiPendingRef.current = false;
		statusRef.current = 'aim';
		setStatus('aim');
	}, [clearBodies]);

	/* ---------- hand placing the jack ---------- */

	const pickGround = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
		const g = g3Ref.current, cv = canvasRef.current;
		if (!g || !cv) return null;
		const r = cv.getBoundingClientRect();
		const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
		const ray = new THREE.Raycaster();
		ray.setFromCamera(ndc, g.camera);
		const hit = new THREE.Vector3();
		// The relief is centimetres deep, so the flat plane is close enough to place a jack on.
		if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
		return { x: hit.x + PITCH_W / 2, y: hit.z + PITCH_L / 2 };
	}, []);

	/** Pull a tap into the legal window, so a clumsy finger still produces a legal jack. */
	const legalise = useCallback((p: { x: number; y: number }): { x: number; y: number } => {
		const c = matchRef.current.circle;
		const x = Math.min(PITCH_W - EDGE, Math.max(EDGE, p.x));
		const y = Math.min(PITCH_L - EDGE, Math.max(EDGE, p.y));
		const dx = x - c.x, dy = y - c.y;
		const d = Math.sqrt(dx * dx + dy * dy) || 1;
		const lo = MIN_JACK + 0.15, hi = MAX_JACK - 0.15;
		const k = d < lo ? lo / d : d > hi ? hi / d : 1;
		return { x: c.x + dx * k, y: c.y + dy * k };
	}, []);

	const confirmPlace = useCallback(() => {
		const s = simRef.current, j = jackRef.current, p = placeRef.current;
		if (!s || !j || !p) return;
		j.x = p.x; j.y = p.y; j.live = true;
		place(s.t, j);
		if (jackCheck(matchRef.current.circle, j) !== 'ok') return; // legalise() should make this dead code
		matchRef.current = applyPlacedJack(matchRef.current);
		setMatch(matchRef.current);
		placeRef.current = null;
		setPlaceOk(false);
		statusRef.current = 'aim';
		setStatus('aim');
	}, []);

	/* ---------- the aim drag ---------- */

	const canAim = (): boolean =>
		statusRef.current === 'aim' && matchRef.current.turn === HUMAN && !pinchRef.current;

	const aimStart = useCallback((x: number, y: number) => {
		if (statusRef.current === 'placing' && matchRef.current.turn === HUMAN) {
			const p = pickGround(x, y);
			if (p) { placeRef.current = legalise(p); setPlaceOk(true); }
			return;
		}
		if (!canAim()) return;
		aimRef.current = { x0: x, y0: y };
		powerRef.current = 0;
		yawRef.current = 0;
		aimDirtyRef.current = true;
	}, [legalise, pickGround]);

	const aimMove = useCallback((x: number, y: number) => {
		const a = aimRef.current;
		if (!a || !canAim()) return;
		const p = Math.max(0, Math.min(1, (a.y0 - y) / POWER_PX));
		// Drag right aims right on screen: the camera looks down -yaw, so the sign flips here.
		const yw = Math.max(-YAW_MAX, Math.min(YAW_MAX, -(x - a.x0) * YAW_PER_PX));
		if (p !== powerRef.current || yw !== yawRef.current) aimDirtyRef.current = true;
		powerRef.current = p;
		yawRef.current = yw;
		setPower(p);
	}, []);

	const aimEnd = useCallback(() => {
		const a = aimRef.current;
		aimRef.current = null;
		if (!a || !canAim()) return;
		if (powerRef.current < 0.06) { // a tap, not a throw
			powerRef.current = 0;
			setPower(0);
			aimDirtyRef.current = true;
			return;
		}
		throwFromAim();
	}, [throwFromAim]);

	const { onPointerDown } = usePointerDrag(aimStart, aimMove, aimEnd);

	/* ---------- camera controls ---------- */

	const tiltBy = useCallback((d: number) => {
		camPitchRef.current = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, camPitchRef.current + d));
		setLoft(elevationForPitch(camPitchRef.current));
		aimDirtyRef.current = true;
	}, []);

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		// The wheel is the loft knob, not a zoom: the loft IS the mechanic, so it gets the obvious input.
		const onWheel = (e: WheelEvent) => { e.preventDefault(); tiltBy(e.deltaY > 0 ? 0.06 : -0.06); };
		cv.addEventListener('wheel', onWheel, { passive: false });

		// Two-finger vertical slide tilts the camera. Native non-passive listeners: React's
		// multi-touch pointer events are dead on a real iPhone (ios-touch-input memory).
		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length < 2) return;
			e.preventDefault();
			pinchRef.current = { cy: (e.touches[0].clientY + e.touches[1].clientY) / 2, pitch: camPitchRef.current };
			aimRef.current = null;
			powerRef.current = 0;
			setPower(0);
		};
		const onTouchMove = (e: TouchEvent) => {
			const p = pinchRef.current;
			if (!p || e.touches.length < 2) return;
			e.preventDefault();
			const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			camPitchRef.current = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, p.pitch + (cy - p.cy) * PITCH_PER_PX));
			setLoft(elevationForPitch(camPitchRef.current));
			aimDirtyRef.current = true;
		};
		const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinchRef.current = null; };
		cv.addEventListener('touchstart', onTouchStart, { passive: false });
		cv.addEventListener('touchmove', onTouchMove, { passive: false });
		cv.addEventListener('touchend', onTouchEnd);
		cv.addEventListener('touchcancel', onTouchEnd);
		return () => {
			cv.removeEventListener('wheel', onWheel);
			cv.removeEventListener('touchstart', onTouchStart);
			cv.removeEventListener('touchmove', onTouchMove);
			cv.removeEventListener('touchend', onTouchEnd);
			cv.removeEventListener('touchcancel', onTouchEnd);
		};
	}, [tiltBy]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (e.key === 'ArrowUp') { e.preventDefault(); tiltBy(-0.06); }
			else if (e.key === 'ArrowDown') { e.preventDefault(); tiltBy(0.06); }
			else if (e.key === 'v' || e.key === 'V') { overRef.current = !overRef.current; }
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [tiltBy]);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [resize]);

	useEffect(() => {
		const onFs = () => requestAnimationFrame(resize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
		};
	}, [resize]);

	/* ---------- impacts ---------- */

	const onImpact = useCallback((im: Impact) => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		const x = wx(im.x), z = wz(im.y);
		if (im.kind === 'ground') {
			if (im.speed < 1.2) return;
			g.fx.puff(x, im.z - BOULE_R, z, im.speed, DUST[s.t.surface.id]);
		} else if (im.kind === 'boule') {
			g.fx.puff(x, im.z, z, im.speed * 0.6, 0xf2e6d2);
			if (im.speed > 3.5) g.fx.ring(x, im.z - BOULE_R, z, 0xffd166);
		} else if (im.kind === 'pebble') {
			if (im.speed < 1) return;
			g.fx.puff(x, im.z + 0.01, z, im.speed * 0.35, DUST[s.t.surface.id]);
		}
	}, []);

	/* ---------- the aim preview ---------- */

	const rebuildArc = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		killMesh(g.arcAir); killMesh(g.arcRoll);
		g.arcAir = g.arcRoll = null;
		g.marker.visible = false;
		const m = matchRef.current;
		if (statusRef.current !== 'aim' || m.turn !== HUMAN || powerRef.current < 0.06) return;

		const asJack = m.phase === 'throw-jack';
		const h = aimHeading();
		const v = throwVelocity(h.x, h.y, speedOf(powerRef.current), elevationForPitch(camPitchRef.current));
		const from = m.circle;
		const pred = predictThrow(s, from, v, (c) =>
			place(c.t, asJack ? makeJack(from.x, from.y) : makeBoule(from.x, from.y, m.turn)));

		const tint = pred.blocked ? 0xff6b6b : 0x8ce99a;
		arcPtsRef.current = pred.air;
		g.arcAir = arcMesh(pred.air, tint, 0.022);
		if (g.arcAir) g.scene.add(g.arcAir);
		g.arcRoll = arcMesh(pred.roll, 0xfff3bf, 0.016);
		if (g.arcRoll) g.scene.add(g.arcRoll);
		if (pred.land) {
			g.marker.position.copy(pred.land);
			g.marker.position.y += 0.012;
			(g.marker.material as THREE.MeshBasicMaterial).color.setHex(tint);
			g.marker.visible = true;
		}
	}, [aimHeading]);

	/* ---------- per-frame ---------- */

	const tick = useCallback((now: number, dt: number) => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s || !g.pitch) return;
		const m = matchRef.current;

		// Physics, fixed step. The guard keeps a stalled tab from simulating minutes in one frame.
		if (statusRef.current === 'rolling') {
			accRef.current += dt * 1000;
			let guard = 0;
			while (accRef.current >= STEP && guard++ < 8) {
				accRef.current -= STEP;
				const bs = s.bs, pp = prevRef.current;
				for (let i = 0; i < bs.length; i++) { pp[i].x = bs[i].x; pp[i].y = bs[i].y; pp[i].z = bs[i].z; }
				const imps = impactsRef.current;
				imps.length = 0;
				stepSim(s, STEP / 1000, imps);
				for (const im of imps) onImpact(im);
				rollTimeRef.current += STEP / 1000;
				if (isSettled(bs) || rollTimeRef.current > ROLL_CAP) {
					accRef.current = 0;
					onSettled();
					break;
				}
			}
			alphaRef.current = statusRef.current === 'rolling' ? accRef.current / STEP : 1;
		} else {
			alphaRef.current = 1;
		}

		// The AI takes a beat before playing, otherwise its throw reads as a glitch.
		if ((statusRef.current === 'aim' || statusRef.current === 'placing') && m.turn === AI && !aiPendingRef.current) {
			aiPendingRef.current = true;
			aiAtRef.current = now + AI_THINK_MS;
		}
		if (aiPendingRef.current && now >= aiAtRef.current) {
			aiPendingRef.current = false;
			aiAct();
		}
		if (statusRef.current === 'end' && now >= endAtRef.current) nextEnd();

		if (aimDirtyRef.current) { aimDirtyRef.current = false; rebuildArc(); }

		/* --- meshes --- */
		const a = alphaRef.current;
		for (let i = 0; i < s.bs.length; i++) {
			const b = s.bs[i], mesh = g.meshes[i], p = prevRef.current[i];
			if (!mesh) continue;
			mesh.visible = b.live;
			const bx = p && a < 1 ? p.x + (b.x - p.x) * a : b.x;
			const by = p && a < 1 ? p.y + (b.y - p.y) * a : b.y;
			const bz = p && a < 1 ? p.z + (b.z - p.z) * a : b.z;
			mesh.position.set(wx(bx), bz, wz(by));
			const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
			if (sp > 0.25) {
				SPIN.set(b.vy, 0, -b.vx).normalize();
				mesh.rotateOnWorldAxis(SPIN, (sp * dt) / b.r);
			}
			const halo = g.halos[i];
			if (!halo) continue;
			halo.visible = b.live;
			if (!b.live) continue;
			halo.position.set(wx(bx), heightAt(s.t, bx, by) + 0.008, wz(by));
			// Radius grows with camera distance, so the ring keeps its apparent size.
			const rr = Math.max(HALO_MIN_R, halo.position.distanceTo(g.camera.position) * HALO_PER_M);
			halo.scale.set(rr, 1, rr);
		}

		// The circle and the legal window follow the end, not the frame.
		g.circle.position.set(wx(m.circle.x), heightAt(s.t, m.circle.x, m.circle.y) + 0.004, wz(m.circle.y));
		const showRings = m.phase === 'throw-jack' || m.phase === 'place-jack';
		g.rings.visible = showRings;
		if (showRings) g.rings.position.set(wx(m.circle.x), heightAt(s.t, m.circle.x, m.circle.y) + 0.006, wz(m.circle.y));

		// While the human places the jack by hand, the jack itself is the marker.
		if (statusRef.current === 'placing' && placeRef.current && jackRef.current) {
			const p = placeRef.current, i = s.bs.indexOf(jackRef.current);
			const jm = g.meshes[i], jh = g.halos[i], gy = heightAt(s.t, p.x, p.y);
			if (jm) { jm.visible = true; jm.position.set(wx(p.x), gy + jackRef.current.r, wz(p.y)); }
			if (jh) { jh.visible = true; jh.position.set(wx(p.x), gy + 0.008, wz(p.y)); }
		}

		g.fx.update(dt);

		/* --- camera --- */
		if (overRef.current) {
			overviewCamera(g.camera, jackRef.current ?? m.circle);
		} else {
			const rolling = statusRef.current === 'rolling';
			const wantPitch = rolling ? Math.max(camPitchRef.current, ROLL_PITCH) : camPitchRef.current;
			viewPitchRef.current += (wantPitch - viewPitchRef.current) * (1 - Math.exp(-dt / PITCH_TAU));
			const ground = heightAt(s.t, m.circle.x, m.circle.y);
			aimCamera(g.camera, m.circle, m.dir, viewPitchRef.current, yawRef.current, CAM_DIST, ground);
			const h = aimHeading();
			const live = rolling ? s.bs.find((b) => b.live && Math.sqrt(b.vx * b.vx + b.vy * b.vy) > 0.05) : undefined;
			const focus = live ?? (statusRef.current === 'placing' ? placeRef.current : null);
			const want = wantLook.current;
			if (focus) want.set(wx(focus.x), ground + 0.1, wz(focus.y));
			else want.set(wx(m.circle.x) + h.x * 2.2, ground + 0.15, wz(m.circle.y) + h.y * 2.2);
			if (lookRef.current.lengthSq() === 0) lookRef.current.copy(want);
			lookRef.current.lerp(want, 1 - Math.exp(-dt / LOOK_TAU));
			g.camera.lookAt(lookRef.current);
		}
	}, [aiAct, aimHeading, nextEnd, onImpact, onSettled, rebuildArc]);

	const tickRef = useRef(tick);
	tickRef.current = tick;

	useEffect(() => {
		let raf = 0;
		let last = 0;
		const frame = (now: number): void => {
			raf = requestAnimationFrame(frame);
			const g = g3Ref.current;
			if (!g) return;
			const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
			last = now;
			tickRef.current(now, dt);
			g.renderer.render(g.scene, g.camera);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, []);

	useEffect(() => { newGame('moyen'); }, [newGame]);

	useEffect(() => () => {
		const g = g3Ref.current;
		if (!g) return;
		g.fx.dispose();
		g.lights.dispose();
		g.pitch?.dispose();
		g.renderer.dispose();
		g3Ref.current = null;
	}, []);

	/** Where each live body lands on the canvas, and how big it is there, in CSS pixels. */
	const screenSizes = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return [];
		const el = g.renderer.domElement;
		const w = el.clientWidth, h = el.clientHeight;
		const perM = (far: number): number => h / (2 * far * Math.tan((g.camera.fov * Math.PI) / 360));
		const p = new THREE.Vector3();
		return s.bs.map((b, i) => {
			const mesh = g.meshes[i];
			if (!b.live || !mesh) return null;
			const far = (g.halos[i] ?? mesh).position.distanceTo(g.camera.position);
			const k = perM(far);
			p.copy(mesh.position).project(g.camera);
			return {
				side: b.side,
				m: Math.round(far * 10) / 10,
				body: Math.round(b.r * 2 * k),
				halo: Math.round(Math.max(HALO_MIN_R, far * HALO_PER_M) * 2 * k),
				px: Math.round(((p.x + 1) / 2) * w),
				py: Math.round(((1 - p.y) / 2) * h),
			};
		}).filter(Boolean);
	}, []);

	/**
	 * How far the aim arc bows off a straight line on screen, in CSS pixels. The camera used to sit
	 * exactly on the throw line, which puts the whole parabola in a plane through the eye — so it
	 * projected to a dead straight segment and the loft, the mechanic the game is built on, was
	 * invisible. This is the number that guards it.
	 */
	const arcBow = useCallback((): number => {
		const g = g3Ref.current, pts = arcPtsRef.current;
		if (!g || pts.length < 3) return 0;
		const el = g.renderer.domElement, w = el.clientWidth, h = el.clientHeight;
		const v = new THREE.Vector3();
		const flat = pts.map((p) => {
			v.copy(p).project(g.camera);
			return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
		});
		const a = flat[0], b = flat[flat.length - 1];
		const dx = b.x - a.x, dy = b.y - a.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 1) return 0;
		let max = 0;
		for (const p of flat) max = Math.max(max, Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len);
		return Math.round(max);
	}, []);

	// Read-only snapshot for the smoke check.
	useEffect(() => {
		const w = window as unknown as { __petanque?: () => unknown };
		w.__petanque = () => ({
			status: statusRef.current,
			match: matchRef.current,
			bodies: simRef.current?.bs.length ?? 0,
			jack: jackRef.current ? { x: jackRef.current.x, y: jackRef.current.y, live: jackRef.current.live } : null,
			power: powerRef.current,
			loft: elevationForPitch(camPitchRef.current),
			fx: g3Ref.current?.fx.stats() ?? null,
			// Screen size of each body and of its halo — a boule 10 m out is a couple of pixels,
			// so this is the only honest way to ask whether the board is readable.
			seen: screenSizes(),
			bow: arcBow(),
		});
		return () => { delete (window as unknown as { __petanque?: unknown }).__petanque; };
	}, []);


	/* ---------- HUD ---------- */

	const myTurn = match.turn === HUMAN;
	const holder = jackRef.current && status !== 'placing' ? pointHolder(simRef.current?.bs ?? [], jackRef.current) : null;
	const hint = status === 'placing'
		? (myTurn ? '✋ Touche le sol pour poser le bouchon' : 'L’adversaire place le bouchon…')
		: status === 'rolling' ? 'La boule roule…'
		: !myTurn ? 'L’adversaire réfléchit…'
		: match.phase === 'throw-jack' ? 'À toi de lancer le bouchon'
		: holder === HUMAN ? 'Tu as le point'
		: holder === AI ? 'L’adversaire a le point'
		: 'À toi de jouer';

	return (
		<div className="pe-root">
			<style>{CSS}</style>

			<div className="pe-topbar">
				<div className="pe-hud-top">
					<div className="pe-stats">
						<span className="pe-stat">🏆 {match.scores[HUMAN]} — {match.scores[AI]}</span>
						<span className="pe-stat">Mène {match.endNo}</span>
						<span className="pe-stat pe-boules">
							<span className="pe-dots me">{'●'.repeat(match.left[HUMAN])}{'○'.repeat(BOULES_PER_SIDE - match.left[HUMAN])}</span>
							<span className="pe-dots foe">{'●'.repeat(match.left[AI])}{'○'.repeat(BOULES_PER_SIDE - match.left[AI])}</span>
						</span>
					</div>
					<div className="pe-hud-actions">
						{DIFF_ORDER.map((k) => (
							<button key={k} className={`pe-pill ${diff === k ? 'active' : ''}`} onClick={() => newGame(k)} title="Force de l’adversaire et terrain">{DIFFS[k].label}</button>
						))}
						<button className="pe-act" onClick={() => { overRef.current = !overRef.current; }} aria-label="Vue d’ensemble" title="Vue d’ensemble (V)">🎥</button>
						<button className="pe-act" onClick={() => newGame(diff)} aria-label="Nouvelle partie" title="Nouvelle partie">↻</button>
					</div>
				</div>
				<div className="pe-vs">
					<span className={`pe-vs-p ${myTurn && status !== 'rolling' ? 'on' : ''}`}>😎 Toi</span>
					<span className="pe-vs-mid">vs</span>
					<span className={`pe-vs-p ${!myTurn && status !== 'rolling' ? 'on' : ''}`}>🤖 {DIFFS[diff].label}</span>
				</div>
				{match.lastEvent && status !== 'end' && <div className="pe-tag">{match.lastEvent}</div>}
			</div>

			<div className="pe-playwrap" ref={wrapRef}>
				{celebrating && <Celebration />}
				<canvas ref={canvasRef} className="pe-canvas" onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} />

				{webglError && (
					<div className="pe-overlay"><div className="pe-card">Ton appareil ne peut pas afficher le terrain 3D (WebGL indisponible).</div></div>
				)}

				{/* The loft gauge. The camera-drives-loft mechanic is invented here, so nothing on
				    screen may leave it implicit — this gauge is the tutorial. */}
				<div className="pe-loft">
					<span className="pe-loft-label">{LOFT_LABEL(loft)}</span>
					<div className="pe-loft-bar"><div className="pe-loft-fill" style={{ height: `${Math.round(((loft - 0.17) / (0.92 - 0.17)) * 100)}%` }} /></div>
					<span className="pe-loft-hint">molette / 2 doigts</span>
				</div>

				<div className="pe-power" aria-hidden="true">
					<div className="pe-power-fill" style={{ width: `${Math.round(power * 100)}%` }} />
				</div>

				<div className="pe-hint">{hint}</div>

				{status === 'placing' && myTurn && placeOk && (
					<button className="pe-placeok" onClick={confirmPlace}>✓ Poser ici</button>
				)}

				{card && !over && (
					<div className={`pe-endcard ${card.mine ? 'mine' : ''}`} onClick={nextEnd}>{card.text}</div>
				)}

				{over && (
					<div className="pe-overlay">
						<div className="pe-card">
							{match.winner === HUMAN ? '🏆 Tu gagnes la partie !' : '❌ L’adversaire gagne'}
							<strong>{match.scores[HUMAN]} — {match.scores[AI]}</strong>
							<button className="pe-replay" onClick={() => newGame(diff)}>Nouvelle partie</button>
						</div>
					</div>
				)}
			</div>

			<p className="pe-help">
				Glisse vers le <strong>haut</strong> pour la puissance, sur les <strong>côtés</strong> pour la direction, relâche pour lancer.
				L’<strong>inclinaison de la caméra</strong> règle la hauteur du lob : caméra rasante = portée haute, caméra plongeante = roulette.
				Bouchon entre 6 et 10 m, sinon c’est à l’adversaire de le poser. Celui qui n’a pas le point rejoue. Premier à 13.
			</p>
		</div>
	);
}

const SPIN = new THREE.Vector3();

const CSS = `
.pe-root {
  --pe-accent: var(--accent-regular);
  width: 100%; max-width: 620px; margin-inline: auto; color: var(--gray-0);
  font-family: var(--font-body); display: flex; flex-direction: column; align-items: center;
  position: relative;
}

.pe-playwrap { width: 100%; aspect-ratio: 16 / 10; position: relative; overflow: hidden; border-radius: 14px; box-shadow: var(--shadow-lg); }
.pe-canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; background: #7fb4dd; }

/* Fullscreen means the PITCH is fullscreen: the HUD floats over it and costs no pixel of ground. */
.game-page.gf-full:has(.pe-root) { padding: 0; }
.game-page.gf-full .pe-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .pe-help { display: none; }
.game-page.gf-full .pe-playwrap { flex: 1; aspect-ratio: auto; border-radius: 0; box-shadow: none; }
.game-page.gf-full .pe-topbar {
  position: absolute; inset: 0 0 auto 0; margin: 0; z-index: 3; gap: 6px; pointer-events: none;
  padding: max(6px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
}
.game-page.gf-full .pe-topbar > * { pointer-events: none; }
.game-page.gf-full .pe-hud-top > * { pointer-events: auto; }
.game-page.gf-full .pe-hud-actions {
  position: fixed; z-index: 4; max-width: 45vw;
  right: max(8px, env(safe-area-inset-right)); bottom: max(10px, env(safe-area-inset-bottom));
}
.game-page.gf-full .pe-stat, .game-page.gf-full .pe-vs-p { font-size: 12px; padding: 4px 10px; }
.game-page.gf-full .pe-act, .game-page.gf-full .pe-pill { font-size: 12px; padding: 4px 10px; }

.pe-topbar { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 10px; }
.pe-hud-top { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.pe-hud-top > * { pointer-events: auto; }
.pe-hud-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

.pe-stats { display: flex; gap: 6px; font-weight: 700; font-size: 13px; flex-wrap: wrap; }
.pe-stat { background: rgba(28,20,12,0.6); color: #f4ece2; border-radius: 999px; padding: 5px 11px; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0,0,0,0.35); font-variant-numeric: tabular-nums; }
.pe-boules { display: flex; gap: 8px; letter-spacing: 1px; }
.pe-dots.me { color: #dfe6f0; }
.pe-dots.foe { color: #d0916a; }

.pe-pill { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(28,20,12,0.55); color: #f0e6da; font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; backdrop-filter: blur(4px); }
.pe-pill.active { background: var(--pe-accent); color: var(--accent-text-over); border-color: var(--pe-accent); }
.pe-act { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(28,20,12,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 6px 12px; min-width: 36px; cursor: pointer; backdrop-filter: blur(4px); }
.pe-act:hover { border-color: var(--pe-accent); color: #fff; }

.pe-vs { display: flex; align-items: center; gap: 8px; justify-content: center; pointer-events: none; flex-wrap: wrap; }
.pe-vs-p { background: rgba(28,20,12,0.6); color: #e8ddcf; font-weight: 700; font-size: 13px; padding: 5px 13px; border-radius: 999px; backdrop-filter: blur(4px); border: 1.5px solid transparent; }
.pe-vs-p.on { background: var(--pe-accent); color: var(--accent-text-over); border-color: var(--pe-accent); }
.pe-vs-mid { color: #d8cbb8; font-size: 11px; font-weight: 700; opacity: 0.75; }
.pe-tag { background: rgba(28,20,12,0.6); color: #f0e6da; font-size: 12.5px; font-weight: 500; padding: 5px 14px; border-radius: 999px; backdrop-filter: blur(4px); pointer-events: none; text-align: center; max-width: 96%; }

/* Vertical gauge on the left edge: it is the only thing telling the player the camera is a control. */
.pe-loft { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none; }
.pe-loft-label { background: rgba(28,20,12,0.62); color: #ffe8b0; font-weight: 800; font-size: 11.5px; padding: 3px 9px; border-radius: 999px; backdrop-filter: blur(4px); white-space: nowrap; }
.pe-loft-bar { width: 9px; height: 96px; border-radius: 999px; background: rgba(28,20,12,0.5); border: 1.5px solid rgba(255,255,255,0.28); display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
.pe-loft-fill { width: 100%; background: linear-gradient(180deg, #ffd166, #f4801f); transition: height 0.08s linear; }
.pe-loft-hint { color: #f0e6da; font-size: 10px; opacity: 0.8; text-shadow: 0 1px 2px rgba(0,0,0,0.6); white-space: nowrap; }

.pe-power { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(12px, env(safe-area-inset-bottom)); width: min(58%, 280px); height: 9px; border-radius: 999px; background: rgba(28,20,12,0.5); border: 1.5px solid rgba(255,255,255,0.28); overflow: hidden; z-index: 3; pointer-events: none; }
.pe-power-fill { height: 100%; background: linear-gradient(90deg, #8ce99a, #ffd166 55%, #ff6b6b); }

.pe-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(max(12px, env(safe-area-inset-bottom)) + 18px); z-index: 3; background: rgba(28,20,12,0.6); color: #f4ece2; font-weight: 600; font-size: 12.5px; padding: 4px 13px; border-radius: 999px; backdrop-filter: blur(4px); pointer-events: none; white-space: nowrap; max-width: 92%; overflow: hidden; text-overflow: ellipsis; }

.pe-placeok { position: absolute; left: 50%; bottom: calc(max(12px, env(safe-area-inset-bottom)) + 44px); transform: translateX(-50%); z-index: 5; border: 2px solid rgba(255,255,255,0.5); background: linear-gradient(180deg, #30d158, #1e963c); color: #fff; font: inherit; font-weight: 800; font-size: 15px; padding: 9px 22px; border-radius: 999px; cursor: pointer; box-shadow: var(--shadow-md); }
.pe-placeok:hover { filter: brightness(1.08); }

.pe-endcard { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); z-index: 5; padding: 12px 26px; border-radius: 16px; text-align: center; font-weight: 800; font-size: 17px; color: #fff; background: linear-gradient(180deg, rgba(34,24,16,0.94), rgba(22,15,10,0.92)); border: 2px solid rgba(255,255,255,0.18); box-shadow: var(--shadow-lg); cursor: pointer; }
.pe-endcard.mine { background: linear-gradient(180deg, rgba(48,209,88,0.96), rgba(24,140,60,0.96)); border-color: rgba(255,255,255,0.4); }

.pe-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 6; }
.pe-card { background: var(--gray-999); border: 2px solid var(--pe-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.pe-card strong { color: var(--pe-accent); font-size: 22px; font-variant-numeric: tabular-nums; }
.pe-replay { border: none; background: var(--pe-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }

.pe-help { max-width: 480px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1rem; }
`;
