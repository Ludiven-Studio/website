/* =====================================================
   BOLIDES renderer — vanilla three.js.
   Territory lives on a CanvasTexture (one pixel per grid cell); the trail and
   drift-skid decals ride on stacked transparent planes above it. Cars are simple
   boxy meshes; a tilted north-up camera follows the player with look-ahead. Drift
   smoke, capture rings, and kill/explosion bursts share one particle pool.
   ===================================================== */
import * as THREE from 'three';
import {
	ARENA, CFG, GRID, HALF, PALETTE, TOTAL, angleDiff,
	type GameState, type Car,
} from './engine';

// Rocket-League-style chase cam: low, behind the car, looking where it's going.
const CAM_DIST = 17; // how far behind the car
const CAM_HEIGHT = 9.5; // how high above
const CAM_LOOK = 9; // look-at point ahead of the car
const CAM_LOOK_Y = 1.5; // aim slightly above the ground
const MAX_PARTICLES = 400;
const FOV_BASE = 62;
const FOV_KICK = 9; // extra degrees at top speed — the arcade "it's going fast" cue

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] as const;
const cssHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const TAU = Math.PI * 2;

// Neutral tarmac must read as a lit surface (not a black void) so colours pop against it
// and the chase cam has a sense of speed — grid lines every 20 cells help both.
const NEUTRAL: [number, number, number] = [64, 72, 88];
const GRID_LINE: [number, number, number] = [84, 94, 112];
// Pastel territory fill (light tint of the car colour) vs the vivid trail colour.
const TERRITORY_LUT: [number, number, number][] = PALETTE.map((hex, i) => {
	const [r, g, b] = rgb(hex);
	if (i === 0) return NEUTRAL;
	return [mix(r, 255, 0.3), mix(g, 255, 0.3), mix(b, 255, 0.3)];
});
// Territory is drawn pastel so trails stay legible on top, but a flat pastel blob has no shape.
// Outline every border cell in the full colour and the map reads as claimed land, not a stain.
const BORDER_LUT: [number, number, number][] = PALETTE.map((hex, i) => {
	const [r, g, b] = rgb(hex);
	if (i === 0) return NEUTRAL;
	return [mix(r, 0, 0.3), mix(g, 0, 0.3), mix(b, 0, 0.3)];
});

/** A flat quad in the XZ plane, UVs aligned so world (x,z) -> canvas (col,row). */
function groundQuad(y: number): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	// A(0,0) B(1,0) C(1,1) D(0,1)  with texture.flipY=false so v=0 is canvas row 0.
	// Wound A-C-B / A-D-C: in XZ that is counter-clockwise seen from above, so the
	// front face points +Y. The naive A-B-C order faces DOWN and gets back-face culled.
	const pos = [
		-HALF, y, -HALF, HALF, y, HALF, HALF, y, -HALF,
		-HALF, y, -HALF, -HALF, y, HALF, HALF, y, HALF,
	];
	const uv = [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1];
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
	return g;
}

/** Soft round blob, used for the glow pooled under each car. */
function makeBlobTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const ctx = c.getContext('2d')!;
	const rad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	rad.addColorStop(0, 'rgba(255,255,255,1)');
	rad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
	rad.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = rad;
	ctx.fillRect(0, 0, 64, 64);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Vertical gradient read as an equirect skybox: a horizon to drive toward, instead of a void. */
function makeSkyTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = 4; c.height = 256;
	const ctx = c.getContext('2d')!;
	const grad = ctx.createLinearGradient(0, 0, 0, 256);
	grad.addColorStop(0, '#0a0f1c');
	grad.addColorStop(0.42, '#1d2b4d');
	grad.addColorStop(0.5, '#2d3c6b');
	grad.addColorStop(0.58, '#18213a');
	grad.addColorStop(1, '#080b12');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, 4, 256);
	const t = new THREE.CanvasTexture(c);
	t.mapping = THREE.EquirectangularReflectionMapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

function makeCarMesh(color: number, blob: THREE.Texture): THREE.Group {
	const g = new THREE.Group();
	// Emissive, or the chase cam sees a dark silhouette and you lose track of your own colour.
	const body = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4, emissive: color, emissiveIntensity: 0.4 });
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

	// Underglow: it tells you at a glance which colour you are, even from the chase cam where
	// the roof is all you see, and it makes a rival readable across the arena.
	const glow = new THREE.Mesh(
		new THREE.PlaneGeometry(6, 6),
		new THREE.MeshBasicMaterial({ map: blob, color, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
	);
	glow.rotation.x = -Math.PI / 2;
	glow.position.y = 0.05;
	g.add(glow);

	g.userData.mats = [body, dark, glass];
	return g;
}

interface Particle { x: number; z: number; y: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number; size: number; }

export interface Renderer {
	frame(state: GameState, alpha: number, dtSec: number): void;
	reset(): void; // clear trail + skid overlays and repaint territory (instant Rejouer)
	setMinimap(canvas: HTMLCanvasElement | null): void; // top-down overview drawn each frame
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
	const skyTex = makeSkyTexture();
	scene.background = skyTex;
	// Fog matches the horizon band so the far side of the arena melts into the sky instead of
	// ending on a hard line.
	scene.fog = new THREE.Fog('#18213a', 150, 330);
	const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 500);
	let fov = FOV_BASE;

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
			const id = owner[i];
			const col = i % GRID, row = (i / GRID) | 0;
			let r: number, g: number, b: number;
			if (id === 0) {
				[r, g, b] = (col % 20 === 0 || row % 20 === 0) ? GRID_LINE : NEUTRAL;
			} else {
				// Two cells thick: a one-cell rim is smoothed away by the texture filter as soon
				// as the camera backs off, and the outline is the whole point.
				const edge = col < 2 || col >= GRID - 2 || row < 2 || row >= GRID - 2
					|| owner[i - 1] !== id || owner[i + 1] !== id || owner[i - GRID] !== id || owner[i + GRID] !== id
					|| owner[i - 2] !== id || owner[i + 2] !== id || owner[i - 2 * GRID] !== id || owner[i + 2 * GRID] !== id;
				[r, g, b] = edge ? BORDER_LUT[id] : TERRITORY_LUT[id];
			}
			const o = i * 4;
			d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
		}
		terr.ctx.putImageData(terrImg, 0, 0);
		terrTex.needsUpdate = true;
	};

	const mkTex = (c: HTMLCanvasElement, linear: boolean) => {
		const t = new THREE.CanvasTexture(c);
		t.flipY = false;
		t.colorSpace = THREE.SRGBColorSpace; // authored RGB reads correctly under lighting
		t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
		t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
		t.generateMipmaps = false;
		return t;
	};
	const terrTex = mkTex(terr.c, true);
	const decalTex = mkTex(decal.c, false);
	const trailTex = mkTex(trailC.c, false);
	// Same canvas read a second time, but smoothed: added under the crisp trail it bleeds the
	// colour outward, so a line looks like a lit wall rather than a row of pixels.
	const trailGlowTex = mkTex(trailC.c, true);

	// Unlit on purpose: the territory colour IS the information, so it must read exactly as
	// authored (same pixels as the minimap) instead of being dimmed by the lighting rig.
	const terrMesh = new THREE.Mesh(groundQuad(0), new THREE.MeshBasicMaterial({ map: terrTex }));
	const decalMesh = new THREE.Mesh(groundQuad(0.012), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false }));
	const glowMesh = new THREE.Mesh(groundQuad(0.018), new THREE.MeshBasicMaterial({ map: trailGlowTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
	const trailMesh = new THREE.Mesh(groundQuad(0.024), new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false }));
	scene.add(terrMesh, decalMesh, glowMesh, trailMesh);
	paintTerritory();

	// Thin border walls so the arena edge reads (and looks like a track boundary).
	const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3346, roughness: 0.9 });
	for (const [sx, sz, w, d] of [[0, -HALF, ARENA, 1], [0, HALF, ARENA, 1], [-HALF, 0, 1, ARENA], [HALF, 0, 1, ARENA]] as const) {
		const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), wallMat);
		wall.position.set(sx, 1, sz);
		scene.add(wall);
	}

	// --- cars ---
	const blobTex = makeBlobTexture();
	const carMeshes: THREE.Group[] = state.cars.map((c) => {
		const m = makeCarMesh(c.color, blobTex);
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

	// --- capture rings: the shockwave that makes closing a loop feel like it paid off ---
	const ringGeo = new THREE.RingGeometry(0.82, 1, 56);
	const rings = Array.from({ length: 5 }, () => {
		const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
		m.rotation.x = -Math.PI / 2;
		m.position.y = 0.4;
		m.visible = false;
		scene.add(m);
		return { mesh: m, life: 0 };
	});
	const RING_LIFE = 0.75;
	const popRing = (x: number, z: number, color: number) => {
		const slot = rings.find((r) => r.life <= 0) ?? rings[0];
		slot.life = RING_LIFE;
		slot.mesh.position.set(x, 0.4, z);
		(slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
	};
	const stepRings = (dtSec: number) => {
		for (const r of rings) {
			if (r.life <= 0) { r.mesh.visible = false; continue; }
			r.life -= dtSec;
			const t = 1 - Math.max(0, r.life) / RING_LIFE;
			r.mesh.visible = r.life > 0;
			const s = 3 + t * 34;
			r.mesh.scale.set(s, s, 1);
			(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) ** 1.6;
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

	// Skid marks used to stay for the whole race and ended up masking the territory
	// underneath, which IS the score. Fade them in steps: an 8-bit alpha ignores a
	// per-frame nudge too small to round down. A mark is gone in ~9 s.
	let decalFadeAcc = 0;
	const fadeDecals = (dtSec: number) => {
		decalFadeAcc += dtSec;
		if (decalFadeAcc < 0.35) return;
		decalFadeAcc = 0;
		decal.ctx.globalCompositeOperation = 'destination-out';
		decal.ctx.fillStyle = 'rgba(0,0,0,0.1)';
		decal.ctx.fillRect(0, 0, GRID, GRID);
		decal.ctx.globalCompositeOperation = 'source-over';
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
		trailGlowTex.needsUpdate = true;
	};

	const heroCar = (s: GameState) => s.cars[s.hero - 1] ?? s.cars[0];
	let camHeading = heroCar(state).heading; // eased so quick turns don't whip the camera
	const shake = { t: 0, mag: 0 };
	let miniCtx: CanvasRenderingContext2D | null = null;
	const setMinimap = (c: HTMLCanvasElement | null) => { miniCtx = c ? c.getContext('2d') : null; };

	// Top-down overview: territory + trails (scaled from their canvases) + car dots.
	const drawMinimap = (s: GameState) => {
		if (!miniCtx) return;
		const W = miniCtx.canvas.width, H = miniCtx.canvas.height;
		miniCtx.imageSmoothingEnabled = false;
		miniCtx.clearRect(0, 0, W, H);
		miniCtx.drawImage(terr.c, 0, 0, GRID, GRID, 0, 0, W, H);
		miniCtx.drawImage(trailC.c, 0, 0, GRID, GRID, 0, 0, W, H);
		for (const car of s.cars) {
			if (!car.alive) continue;
			const hero = car.id === s.hero;
			const mx = ((car.x + HALF) / ARENA) * W, my = ((car.z + HALF) / ARENA) * H;
			miniCtx.fillStyle = cssHex(PALETTE[car.id]);
			miniCtx.beginPath();
			miniCtx.arc(mx, my, hero ? 3.4 : car.isBot ? 2.4 : 2.9, 0, TAU);
			miniCtx.fill();
			if (hero) {
				miniCtx.strokeStyle = '#fff';
				miniCtx.lineWidth = 1.4;
				miniCtx.stroke();
				miniCtx.beginPath(); // heading tick
				miniCtx.moveTo(mx, my);
				miniCtx.lineTo(mx + Math.cos(car.heading) * 7, my + Math.sin(car.heading) * 7);
				miniCtx.stroke();
			}
		}
	};

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
		fadeDecals(dtSec);
		stepRings(dtSec);
		for (const e of s.events) {
			if (e.type === 'capture') { spawn(e.cx, e.cz, PALETTE[e.id], 6, 3, 26, 2.2, 0.8); popRing(e.cx, e.cz, PALETTE[e.id]); }
			else if (e.type === 'death') { spawn(e.x, e.z, PALETTE[e.id], 14, 5, 40, 2.6, 0.9); shake.t = 0.35; shake.mag = e.isPlayer ? 1.6 : 0.7; }
			// Snapping your own line is a setback, not a crash: a puff, and a nudge if it's you.
			else if (e.type === 'snap') { spawn(e.x, e.z, PALETTE[e.id], 7, 2, 16, 1.8, 0.5); if (e.isPlayer) { shake.t = 0.2; shake.mag = 0.5; } }
			else if (e.type === 'respawn') spawn(e.x, e.z, PALETTE[e.id], 5, 4, 22, 2, 0.7);
		}
		// events are cleared by the React loop after both render + UI have read them.

		const pp = carPose(heroCar(s), alpha);

		// Cars: transform, drift wobble, skid decals + smoke.
		for (let i = 0; i < s.cars.length; i++) {
			const car = s.cars[i];
			const mesh = carMeshes[i];
			mesh.visible = car.alive;
			if (!car.alive) continue;
			const pose = carPose(car, alpha);
			mesh.position.set(pose.x, 0, pose.z);
			// No cosmetic wobble any more: the nose really does point off the travel line.
			mesh.rotation.y = -pose.heading;
			if (car.drifting) {
				const bx = pose.x - Math.cos(pose.heading) * 1.3;
				const bz = pose.z - Math.sin(pose.heading) * 1.3;
				paintDecal(bx, bz);
				if (Math.random() < 0.6) spawn(bx, bz, 0xdfe4ea, 2, 1.5, 1, 1.6, 0.5);
			}
			// Rail scrape: sparks sell the speed the guard rail is eating.
			if (car.scraping) spawn(pose.x, pose.z, 0xffb020, 4, 2.5, 2, 1.3, 0.35);
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

		// Chase cam: ease the follow heading toward the car, then sit behind + above it.
		camHeading += angleDiff(pp.heading, camHeading) * Math.min(1, dtSec * 4);
		const cdx = Math.cos(camHeading), cdz = Math.sin(camHeading);
		let sx = 0, sy = 0, sz = 0;
		if (shake.t > 0) {
			shake.t -= dtSec;
			const m = shake.mag * Math.max(0, shake.t / 0.35);
			sx = (Math.random() * 2 - 1) * m;
			sy = (Math.random() * 2 - 1) * m * 0.5;
			sz = (Math.random() * 2 - 1) * m;
		}
		// Speed opens the lens and brakes close it back in — the road rushes without the car
		// actually moving any faster, which is the cheapest sense of speed there is.
		const t = Math.max(-0.4, Math.min(1, (heroCar(s).speed - CFG.cruise) / (CFG.maxSpeed - CFG.cruise)));
		fov += (FOV_BASE + FOV_KICK * t - fov) * Math.min(1, dtSec * 3);
		camera.fov = fov;
		camera.updateProjectionMatrix();
		camera.position.set(pp.x - cdx * CAM_DIST + sx, CAM_HEIGHT + sy, pp.z - cdz * CAM_DIST + sz);
		camera.lookAt(pp.x + cdx * CAM_LOOK, CAM_LOOK_Y, pp.z + cdz * CAM_LOOK);
		renderer.render(scene, camera);
		drawMinimap(s);
	};

	const reset = () => {
		trailC.ctx.clearRect(0, 0, GRID, GRID);
		decal.ctx.clearRect(0, 0, GRID, GRID);
		trailTex.needsUpdate = true;
		trailGlowTex.needsUpdate = true;
		decalTex.needsUpdate = true;
		particles.length = 0;
		for (const r of rings) { r.life = 0; r.mesh.visible = false; }
		decalFadeAcc = 0;
		shake.t = 0;
		fov = FOV_BASE;
		camHeading = heroCar(state).heading;
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
		terrTex.dispose(); decalTex.dispose(); trailTex.dispose(); trailGlowTex.dispose();
		blobTex.dispose(); skyTex.dispose();
	};

	return { frame, reset, setMinimap, resize, dispose };
}
