/* =====================================================
   BOLIDES renderer — vanilla three.js.
   Territory lives on a CanvasTexture (one pixel per grid cell); the trail and
   drift-skid decals ride on stacked transparent planes above it. Cars are simple
   boxy meshes; a tilted north-up camera follows the player with look-ahead. Drift
   smoke, capture rings, and kill/explosion bursts share one particle pool.
   ===================================================== */
import * as THREE from 'three';
import {
	ARENA, GRID, HALF, PALETTE, TOTAL,
	type GameState, type Car,
} from './engine';

const HEIGHT = 60; // camera altitude
const BACK = 40; // camera pull-back (sets the tilt)
const LOOKAHEAD = 14; // frame shifts ahead of the player's heading
const MAX_PARTICLES = 400;

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] as const;
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// Pastel territory fill (light tint of the car colour) vs the vivid trail colour.
const TERRITORY_LUT: [number, number, number][] = PALETTE.map((hex, i) => {
	const [r, g, b] = rgb(hex);
	if (i === 0) return [22, 26, 34]; // neutral ground
	return [mix(r, 255, 0.5), mix(g, 255, 0.5), mix(b, 255, 0.5)];
});

/** A flat quad in the XZ plane, UVs aligned so world (x,z) -> canvas (col,row). */
function groundQuad(y: number): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	// A(0,0) B(1,0) C(1,1) D(0,1)  with texture.flipY=false so v=0 is canvas row 0.
	const pos = [
		-HALF, y, -HALF, HALF, y, -HALF, HALF, y, HALF,
		-HALF, y, -HALF, HALF, y, HALF, -HALF, y, HALF,
	];
	const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
	return g;
}

function makeCarMesh(color: number): THREE.Group {
	const g = new THREE.Group();
	const body = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 });
	const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
	const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, metalness: 0.3, roughness: 0.15 });
	const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
		const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m);
	};
	add(new THREE.BoxGeometry(2.6, 0.5, 1.4), body, 0, 0.5, 0); // chassis (child[0] = colour)
	add(new THREE.BoxGeometry(1.2, 0.4, 1.1), body, 0.3, 0.5, 0); // nose
	add(new THREE.BoxGeometry(1.3, 0.35, 1.05), glass, -0.1, 0.82, 0); // cabin
	const wheel = new THREE.BoxGeometry(0.7, 0.45, 0.35);
	for (const sx of [0.9, -0.9]) for (const sz of [0.75, -0.75]) add(wheel, dark, sx, 0.32, sz);
	g.userData.mats = [body, dark, glass];
	return g;
}

interface Particle { x: number; z: number; y: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number; size: number; }

export interface Renderer {
	frame(state: GameState, alpha: number, dtSec: number): void;
	reset(): void; // clear trail + skid overlays and repaint territory (instant Rejouer)
	resize(): void;
	dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, state: GameState): Renderer | null {
	let renderer: THREE.WebGLRenderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	} catch {
		return null;
	}
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#0b0e14');
	scene.fog = new THREE.Fog('#0b0e14', 120, 240);
	const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);

	scene.add(new THREE.AmbientLight(0xaab2c6, 1.15));
	const dir = new THREE.DirectionalLight(0xffffff, 1.35);
	dir.position.set(30, 90, 20);
	scene.add(dir);

	// --- territory (opaque), skid decals, and trail: three stacked textured planes ---
	const mkCanvas = () => {
		const c = document.createElement('canvas');
		c.width = c.height = GRID;
		return { c, ctx: c.getContext('2d')! };
	};
	const terr = mkCanvas();
	const decal = mkCanvas();
	const trailC = mkCanvas();

	const terrImg = terr.ctx.createImageData(GRID, GRID);
	const paintTerritory = () => {
		const d = terrImg.data;
		const owner = state.owner;
		for (let i = 0; i < TOTAL; i++) {
			const [r, g, b] = TERRITORY_LUT[owner[i]];
			const o = i * 4;
			d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
		}
		terr.ctx.putImageData(terrImg, 0, 0);
		terrTex.needsUpdate = true;
	};

	const mkTex = (c: HTMLCanvasElement, linear: boolean) => {
		const t = new THREE.CanvasTexture(c);
		t.flipY = false;
		t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
		t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
		t.generateMipmaps = false;
		return t;
	};
	const terrTex = mkTex(terr.c, true);
	const decalTex = mkTex(decal.c, false);
	const trailTex = mkTex(trailC.c, false);

	const terrMesh = new THREE.Mesh(groundQuad(0), new THREE.MeshStandardMaterial({ map: terrTex, roughness: 1 }));
	const decalMesh = new THREE.Mesh(groundQuad(0.012), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false }));
	const trailMesh = new THREE.Mesh(groundQuad(0.024), new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false }));
	scene.add(terrMesh, decalMesh, trailMesh);
	paintTerritory();

	// Thin border walls so the arena edge reads (and looks like a track boundary).
	const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3346, roughness: 0.9 });
	for (const [sx, sz, w, d] of [[0, -HALF, ARENA, 1], [0, HALF, ARENA, 1], [-HALF, 0, 1, ARENA], [HALF, 0, 1, ARENA]] as const) {
		const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), wallMat);
		wall.position.set(sx, 1, sz);
		scene.add(wall);
	}

	// --- cars ---
	const carMeshes: THREE.Group[] = state.cars.map((c) => {
		const m = makeCarMesh(c.color);
		scene.add(m);
		return m;
	});

	// --- particle pool (drift smoke + capture rings + explosions) ---
	const pPos = new Float32Array(MAX_PARTICLES * 3);
	const pCol = new Float32Array(MAX_PARTICLES * 3);
	const pGeo = new THREE.BufferGeometry();
	pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
	pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
	const pMat = new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
	const points = new THREE.Points(pGeo, pMat);
	points.frustumCulled = false;
	scene.add(points);
	const particles: Particle[] = [];
	const spawn = (x: number, z: number, color: number, spread: number, up: number, count: number, size: number, life: number) => {
		const [r, g, b] = rgb(color);
		for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
			const a = Math.random() * Math.PI * 2;
			const s = Math.random() * spread;
			particles.push({
				x, z, y: 0.5, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: up * (0.4 + Math.random()),
				life, max: life, r: r / 255, g: g / 255, b: b / 255, size,
			});
		}
	};

	// --- decal (skid) painter ---
	const paintDecal = (x: number, z: number) => {
		const col = Math.max(0, Math.min(GRID - 1, Math.floor((x + HALF) / (ARENA / GRID))));
		const row = Math.max(0, Math.min(GRID - 1, Math.floor((z + HALF) / (ARENA / GRID))));
		decal.ctx.fillStyle = 'rgba(0,0,0,0.28)';
		decal.ctx.fillRect(col, row, 1, 1);
		decalTex.needsUpdate = true;
	};

	// --- trail overlay: repaint the cells the engine flagged as changed ---
	const applyTrailDirty = () => {
		if (state.trailDirty.length === 0) return;
		for (const cell of state.trailDirty) {
			const col = cell % GRID, row = (cell / GRID) | 0;
			const id = state.trail[cell];
			if (id === 0) {
				trailC.ctx.clearRect(col, row, 1, 1);
			} else {
				const [r, g, b] = rgb(PALETTE[id]);
				trailC.ctx.fillStyle = `rgb(${r},${g},${b})`;
				trailC.ctx.fillRect(col, row, 1, 1);
			}
		}
		state.trailDirty.length = 0;
		trailTex.needsUpdate = true;
	};

	const camTarget = { x: state.cars[0].x, z: state.cars[0].z };
	const shake = { t: 0, mag: 0 };

	const resize = () => {
		const w = canvas.clientWidth, h = canvas.clientHeight || Math.round(w * 0.625);
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};
	resize();

	const carPose = (car: Car, alpha: number) => {
		let dh = car.heading - car.ph;
		if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
		return {
			x: car.px + (car.x - car.px) * alpha,
			z: car.pz + (car.z - car.pz) * alpha,
			heading: car.ph + dh * alpha,
		};
	};

	const frame = (s: GameState, alpha: number, dtSec: number) => {
		// Consume engine output.
		if (s.captureFlag) { paintTerritory(); s.captureFlag = false; }
		applyTrailDirty();
		for (const e of s.events) {
			if (e.type === 'capture') spawn(e.cx, e.cz, PALETTE[e.id], 6, 3, 26, 2.2, 0.8);
			else if (e.type === 'death') { spawn(e.x, e.z, PALETTE[e.id], 14, 5, 40, 2.6, 0.9); shake.t = 0.35; shake.mag = e.isPlayer ? 1.6 : 0.7; }
		}
		// events are cleared by the React loop after both render + UI have read them.

		const player = s.cars[0];
		const pp = carPose(player, alpha);

		// Cars: transform, drift wobble, skid decals + smoke.
		for (let i = 0; i < s.cars.length; i++) {
			const car = s.cars[i];
			const mesh = carMeshes[i];
			mesh.visible = car.alive;
			if (!car.alive) continue;
			const pose = carPose(car, alpha);
			const wobble = car.drifting ? Math.sign(car.turnRate) * 0.18 : 0;
			mesh.position.set(pose.x, 0, pose.z);
			mesh.rotation.y = -pose.heading + wobble;
			if (car.drifting) {
				const bx = pose.x - Math.cos(pose.heading) * 1.3;
				const bz = pose.z - Math.sin(pose.heading) * 1.3;
				paintDecal(bx, bz);
				if (Math.random() < 0.6) spawn(bx, bz, 0xdfe4ea, 2, 1.5, 1, 1.6, 0.5);
			}
		}

		// Particles.
		for (let i = particles.length - 1; i >= 0; i--) {
			const p = particles[i];
			p.life -= dtSec;
			if (p.life <= 0) { particles.splice(i, 1); continue; }
			p.x += p.vx * dtSec; p.z += p.vz * dtSec; p.y += p.vy * dtSec; p.vy -= 6 * dtSec;
			if (p.y < 0.1) { p.y = 0.1; p.vy = 0; }
		}
		for (let i = 0; i < MAX_PARTICLES; i++) {
			const p = particles[i];
			const o = i * 3;
			if (p) {
				const f = p.life / p.max;
				pPos[o] = p.x; pPos[o + 1] = p.y; pPos[o + 2] = p.z;
				pCol[o] = p.r * f; pCol[o + 1] = p.g * f; pCol[o + 2] = p.b * f;
			} else {
				pPos[o + 1] = -999;
			}
		}
		pGeo.attributes.position.needsUpdate = true;
		pGeo.attributes.color.needsUpdate = true;

		// Camera: north-up, tilted, eased toward a point ahead of the player.
		const tx = pp.x + Math.cos(pp.heading) * LOOKAHEAD;
		const tz = pp.z + Math.sin(pp.heading) * LOOKAHEAD;
		const k = Math.min(1, dtSec * 3.5);
		camTarget.x += (tx - camTarget.x) * k;
		camTarget.z += (tz - camTarget.z) * k;
		let sx = 0, sz = 0;
		if (shake.t > 0) {
			shake.t -= dtSec;
			const m = shake.mag * Math.max(0, shake.t / 0.35);
			sx = (Math.random() * 2 - 1) * m;
			sz = (Math.random() * 2 - 1) * m;
		}
		camera.position.set(camTarget.x + sx, HEIGHT, camTarget.z + BACK + sz);
		camera.lookAt(camTarget.x, 0, camTarget.z);
		renderer.render(scene, camera);
	};

	const reset = () => {
		trailC.ctx.clearRect(0, 0, GRID, GRID);
		decal.ctx.clearRect(0, 0, GRID, GRID);
		trailTex.needsUpdate = true;
		decalTex.needsUpdate = true;
		particles.length = 0;
		shake.t = 0;
		camTarget.x = state.cars[0].x;
		camTarget.z = state.cars[0].z;
		paintTerritory();
	};

	const dispose = () => {
		renderer.dispose();
		scene.traverse((o) => {
			if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
				o.geometry.dispose();
				const m = o.material as THREE.Material | THREE.Material[];
				if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose();
			}
		});
		terrTex.dispose(); decalTex.dispose(); trailTex.dispose();
	};

	return { frame, reset, resize, dispose };
}
