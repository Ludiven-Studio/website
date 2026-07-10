import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
	ESQUIVE_DIFFS,
	esquiveConfig,
	createEsquive,
	step,
	type EsquiveConfig,
	type EsquiveState,
} from './engine';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, dailyDifficultyIndex, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   ESQUIVE — 3D asteroid dodger (three.js + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : astéroïdes identiques pour tous, 10 essais, meilleur temps classé.
   Engine is pure/tested; three.js only renders the state.
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
type DiffKey = keyof typeof ESQUIVE_DIFFS;
const BEST_KEY = 'ludiven-esquive-best';
const DIFF_ORDER: DiffKey[] = ['facile', 'moyen', 'difficile'];
const STEP = 1000 / 60; // ms per physics step
const MAX_TRIES = 10; // daily attempts per day; best of the day is ranked
const MAX_AST = 100; // asteroid mesh pool size
const STAR_COUNT = 520;
const fmtSec = (tenths: number) => formatScore(DAILY_LB.esquive.fmt, tenths);

interface DailyState {
	best: number;
	tries: number;
}

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	composer: EffectComposer;
	bloom: UnrealBloomPass;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	ship: THREE.Group;
	glow: THREE.Mesh;
	pool: THREE.Mesh[];
	starGeom: THREE.BufferGeometry;
	starPos: Float32Array;
	astGeoms: THREE.BufferGeometry[];
	astMat: THREE.MeshStandardMaterial;
	boomGroup: THREE.Group;
	boomDebris: THREE.Mesh[];
	boomVel: THREE.Vector3[];
	boomCore: THREE.Mesh;
	boomLight: THREE.PointLight;
	boomDebrisGeom: THREE.BufferGeometry;
	boomDebrisMat: THREE.MeshStandardMaterial;
	boomCoreGeom: THREE.BufferGeometry;
	boomCoreMat: THREE.MeshBasicMaterial;
}

const BOOM_PARTS = 24;
const BOOM_MS = 1000;

export default function EsquiveGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0); // tenths of a second
	const [best, setBest] = useState(0);
	const [diffKey, setDiffKey] = useState<DiffKey>('moyen');
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [attempt, setAttempt] = useState(0); // re-keys the leaderboard so each replay re-submits
	const [tries, setTries] = useState(0);
	const [webglError, setWebglError] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const cfgRef = useRef<EsquiveConfig>(esquiveConfig(ESQUIVE_DIFFS.moyen));
	const stateRef = useRef<EsquiveState>(createEsquive(esquiveConfig(ESQUIVE_DIFFS.moyen)));
	const seedRef = useRef(0);
	const diffIdxRef = useRef(0);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const runningRef = useRef(false);
	const scoreRef = useRef(0);
	const startRef = useRef(0);
	const dailyRef = useRef(false);
	const statusRef = useRef<Status>('ready');
	const triesRef = useRef(0);
	const keysRef = useRef({ left: false, right: false, up: false, down: false });
	const pointerRef = useRef({ active: false, lastX: 0, lastY: 0, targetX: 0, targetY: 0 });
	const camRollRef = useRef(0); // eased camera bank
	const explodingRef = useRef(false); // ~1s explosion before the game-over popup
	const explElapsedRef = useRef(0);

	/* ---- three.js scene (built once) ---- */
	const initScene = useCallback(() => {
		if (g3Ref.current || !canvasRef.current) return;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
		} catch {
			setWebglError(true);
			return;
		}
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.15;

		const accent =
			getComputedStyle(document.documentElement).getPropertyValue('--accent-regular').trim() || '#7c5cff';
		// Load a texture via a plain <img> (reliable in every context) then wrap it.
		const loadTex = (src: string, cb: (t: THREE.Texture) => void) => {
			const img = new Image();
			img.onload = () => {
				const t = new THREE.Texture(img);
				t.needsUpdate = true;
				cb(t);
			};
			img.src = src;
		};
		const bg = new THREE.Color('#0a0a14');
		const fogCol = new THREE.Color('#140a1e'); // dark purple to match the nebula

		const scene = new THREE.Scene();
		scene.background = bg;
		scene.fog = new THREE.Fog(fogCol, 55, 135);
		// Nebula skybox: an inward-facing sphere (geometry renders reliably through the
		// composer). Tiled a little so the forward view always shows coloured nebula.
		const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, toneMapped: false, color: 0x2a2440 });
		const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 40, 24), skyMat);
		scene.add(sky);
		loadTex('/assets/jeux/esquive/nebula.jpg', (tex) => {
			tex.colorSpace = THREE.SRGBColorSpace;
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(2, 1);
			skyMat.map = tex;
			skyMat.color.set(0xffffff);
			skyMat.needsUpdate = true;
		});

		// Third-person chase camera (slightly above + behind the ship). Eased toward the ship each frame.
		const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 220);
		camera.position.set(0, 3.2, 14);
		camera.lookAt(0, 0, -22);

		scene.add(new THREE.AmbientLight(0x8088aa, 0.7));
		const dir = new THREE.DirectionalLight(0xffffff, 1.4);
		dir.position.set(4, 7, 10);
		scene.add(dir);
		// Two faint coloured rim fills (nebula magenta + cyan) for depth on the metal.
		const rimA = new THREE.PointLight(0xff4fa3, 0.6, 90);
		rimA.position.set(-18, 6, -20);
		scene.add(rimA);
		const rimB = new THREE.PointLight(0x4fd0ff, 0.5, 90);
		rimB.position.set(18, -6, -14);
		scene.add(rimB);

		// Ship: small craft (fuselage + wing + cockpit + glowing thruster), nose toward -Z.
		const ship = new THREE.Group();
		const hullMat = new THREE.MeshStandardMaterial({ color: accent, emissive: new THREE.Color(accent), emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.35 });
		const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.7, 22), hullMat);
		fuselage.rotation.x = -Math.PI / 2; // apex faces -Z
		fuselage.position.z = -0.15;
		ship.add(fuselage);
		const wing = new THREE.Mesh(
			new THREE.BoxGeometry(1.9, 0.08, 0.55),
			new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.5 }),
		);
		wing.position.set(0, -0.05, 0.35);
		ship.add(wing);
		const cockpit = new THREE.Mesh(
			new THREE.SphereGeometry(0.27, 16, 16),
			new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x224466, metalness: 0.2, roughness: 0.1 }),
		);
		cockpit.position.set(0, 0.13, -0.1);
		ship.add(cockpit);
		const glow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), new THREE.MeshBasicMaterial({ color: 0x66ccff }));
		glow.position.set(0, 0, 0.85); // thruster at the back (toward camera)
		ship.add(glow);
		scene.add(ship);

		// Asteroid pool (reused; hidden until active). Three base shapes cycle across the pool for variety.
		// Angular low-poly asteroids (flat-shaded facets read as rock). The AI rock
		// diffuse tints each facet a different shade (polyhedron UVs are per-face, so a
		// normal map wouldn't map cleanly — we lean on flat shading for the relief).
		const astGeoms: THREE.BufferGeometry[] = [
			new THREE.IcosahedronGeometry(1, 0),
			new THREE.DodecahedronGeometry(1, 0),
			new THREE.IcosahedronGeometry(1, 1),
		];
		const astMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, flatShading: true, roughness: 1, metalness: 0.03 });
		loadTex('/assets/jeux/esquive/rock.jpg', (tex) => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.colorSpace = THREE.SRGBColorSpace;
			astMat.map = tex;
			astMat.needsUpdate = true;
		});
		const pool: THREE.Mesh[] = [];
		for (let i = 0; i < MAX_AST; i++) {
			const m = new THREE.Mesh(astGeoms[i % astGeoms.length], astMat);
			m.visible = false;
			scene.add(m);
			pool.push(m);
		}

		// Starfield (recycled for a sense of speed).
		const starPos = new Float32Array(STAR_COUNT * 3);
		for (let i = 0; i < STAR_COUNT; i++) {
			starPos[i * 3] = (Math.random() * 2 - 1) * 60;
			starPos[i * 3 + 1] = (Math.random() * 2 - 1) * 40;
			starPos[i * 3 + 2] = -140 + Math.random() * 152;
		}
		const starGeom = new THREE.BufferGeometry();
		starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
		const stars = new THREE.Points(starGeom, new THREE.PointsMaterial({ color: 0xcdd6f5, size: 0.3, sizeAttenuation: true, fog: false }));
		scene.add(stars);

		// Explosion FX (hidden until a collision): flying debris + additive flash core + a fading light.
		const boomGroup = new THREE.Group();
		boomGroup.visible = false;
		scene.add(boomGroup);
		const boomDebrisGeom = new THREE.IcosahedronGeometry(0.22, 0);
		const boomDebrisMat = new THREE.MeshStandardMaterial({ color: 0xffa94d, emissive: 0xff6b00, emissiveIntensity: 0.9, transparent: true });
		const boomDebris: THREE.Mesh[] = [];
		const boomVel: THREE.Vector3[] = [];
		for (let i = 0; i < BOOM_PARTS; i++) {
			const m = new THREE.Mesh(boomDebrisGeom, boomDebrisMat);
			boomGroup.add(m);
			boomDebris.push(m);
			boomVel.push(new THREE.Vector3());
		}
		const boomCoreGeom = new THREE.SphereGeometry(1, 16, 16);
		const boomCoreMat = new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
		const boomCore = new THREE.Mesh(boomCoreGeom, boomCoreMat);
		boomGroup.add(boomCore);
		const boomLight = new THREE.PointLight(0xff9040, 0, 50);
		boomGroup.add(boomLight);

		// Post-processing: bloom for the thruster, cockpit, explosions and bright stars.
		const composer = new EffectComposer(renderer);
		composer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		composer.addPass(new RenderPass(scene, camera));
		const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.95); // strength, radius, threshold (only the brightest FX bloom)
		composer.addPass(bloom);

		g3Ref.current = {
			renderer, composer, bloom, scene, camera, ship, glow, pool, starGeom, starPos, astGeoms, astMat,
			boomGroup, boomDebris, boomVel, boomCore, boomLight, boomDebrisGeom, boomDebrisMat, boomCoreGeom, boomCoreMat,
		};
	}, []);

	const computeInput = useCallback(() => {
		const k = keysRef.current;
		const p = pointerRef.current;
		const st = stateRef.current;
		if (p.active) {
			// Follow the accumulated drag target (relative to where the drag began).
			return {
				x: Math.max(-1, Math.min(1, (p.targetX - st.shipX) * 0.6)),
				y: Math.max(-1, Math.min(1, (p.targetY - st.shipY) * 0.6)),
			};
		}
		return {
			x: (k.right ? 1 : 0) - (k.left ? 1 : 0),
			y: (k.up ? 1 : 0) - (k.down ? 1 : 0),
		};
	}, []);

	const draw = useCallback((dtSec: number, input: { x: number; y: number }) => {
		const g = g3Ref.current;
		if (!g) return;
		const st = stateRef.current;
		const cfg = cfgRef.current;

		g.ship.position.set(st.shipX, st.shipY, cfg.shipZ);
		// Banking/pitch eased toward the input → visibly reacts to steering.
		const kRot = Math.min(1, dtSec * 10);
		g.ship.rotation.z += (-input.x * 0.5 - g.ship.rotation.z) * kRot;
		g.ship.rotation.x += (input.y * 0.32 - g.ship.rotation.x) * kRot;
		g.glow.scale.setScalar(0.85 + 0.3 * Math.sin(st.elapsedMs * 0.02)); // thruster pulse

		// Chase camera eased toward the ship → parallax / sense of moving through space (accentuated).
		const kCam = Math.min(1, dtSec * 6);
		g.camera.position.x += (st.shipX * 0.9 - g.camera.position.x) * kCam;
		g.camera.position.y += (3.2 + st.shipY * 0.6 - g.camera.position.y) * kCam;
		g.camera.lookAt(st.shipX * 0.4, st.shipY * 0.4 + 0.4, -22);
		camRollRef.current += (-input.x * 0.15 - camRollRef.current) * Math.min(1, dtSec * 8);
		g.camera.rotateZ(camRollRef.current); // bank the whole view when steering (eased)

		for (let i = 0; i < g.pool.length; i++) {
			const m = g.pool[i];
			if (i < st.asteroids.length) {
				const a = st.asteroids[i];
				m.visible = true;
				m.geometry = g.astGeoms[a.shape] ?? g.astGeoms[0]; // shape travels with the asteroid → no mid-flight popping
				m.position.set(a.x, a.y, a.z);
				m.scale.set(a.r * a.sx, a.r * a.sy, a.r * a.sz);
				m.rotation.set(a.rx, a.ry, a.rz);
			} else if (m.visible) {
				m.visible = false;
			}
		}

		// Scroll stars forward, recycle past the camera (stronger sense of speed).
		const dz = cfg.diff.baseSpeed * dtSec * 1.5;
		const pos = g.starPos;
		for (let i = 0; i < STAR_COUNT; i++) {
			let z = pos[i * 3 + 2] + dz;
			if (z > 2) {
				z = -140;
				pos[i * 3] = (Math.random() * 2 - 1) * 60;
				pos[i * 3 + 1] = (Math.random() * 2 - 1) * 40;
			}
			pos[i * 3 + 2] = z;
		}
		g.starGeom.attributes.position.needsUpdate = true;

		g.composer.render();
	}, []);

	const resize = useCallback(() => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return;
		const css = canvas.clientWidth;
		g.renderer.setSize(css, css, false);
		g.composer.setSize(css, css);
		g.camera.aspect = 1;
		g.camera.updateProjectionMatrix();
		g.composer.render();
	}, []);

	/* ---- Explosion FX ---- */
	const resetBoom = useCallback(() => {
		explodingRef.current = false;
		explElapsedRef.current = 0;
		const g = g3Ref.current;
		if (!g) return;
		g.boomGroup.visible = false;
		g.ship.visible = true;
	}, []);

	const startExplosion = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		explodingRef.current = true;
		explElapsedRef.current = 0;
		g.ship.visible = false;
		const st = stateRef.current;
		g.boomGroup.position.set(st.shipX, st.shipY, cfgRef.current.shipZ);
		g.boomGroup.visible = true;
		for (let i = 0; i < g.boomDebris.length; i++) {
			// Random direction on the unit sphere × random speed.
			const u = Math.random() * 2 - 1;
			const th = Math.random() * Math.PI * 2;
			const s = Math.sqrt(1 - u * u);
			g.boomVel[i].set(s * Math.cos(th), s * Math.sin(th), u).multiplyScalar(5 + Math.random() * 11);
			g.boomDebris[i].position.set(0, 0, 0);
			g.boomDebris[i].rotation.set(Math.random() * 3, Math.random() * 3, 0);
		}
		g.boomDebrisMat.opacity = 1;
		g.boomCore.scale.setScalar(0.6);
		g.boomCoreMat.opacity = 0.9;
		g.boomLight.intensity = 7;
	}, []);

	const animateBoom = useCallback((dtSec: number) => {
		explElapsedRef.current += dtSec * 1000;
		const g = g3Ref.current;
		if (!g) return;
		const t = Math.min(1, explElapsedRef.current / BOOM_MS);
		for (let i = 0; i < g.boomDebris.length; i++) {
			const m = g.boomDebris[i];
			m.position.addScaledVector(g.boomVel[i], dtSec);
			m.rotation.x += dtSec * 4;
			m.rotation.y += dtSec * 3;
		}
		g.boomDebrisMat.opacity = 1 - t;
		g.boomCore.scale.setScalar(0.6 + t * 7);
		g.boomCoreMat.opacity = (1 - t) * 0.9;
		g.boomLight.intensity = (1 - t) * 7;
	}, []);

	const finishBoom = useCallback(() => {
		explodingRef.current = false;
		const g = g3Ref.current;
		if (g) g.boomGroup.visible = false;
	}, []);

	/* ---- Loop ---- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const onGameOver = useCallback(() => {
		stop();
		const sc = stateRef.current.score;
		statusRef.current = 'over';
		setStatus('over');
		setBest((prev) => {
			const nb = Math.max(prev, sc);
			if (dailyRef.current) {
				if (triesRef.current >= MAX_TRIES) setAlreadyPlayed(true);
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					seed: seedRef.current,
					diffIndex: diffIdxRef.current,
					state: { best: nb, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				try {
					localStorage.setItem(BEST_KEY, String(nb));
				} catch {
					/* ignore */
				}
			}
			return nb;
		});
		trackGame(gameId, 'game_over', { score: sc });
	}, [gameId, stop]);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;

			// Explosion phase: freeze the sim, animate debris ~1s, then reveal the popup.
			if (explodingRef.current) {
				animateBoom(dt / 1000);
				draw(dt / 1000, { x: 0, y: 0 });
				if (explElapsedRef.current >= BOOM_MS) {
					finishBoom();
					onGameOver();
					return;
				}
				rafRef.current = requestAnimationFrame(frame);
				return;
			}

			accRef.current += dt;
			const input = computeInput();
			let st = stateRef.current;
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				st = step(st, STEP / 1000, cfgRef.current, seedRef.current, input);
				stateRef.current = st;
				if (st.status === 'over') break;
			}
			draw(dt / 1000, input);
			if (st.score !== scoreRef.current) {
				scoreRef.current = st.score;
				setScore(st.score);
			}
			if (st.status === 'over') {
				startExplosion();
				rafRef.current = requestAnimationFrame(frame);
				return;
			}
			rafRef.current = requestAnimationFrame(frame);
		},
		[computeInput, draw, onGameOver, animateBoom, startExplosion, finishBoom],
	);

	const start = useCallback(() => {
		if (webglError) return;
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return;
		resetBoom();
		stateRef.current = createEsquive(cfgRef.current);
		scoreRef.current = 0;
		accRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		statusRef.current = 'playing';
		keysRef.current = { left: false, right: false, up: false, down: false };
		setScore(0);
		setStatus('playing');
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
		rafRef.current = requestAnimationFrame(frame);
	}, [webglError, gameId, best, frame, resetBoom]);

	/* ---- Modes ---- */
	const armFree = useCallback(
		(key: DiffKey = diffKey) => {
			stop();
			resetBoom();
			dailyRef.current = false;
			setDaily(false);
			setAlreadyPlayed(false);
			triesRef.current = 0;
			setTries(0);
			pointerRef.current.active = false;
			setDiffKey(key);
			cfgRef.current = esquiveConfig(ESQUIVE_DIFFS[key]);
			seedRef.current = (Math.random() * 2 ** 32) >>> 0;
			stateRef.current = createEsquive(cfgRef.current);
			scoreRef.current = 0;
			setScore(0);
			statusRef.current = 'ready';
			setStatus('ready');
			try {
				setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0);
			} catch {
				setBest(0);
			}
			draw(0, { x: 0, y: 0 });
		},
		[stop, draw, diffKey, resetBoom],
	);

	const startDaily = useCallback(async () => {
		stop();
		resetBoom();
		dailyRef.current = true;
		setDaily(true);
		statusRef.current = 'ready';
		setStatus('ready');
		const applyLevel = (seed: number, diffIndex: number) => {
			seedRef.current = seed;
			diffIdxRef.current = diffIndex;
			const key = DIFF_ORDER[diffIndex] ?? 'moyen';
			setDiffKey(key);
			cfgRef.current = esquiveConfig(ESQUIVE_DIFFS[key]);
			stateRef.current = createEsquive(cfgRef.current);
			setScore(0);
			scoreRef.current = 0;
		};
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			applyLevel(run.seed, run.diffIndex ?? dailyDifficultyIndex());
			const st = (run.state as DailyState | undefined) ?? { best: 0, tries: 0 };
			triesRef.current = st.tries ?? 0;
			setTries(triesRef.current);
			setBest(st.best ?? 0);
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			if (exhausted) {
				setScore(st.best ?? 0);
				scoreRef.current = st.best ?? 0;
				statusRef.current = 'over';
				setStatus('over');
			} else {
				statusRef.current = 'ready';
				setStatus('ready');
			}
			setDailyLoading(false);
			draw(0, { x: 0, y: 0 });
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		triesRef.current = 0;
		setTries(0);
		const { seed, diffIndex } = await getDaily(gameId);
		applyLevel(seed, diffIndex);
		setBest(0);
		statusRef.current = 'ready';
		setStatus('ready');
		setDailyLoading(false);
		draw(0, { x: 0, y: 0 });
	}, [gameId, stop, draw, resetBoom]);

	/* ---- Input ---- */
	useEffect(() => {
		const setKey = (k: string, down: boolean): boolean => {
			const r = keysRef.current;
			if (k === 'ArrowLeft' || k === 'a' || k === 'q') return ((r.left = down), true);
			if (k === 'ArrowRight' || k === 'd') return ((r.right = down), true);
			if (k === 'ArrowUp' || k === 'w' || k === 'z') return ((r.up = down), true);
			if (k === 'ArrowDown' || k === 's') return ((r.down = down), true);
			return false;
		};
		const onKeyDown = (e: KeyboardEvent) => {
			const used = setKey(e.key, true);
			if (used) {
				e.preventDefault();
				pointerRef.current.active = false; // keyboard takes over
				if (statusRef.current === 'ready') start();
			}
		};
		const onKeyUp = (e: KeyboardEvent) => setKey(e.key, false);
		window.addEventListener('keydown', onKeyDown, { passive: false });
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [start]);

	useEffect(() => {
		const onVis = () => {
			if (document.hidden) {
				if (runningRef.current) {
					runningRef.current = false;
					if (rafRef.current) cancelAnimationFrame(rafRef.current);
					rafRef.current = 0;
				}
			} else if (statusRef.current === 'playing' && !runningRef.current) {
				lastRef.current = performance.now();
				runningRef.current = true;
				rafRef.current = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [frame]);

	useEffect(() => {
		initScene();
		resize();
		armFree();
		const onResize = () => resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			stop();
			const g = g3Ref.current;
			if (g) {
				g.astGeoms.forEach((geo) => geo.dispose());
				g.astMat.dispose();
				g.boomDebrisGeom.dispose();
				g.boomDebrisMat.dispose();
				g.boomCoreGeom.dispose();
				g.boomCoreMat.dispose();
				g.starGeom.dispose();
				g.ship.traverse((o) => {
					if (o instanceof THREE.Mesh) {
						o.geometry.dispose();
						(o.material as THREE.Material).dispose();
					}
				});
				g.renderer.dispose();
				g3Ref.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Pointer: relative drag — only the movement (delta) steers the ship, not the finger position. */
	const onCanvasPointerDown = (e: React.PointerEvent) => {
		e.preventDefault();
		if (dailyLoading) return;
		const p = pointerRef.current;
		p.active = true;
		p.lastX = e.clientX;
		p.lastY = e.clientY;
		p.targetX = stateRef.current.shipX;
		p.targetY = stateRef.current.shipY;
		if (statusRef.current === 'ready') start();
	};
	const onCanvasPointerMove = (e: React.PointerEvent) => {
		const p = pointerRef.current;
		if (!p.active) return;
		if (e.buttons === 0 && e.pointerType === 'mouse') return; // mouse: only while dragging
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const cfg = cfgRef.current;
		const SENS = 1.2;
		const worldDX = ((e.clientX - p.lastX) / rect.width) * (2 * cfg.halfW) * SENS;
		const worldDY = -((e.clientY - p.lastY) / rect.height) * (2 * cfg.halfH) * SENS;
		p.lastX = e.clientX;
		p.lastY = e.clientY;
		p.targetX = Math.max(-cfg.halfW, Math.min(cfg.halfW, p.targetX + worldDX));
		p.targetY = Math.max(-cfg.halfH, Math.min(cfg.halfH, p.targetY + worldDY));
	};
	const releasePointer = () => {
		pointerRef.current.active = false;
	};

	const remaining = MAX_TRIES - tries;

	return (
		<div className="es-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={() => armFree(diffKey)} onDaily={startDaily} />

			{daily ? (
				<div className="es-daily-tag">
					{dailyLoading
						? 'Préparation du défi…'
						: `Défi du jour · ${dailyWeekdayLabel()} · ${ESQUIVE_DIFFS[diffKey].label} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="es-pills" role="tablist" aria-label="Difficulté">
					{DIFF_ORDER.map((k) => (
						<button
							key={k}
							role="tab"
							aria-selected={diffKey === k}
							className={`es-pill ${diffKey === k ? 'active' : ''}`}
							onClick={() => armFree(k)}
						>
							{ESQUIVE_DIFFS[k].label}
						</button>
					))}
				</div>
			)}

			<div className="es-bar">
				<span className="es-score">{fmtSec(score)}</span>
				<span className="es-best">Record {fmtSec(best)}</span>
			</div>

			<div className="es-boardwrap">
				<canvas
					ref={canvasRef}
					className="es-canvas"
					role="img"
					aria-label={`Esquive — ${fmtSec(score)}`}
					onPointerDown={onCanvasPointerDown}
					onPointerMove={onCanvasPointerMove}
					onPointerUp={releasePointer}
					onPointerLeave={releasePointer}
					onPointerCancel={releasePointer}
				/>

				{webglError && (
					<div className="es-overlay">
						<div className="es-overlay-card">
							<p className="es-go-title">3D indisponible</p>
							<p className="es-overlay-note">Ton navigateur ne supporte pas WebGL.</p>
						</div>
					</div>
				)}

				{!webglError && status === 'ready' && !dailyLoading && !(daily && alreadyPlayed) && (
					<div className="es-overlay">
						<button className="es-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
					</div>
				)}
				{dailyLoading && (
					<div className="es-overlay"><div className="es-overlay-card">Préparation…</div></div>
				)}
				{!webglError && status === 'over' && (
					<div className="es-overlay">
						<div className="es-overlay-card">
							<p className="es-go-title">{daily && alreadyPlayed ? 'Défi du jour terminé' : '💥 Boum !'}</p>
							<p className="es-go-score">
								{daily ? <>Temps {fmtSec(score)} · Meilleur {fmtSec(best)}</> : <>Temps {fmtSec(score)} · Record {fmtSec(best)}</>}
							</p>
							{daily && alreadyPlayed ? (
								<p className="es-overlay-note">Reviens demain&nbsp;!</p>
							) : (
								<button className="es-startbtn sm" onClick={start}>
									↻ Rejouer{daily ? ` (${remaining} restant${remaining > 1 ? 's' : ''})` : ''}
								</button>
							)}
						</div>
					</div>
				)}
			</div>

			<p className="es-help">
				Pilote ton vaisseau et <strong>évite les astéroïdes</strong> le plus longtemps possible.
				Déplace-toi avec les <strong>flèches</strong> / <strong>ZQSD</strong>, ou en
				<strong> glissant le doigt</strong> (haut/bas + gauche/droite). Choisis ta difficulté ; au
				défi du jour, les astéroïdes sont les mêmes pour tout le monde (10 essais, meilleur temps classé).
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? best : undefined} format={fmtSec} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.es-root {
  --es-accent: var(--accent-regular);
  width: 100%; max-width: 460px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.es-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.es-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 0.85rem; }
.es-pill {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-300);
  font: inherit; font-weight: 500; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.es-pill.active { background: var(--es-accent); color: var(--accent-text-over); border-color: var(--es-accent); }
.es-bar { width: 100%; display: flex; justify-content: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; }
.es-score { background: var(--es-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 14px; font-variant-numeric: tabular-nums; }
.es-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 14px; font-variant-numeric: tabular-nums; }

.es-boardwrap { position: relative; width: 100%; max-width: 420px; margin-inline: auto; }
.es-canvas {
  width: 100%; aspect-ratio: 1 / 1; display: block;
  background: #0a0a14; border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none; cursor: crosshair;
  -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}

.es-overlay {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
  background: rgba(6,6,16,0.45); backdrop-filter: blur(2px); border-radius: 12px;
}
.es-overlay-card {
  background: var(--gray-999); border: 2px solid var(--es-accent); border-radius: 16px;
  padding: 18px 26px; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0);
}
.es-overlay-note { color: var(--gray-300); font-size: 13px; margin: 0; }
.es-go-title { font-family: var(--font-brand); font-weight: 600; font-size: 20px; margin: 0 0 4px; }
.es-go-score { color: var(--gray-300); font-size: 14px; margin: 0 0 12px; font-variant-numeric: tabular-nums; }
.es-startbtn {
  border: none; background: var(--es-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.es-startbtn.sm { font-size: 15px; padding: 10px 26px; }

.es-help { max-width: 420px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }
`;
