/* =====================================================
   BOLIDES renderer — vanilla three.js, "néon midnight" direction.
   Territory lives on a CanvasTexture (one pixel per grid cell) over a baked
   violet substrate; the trail rides a 2x supersampled canvas stroked as a
   polyline, skid decals a third plane. Cars are merged 4-material meshes with
   a parametric silhouette per bolide. A tilted chase camera follows the player.
   ===================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
	ARENA, CELL, CFG, GRID, HALF, PALETTE, TOTAL, angleDiff,
	type GameState, type Car,
} from './engine';

// Rocket-League-style chase cam: low, behind the car, looking where it's going.
const CAM_DIST = 17; // how far behind the car
const CAM_HEIGHT = 9.5; // how high above
const CAM_LOOK = 9; // look-at point ahead of the car
const CAM_LOOK_Y = 1.5; // aim slightly above the ground
// Faster than the old 4 because the camera now chases vh, which is itself a lowpass of the
// heading: at 4 the two lags added and the nose reached 92 deg off screen-forward, which reads
// as a spin, not a drift. See the sweep in the "vague 8" section of the plan.
const CAM_EASE = 7;
// Body attitude. The car's nose is local +X, so rotation.x is roll and rotation.z is pitch.
// Roll is driven by lateral acceleration (speed x turnRate), not by turnRate alone: turnRate
// hits speed/turnRadius = 5.2 rad/s flat out, so the old `turnRate * 0.18` sat pinned at the
// 0.22 clamp any time the wheel was touched — a permanent 13 deg tilt.
const ROLL_K = 0.0013, ROLL_MAX = 0.10; // ~4 deg at cruise, 5.7 deg flat out
const PITCH_K = 0.0016, PITCH_MAX = 0.06;
// Front wheels. True Ackermann runs 15 deg braked down to 9 flat out (scripts/bolides-uturn.mjs),
// far too subtle from the chase cam, so the angle is exaggerated. The clamp has to stay above
// K x the braked figure, or the slow corner saturates and the spread the player should feel
// flattens right back out. STEER_EASE keeps the interpolated pose's jitter out of the hubs.
const STEER_K = 2.4, STEER_MAX = 0.7, STEER_EASE = 14;
// Measured live occupancy: 53 mean / 99 peak in free 4-car driving, but 316/320 with four
// simultaneous kills, and spawn() silently drops past the cap — a kill landing during a snap
// starved the trail head and rail sparks for a full second. Smoke sat pinned at 32/32, so drift
// smoke was being dropped every single frame. 9 float arrays each, so this costs a few KB.
const ADD_PARTICLES = 512;
// 4 cars x 60 fps x 0.45 s of life = 108 puffs in flight, and spawn() drops the NEWEST when full,
// i.e. the puff at the contact point is the one skipped. 160 leaves headroom over that ceiling.
const SMOKE_PARTICLES = 160;
const FOV_BASE = 62;
const FOV_KICK = 9; // extra degrees at top speed — the arcade "it's going fast" cue
const TRAIL_SS = 2; // trail canvas supersampling: 400x400 for a stroked, notch-free tube

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] as const;
const cssHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const mixHex = (a: number, b: number, t: number) => {
	const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
	return (mix(ar, br, t) << 16) | (mix(ag, bg, t) << 8) | mix(ab, bb, t);
};
const TAU = Math.PI * 2;
// Little-endian byte order (every shipping target), so a canvas pixel is one u32 store.
const pack = (r: number, g: number, b: number, a = 255) => (((a << 24) | (b << 16) | (g << 8) | r) >>> 0);
const clampCell = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(v)));
// 128 = x1.0. Reapplies the floor's baked light to a packed pixel, alpha untouched.
const mulShade = (c: number, s: number) => ((c & 0xFF000000)
	| (Math.min(255, (((c >>> 16) & 255) * s) >> 7) << 16)
	| (Math.min(255, (((c >>> 8) & 255) * s) >> 7) << 8)
	| Math.min(255, ((c & 255) * s) >> 7)) >>> 0;

// Dark violet asphalt. Not black: unclaimed ground is where the player must drive, so it has
// to read as floor. Owned/unowned brightness lands near 3:1, not 12:1.
const NEUTRAL: [number, number, number] = [26, 28, 52];
const GRID_MINOR: [number, number, number] = [58, 50, 108]; // every 10 cells
const GRID_MAJOR: [number, number, number] = [80, 68, 150]; // every 50 cells, arena quarters
// Fills mix toward the substrate, rims toward white: every rim sits >= 51 luma above its own fill.
const TERRITORY_LUT: [number, number, number][] = [NEUTRAL, [44, 95, 196], [200, 33, 79], [36, 150, 104], [206, 166, 26]];
const BORDER_LUT: [number, number, number][] = [NEUTRAL, [127, 180, 255], [255, 92, 134], [46, 240, 196], [255, 233, 92]];
const SEAM_LUT: [number, number, number][] = [NEUTRAL, [81, 133, 222], [225, 60, 104], [33, 200, 146], [238, 204, 41]];
const FILL32 = Uint32Array.from(TERRITORY_LUT, (c) => pack(c[0], c[1], c[2]));
const RIM32 = Uint32Array.from(BORDER_LUT, (c) => pack(c[0], c[1], c[2]));
const SEAM32 = Uint32Array.from(SEAM_LUT, (c) => pack(c[0], c[1], c[2]));
// Light-buffer source: a bright rim over a flat interior lift. The alpha is per owner and
// tracks the inverse of the fill luma (red 72 / blue 92 / green 133 / yellow 176) — a flat
// alpha clips yellow into a white slab long before red glows at all.
// The seams stay OUT of it: a 6-cell stripe resampled to 96 texels beats into wide moire rays.
const RIM_A = [0, 195, 210, 150, 118];
const BODY_A = [0, 62, 70, 46, 32];
const RIM_E32 = Uint32Array.from(BORDER_LUT, (c, i) => pack(c[0], c[1], c[2], RIM_A[i]));
const BODY_E32 = Uint32Array.from(TERRITORY_LUT, (c, i) => pack(c[0], c[1], c[2], BODY_A[i]));
const LIGHT_N = 96; // light buffer resolution: 96 texels over 100 world units = a ~1-unit halo
// Each owner gets its own weave, so the map is readable in greyscale.
const seamAt = (id: number, col: number, row: number) =>
	id === 1 ? (col % 8 === 0 || row % 8 === 0)
		: id === 2 ? ((col + row) % 8 === 0 || (col - row + 1600) % 8 === 0)
			: id === 3 ? (row % 6 === 0)
				: (col % 6 === 0);
// Cell-level hatch on top of the weave. Vert and Jaune merge under deuteranopia and Rouge and
// Vert under protanopia, so ownership cannot be a hue alone. Free: same loop, one multiply.
const hatchAt = (id: number, col: number, row: number) =>
	id === 2 ? ((col + row) & 1) === 1
		: id === 3 ? (row & 1) === 1
			: id === 4 ? (col + row) % 3 === 0
				: false;
const HATCH_K = [128, 128, 102, 102, 100]; // 128 = x1.0

// Sub-cell asphalt grain, baked from SDXL by scripts/comfy-bolides.mjs. It cannot go into the
// territory canvas: the minimap and the score read those bytes directly. So it lives in the
// terrain shader as a pure value modulation — the same multiplier on r, g and b, centred on the
// tile's own mean so the arena keeps its average brightness and no owner hue shifts.
const GRAIN_URL = '/assets/jeux/bolides/grain.png';
const GRAIN_MEAN = 0.36; // measured off the baked PNG (mean 91.8/255), not guessed
// 8 tiles over the arena = 12.5 world units each, which lands the texel near screen resolution in
// the chase frame. Swept: near-field high-pass energy on the floor is 0.41 bare, 1.57 at repeat 4,
// 3.37 at 8, 2.45 at 16, 1.65 at 24 — 4 is undersampled into blotches that read as stains and 24
// is mipped back to flat.
const GRAIN_REPEAT = 8;
// 0.5 peaks at 13% luma deviation. 0.9 doubles the high-pass but also doubles the chroma drift
// (63/1000 vs 38/1000 max), and the floor colour is the score.
const GRAIN_K = 0.5;

// Half-width of the zone border, in cells (a cell is 0.5 world units), so the drawn line is
// 2 x EDGE_W wide where two territories meet and EDGE_W wide against neutral ground. Swept over
// 0.40-1.20 (scripts/bolides-v9.mjs): every width is equally crisp — the 10-90% flank ramp stays at
// 2 px — so this only picks how thick the line reads. Territory is cell-shaped, so a diagonal is a
// staircase of 1 cell whatever the width; 0.7 is the widest that still reads as a drawn line rather
// than a painted band, and it hides that staircase best.
// Ceiling is 0.5 and that is structural, not a taste call: the coverage field ramps from 1 to 0
// across exactly one cell, so the distance it can express tops out half a cell either side of the
// iso-line. 0.7 was chosen to hide the old staircase; there is no staircase left to hide.
// Re-swept 0.25-0.50 on the new floor (scripts/bolides-v10.mjs): the drawn width grows 1-2-3 px and
// then stops, 0.45 and 0.50 both reading 3 — the ceiling is real and 0.45 already sits on it.
const EDGE_W = 0.45;
// Depth of the per-car motif on owned ground, as a fraction of the fill value. Value only, never
// hue — the territory colour is the score. Swept 0.06-0.24 (scripts/bolides-v10.mjs) against both
// guardrails and neither binds: max hue and chroma drift on interior pixels stay at the shot-to-shot
// noise floor at every setting, and high-pass energy is flat in all three depth bands, so the
// ~8.7-cell period never aliases. 0.10 was invisible at 1x; 0.20 sits inside the measured bracket.
const PAT_K = 0.20;

/** Owned ground, grid and contour, all analytic. Injected at `fog_fragment`, so it runs on an
 *  already sRGB-encoded gl_FragColor and every colour here is sRGB 0-1. */
const FLOOR_FRAG = `
vec2 gP = vMapUv * ${GRID}.0;
float cpp = max( length( fwidth( gP ) ), 1e-6 );
float aa = max( 0.5 * cpp, 1e-4 );

float lw = max( 0.5, aa );
vec2 q10 = abs( gP / 10.0 - floor( gP / 10.0 + 0.5 ) ) * 10.0;
vec2 q50 = abs( gP / 50.0 - floor( gP / 50.0 + 0.5 ) ) * 50.0;
float gFade = min( 1.0, 0.5 / lw );
float g10 = ( 1.0 - smoothstep( lw - aa, lw + aa, min( q10.x, q10.y ) ) ) * gFade;
float g50 = ( 1.0 - smoothstep( lw - aa, lw + aa, min( q50.x, q50.y ) ) ) * gFade;
vec3 neutral = mix( mix( gl_FragColor.rgb, gridMinor, g10 ), gridMajor, g50 );

vec4 cv = texture2D( covMap, vMapUv );
float cM = max( max( cv.r, cv.g ), max( cv.b, cv.a ) );
vec4 sel = step( cM - 0.001, cv ) * step( 0.001, cM );
sel /= max( 1.0, dot( sel, vec4( 1.0 ) ) );
// Signed distance to the 0.5 iso-line, in cells. Away from a boundary the gradient collapses and
// this saturates to a large magnitude, which is what we want: deep inside or far outside.
float gpc = length( vec2( dFdx( cM ), dFdy( cM ) ) ) / cpp;
float dC = ( cM - 0.5 ) / max( gpc, 1e-4 );

vec3 own = fillCol[1] * sel.r + fillCol[2] * sel.g + fillCol[3] * sel.b + fillCol[4] * sel.a;
vec3 lin = lineCol[1] * sel.r + lineCol[2] * sel.g + lineCol[3] * sel.b + lineCol[4] * sel.a;

float ws = pow( vMapUv.x, 1.8 );
float dw = min( min( vMapUv.x, vMapUv.y ), min( 1.0 - vMapUv.x, 1.0 - vMapUv.y ) ) * ${GRID}.0;
float rb = pow( max( 0.0, 1.0 - dw / 28.0 ), 1.7 );
float shade = 0.80 + 0.32 * min( 1.0, ws * 0.9 + rb * 0.5 );

float m1 = sin( ( gP.x + gP.y ) * 0.72 );
float m2 = cos( gP.x * 0.85 ) * cos( gP.y * 0.85 );
float m3 = sin( ( abs( fract( gP.y / 16.0 ) - 0.5 ) * 32.0 + gP.x ) * 0.55 );
float m4 = 0.5 * ( sin( gP.x * 0.8 ) + sin( gP.y * 0.8 ) );
float mot = m1 * sel.r + m2 * sel.g + m3 * sel.b + m4 * sel.a;
// Fade the motif out before its period reaches the pixel, or it turns into moire at the horizon.
mot *= patK * ( 1.0 - smoothstep( 0.30, 0.85, cpp ) );

float fillM = smoothstep( -aa, aa, dC );
float eW = max( edgeW, aa );
float eM = ( 1.0 - smoothstep( eW - aa, eW + aa, abs( dC ) ) ) * min( 1.0, edgeW / eW );
gl_FragColor.rgb = mix( mix( neutral, own * shade * ( 1.0 + mot ), fillM ), lin, eM * edgeK );
`;

// Paint is darkened ~73% toward the substrate so the hue is carried by emission, not by diffuse:
// with the light buffer lifting the ground, a paler body just read as a grey soap bar.
const BODY_DIFFUSE = [0, 0x152C51, 0x4B1226, 0x0C4536, 0x4B3F0A];

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

/** Soft round blob: particle sprite and contact shadow. */
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

/** White radial sprite blitted into the light buffer (a per-frame gradient would allocate). */
function makeFlashCanvas(): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = c.height = 32;
	const ctx = c.getContext('2d')!;
	const rad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
	rad.addColorStop(0, 'rgba(255,255,255,1)');
	rad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
	rad.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = rad;
	ctx.fillRect(0, 0, 32, 32);
	return c;
}

/** Hot core plus a wide falloff, so one quad does the whole underglow. */
function makeGlowTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const ctx = c.getContext('2d')!;
	const rad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
	// Steep: a wide plateau on an additive quad clips to a flat rhombus and the plane's own
	// silhouette becomes the car. Only the first few texels may be hot.
	rad.addColorStop(0.00, 'rgba(255,255,255,1)');
	rad.addColorStop(0.05, 'rgba(255,255,255,0.45)');
	rad.addColorStop(0.18, 'rgba(255,255,255,0.10)');
	rad.addColorStop(1.00, 'rgba(255,255,255,0)');
	ctx.fillStyle = rad;
	ctx.fillRect(0, 0, 128, 128);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Four numbered roundels side by side; each car UVs into its own quarter. */
function makeRoundelTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = 512; c.height = 128;
	const ctx = c.getContext('2d')!;
	for (let i = 1; i <= 4; i++) {
		const cx = (i - 1) * 128 + 64, cy = 64, col = cssHex(PALETTE[i]);
		// Inverted: a near-white chip is the highest-luma point on the car, so the digit still
		// resolves once the roof is 8 px tall. A dark disc just read as a second canopy.
		ctx.globalAlpha = 0.45; ctx.strokeStyle = col; ctx.lineWidth = 13;
		ctx.beginPath(); ctx.arc(cx, cy, 57, 0, TAU); ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.fillStyle = '#F2F5FF';
		ctx.beginPath(); ctx.arc(cx, cy, 50, 0, TAU); ctx.fill();
		ctx.strokeStyle = col; ctx.lineWidth = 6;
		ctx.beginPath(); ctx.arc(cx, cy, 50, 0, TAU); ctx.stroke();
		// System stack only: there is no font-loading step here and ctx.font falls back silently.
		ctx.font = '700 88px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillStyle = '#0A0E1A'; ctx.fillText(String(i), cx, cy + 4);
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	// No mipmaps: the four quarters live in one atlas and a low mip averages them into a smudge.
	t.generateMipmaps = false;
	t.minFilter = THREE.LinearFilter;
	return t;
}

/** Screen-edge threat marker: a chevron pointing +x, so material.rotation is the bearing. */
function makeChevronTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const ctx = c.getContext('2d')!;
	// Filled, outlined: an unfilled hairline '<' is lost among the grid lines at phone size.
	ctx.lineJoin = ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(14, 8); ctx.lineTo(54, 32); ctx.lineTo(14, 56); ctx.lineTo(26, 32);
	ctx.closePath();
	ctx.strokeStyle = 'rgba(4,2,12,0.95)'; ctx.lineWidth = 9; ctx.stroke();
	ctx.fillStyle = '#ffffff'; ctx.fill();
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Diagonal hazard stripes, tiling in world units (ExtrudeGeometry UVs are world coordinates).
    Amber over near-black is the one marking that belongs to no owner. */
function makeHazardTexture(a: number, b: number, duty: number): THREE.CanvasTexture {
	// 4 stripe periods per tile either way, so the world scale set by `repeat` does not move.
	// Doubled to 32 texels a period and blended across the edge instead of stepping: a stripe
	// is 0.74 world units, which is under a pixel by mid-arena, and no mip level can average a
	// binary diagonal away — that is the rail moire.
	const P = 32, N = P * 4;
	const c = document.createElement('canvas');
	c.width = c.height = N;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(N, N);
	const d = new Uint32Array(img.data.buffer);
	const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
	const half = duty / 32; // half the amber band, in period units (`duty` stays out of 16)
	for (let y = 0; y < N; y++) {
		for (let x = 0; x < N; x++) {
			let o = ((x + y) % P) / P - half; // centred on the band, wrapped to [-0.5, 0.5)
			if (o > 0.5) o -= 1; else if (o < -0.5) o += 1;
			// 1.4 texels of blend: enough to kill the step, narrow enough to stay a stripe.
			const k = Math.max(0, Math.min(1, (half - Math.abs(o)) * P / 1.4 + 0.5));
			d[y * N + x] = pack(br + (ar - br) * k, bg + (ag - bg) * k, bb + (ab - bb) * k);
		}
	}
	ctx.putImageData(img, 0, 0);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	return t;
}

/** 32x1 alpha ramp (0 -> 1 -> 0) so a capture ring fades on both rims. */
function makeRampTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = 32; c.height = 1;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(32, 1);
	const d = new Uint32Array(img.data.buffer);
	for (let i = 0; i < 32; i++) d[i] = pack(255, 255, 255, Math.round(Math.sin(Math.PI * ((i + 0.5) / 32)) * 255));
	ctx.putImageData(img, 0, 0);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Equirect skybox: magenta sun with scan bars on +X, matching the key light. */
function makeSkyTexture(): THREE.CanvasTexture {
	const W = 512, H = 256;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d')!;
	const grad = ctx.createLinearGradient(0, 0, 0, H);
	grad.addColorStop(0.000, '#05030F');
	grad.addColorStop(0.220, '#120A33');
	grad.addColorStop(0.380, '#2A0F52');
	grad.addColorStop(0.470, '#6B1A6E');
	grad.addColorStop(0.498, '#C8306E');
	grad.addColorStop(0.506, '#FF6B4A');
	grad.addColorStop(0.520, '#4A1B5C');
	grad.addColorStop(0.560, '#150B2E'); // must equal the fog colour, or the horizon seams
	grad.addColorStop(1.000, '#05030B');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, W, H);
	// Dither, or a 512-wide gradient bands into visible stripes.
	const img = ctx.getImageData(0, 0, W, H);
	const d = img.data;
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const o = (y * W + x) * 4, n = ((x * 7 + y * 13) % 3) - 1;
			d[o] += n; d[o + 1] += n; d[o + 2] += n;
		}
	}
	ctx.putImageData(img, 0, 0);
	// Sun on its own transparent canvas: scene.background ignores alpha, so punching
	// destination-out holes straight into the sky would render as black bars.
	const sc = document.createElement('canvas');
	sc.width = sc.height = 200;
	const sx = sc.getContext('2d')!;
	const rad = sx.createRadialGradient(100, 100, 0, 100, 100, 82);
	// No white core: at #FFF3D8 the disc reads as a blown-out blob and the scan bars vanish in it.
	rad.addColorStop(0.00, '#FFD9A0');
	rad.addColorStop(0.20, '#FF9A5A');
	rad.addColorStop(0.46, 'rgba(226,72,120,0.5)');
	rad.addColorStop(1.00, 'rgba(226,72,120,0)');
	sx.fillStyle = rad;
	sx.fillRect(0, 0, 200, 200);
	sx.globalCompositeOperation = 'destination-out';
	// Bars start above the centre so they cut the core, not just the lower half.
	let by = 58;
	for (const th of [1, 1, 2, 2, 3, 4, 6, 8, 11]) { sx.fillRect(0, by, 200, th); by += th + 8; }
	// Equirect maps +X to u = 0/1, so the disc is drawn across both seams.
	ctx.globalCompositeOperation = 'lighter';
	ctx.drawImage(sc, -100, 21);
	ctx.drawImage(sc, W - 100, 21);
	ctx.globalCompositeOperation = 'source-over';
	const t = new THREE.CanvasTexture(c);
	t.mapping = THREE.EquirectangularReflectionMapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Parametric silhouette. One construction, five recognisable bodies. */
interface CarShape {
	len: number; wid: number; deck: number; nose: number; // top-down profile + extrude depth
	// Body floor above the ground. Keep ride + deck >= 2 * max(wheelR, rearR) or a wheel pokes
	// through the deck and out of the canopy.
	ride: number;
	wheelR: number; wheelW: number; rearR: number; rearW: number;
	wheelX: readonly number[]; wheelZ: number; wheelSeg: number; cock: number;
	canopyR: number; canopyX: number; cage: boolean; plough: boolean;
	wing: number; wingX: number; wingY: number; canard: boolean;
	glowL: number; glowW: number; glowOp: number;
	roundelX: number; roundelY: number;
}

const BASE_SHAPE: CarShape = {
	len: 1.30, wid: 0.75, deck: 0.48, nose: 0.30, ride: 0.32,
	wheelR: 0.37, wheelW: 0.34, rearR: 0.37, rearW: 0.34,
	wheelX: [0.92, -0.92], wheelZ: 0.86, wheelSeg: 10, cock: 0,
	canopyR: 0.50, canopyX: 0.25, cage: false, plough: false,
	wing: 0, wingX: 0, wingY: 0, canard: false,
	glowL: 5, glowW: 5, glowOp: 0.24,
	roundelX: -0.80, roundelY: 0.83,
};

const CAR_SHAPES: Record<string, CarShape> = {
	roadster: BASE_SHAPE,
	comet: {
		...BASE_SHAPE,
		len: 1.70, wid: 0.62, deck: 0.44, nose: 0.55, ride: 0.24,
		wheelR: 0.32, wheelW: 0.26, rearR: 0.34, rearW: 0.30,
		wheelX: [1.22, -1.22], wheelZ: 0.74,
		canopyR: 0.46, canopyX: -0.30,
		wing: 1.5, wingX: -1.55, wingY: 1.05,
		glowL: 7, glowW: 5, glowOp: 0.25,
		roundelX: -1.05, roundelY: 0.71,
	},
	hornet: {
		...BASE_SHAPE,
		len: 1.00, wid: 0.82, deck: 0.54, nose: 0.28, ride: 0.34,
		wheelR: 0.40, wheelW: 0.40, rearR: 0.40, rearW: 0.40,
		wheelX: [0.66, -0.66], wheelZ: 0.90,
		canopyR: 0.56, canopyX: 0, canard: true,
		glowOp: 0.28,
		roundelX: -0.58, roundelY: 0.91,
	},
	drifter: {
		...BASE_SHAPE,
		len: 1.25, wid: 0.60, deck: 0.50, nose: 0.32, ride: 0.30,
		wheelR: 0.32, wheelW: 0.26, rearR: 0.39, rearW: 0.48,
		wheelX: [0.95, -0.95], wheelZ: 0.78, cock: 0.35,
		canopyR: 0.48, canopyX: -0.15,
		wing: 1.3, wingX: -1.35, wingY: 1.20,
		glowL: 6.5, glowW: 6.5, glowOp: 0.27,
		roundelX: -0.70, roundelY: 0.86,
	},
	bunker: {
		...BASE_SHAPE,
		len: 1.20, wid: 0.90, deck: 0.62, nose: 0.45, ride: 0.38,
		wheelR: 0.38, wheelW: 0.42, rearR: 0.38, rearW: 0.42,
		wheelX: [1.0, 0, -1.0], wheelZ: 0.94, wheelSeg: 8,
		canopyR: 0, cage: true, plough: true,
		glowL: 7.5, glowW: 7.5, glowOp: 0.28,
		roundelX: -0.25, roundelY: 1.55,
	},
};

/** Top-down silhouette, extruded and laid flat: nose at +X, floor at y = sh.ride. */
function bodyGeometry(sh: CarShape): THREE.BufferGeometry {
	const L = sh.len, W = sh.wid, N = sh.nose;
	const s = new THREE.Shape();
	s.moveTo(-L, W);
	s.lineTo(N, W);
	s.quadraticCurveTo(L * 0.85, W * 0.96, L, W * 0.6);
	s.lineTo(L, -W * 0.6);
	s.quadraticCurveTo(L * 0.85, -W * 0.96, N, -W);
	s.lineTo(-L, -W);
	s.quadraticCurveTo(-L - 0.14, -W * 0.8, -L - 0.14, 0);
	s.quadraticCurveTo(-L - 0.14, W * 0.8, -L, W);
	// The bevel adds bevelThickness at BOTH ends, so depth must be shortened or the deck
	// grows past `top` and swallows the canopy, the pinstripes and the roundel.
	const bt = Math.min(0.15, sh.deck * 0.28);
	const g = new THREE.ExtrudeGeometry(s, {
		depth: sh.deck - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.12, bevelSegments: 2, curveSegments: 4,
	});
	g.rotateX(-Math.PI / 2); // extrude axis +Z -> world +Y, nose at +X
	g.computeBoundingBox();
	g.translate(0, sh.ride - g.boundingBox!.min.y, 0);
	return g;
}

function makeCarMesh(id: number, shape: CarShape, blob: THREE.Texture, glowTex: THREE.Texture, roundelTex: THREE.Texture, env: THREE.Texture): THREE.Group {
	const sh = shape;
	const color = PALETTE[id];
	const top = sh.ride + sh.deck;

	const paint: THREE.BufferGeometry[] = [bodyGeometry(sh)];
	const trim: THREE.BufferGeometry[] = [];

	if (sh.canopyR > 0) {
		const canopy = new THREE.SphereGeometry(sh.canopyR, 10, 6, 0, TAU, 0, Math.PI / 2.6);
		canopy.translate(sh.canopyX, top - 0.02, 0);
		trim.push(canopy);
	}
	if (sh.cage) {
		for (const px of [0.5, -0.5]) for (const pz of [0.55, -0.55]) {
			const post = new THREE.BoxGeometry(0.1, 0.45, 0.1);
			post.translate(px, top + 0.22, pz);
			trim.push(post);
		}
		const roof = new THREE.BoxGeometry(1.3, 0.1, 1.3);
		roof.translate(0, top + 0.47, 0);
		paint.push(roof);
	}
	if (sh.plough) {
		const p = new THREE.BoxGeometry(0.5, 0.6, sh.wid * 2.1);
		p.rotateZ(-0.25);
		p.translate(sh.len + 0.15, sh.ride + 0.30, 0);
		paint.push(p);
	}
	if (sh.wing > 0) {
		const blade = new THREE.BoxGeometry(0.15, 0.06, sh.wing);
		blade.translate(sh.wingX, sh.wingY, 0);
		paint.push(blade);
		for (const pz of [sh.wing * 0.34, -sh.wing * 0.34]) {
			const strut = new THREE.BoxGeometry(0.1, sh.wingY - top + 0.1, 0.1);
			strut.translate(sh.wingX, (sh.wingY + top) / 2 - 0.05, pz);
			trim.push(strut);
		}
	}
	if (sh.canard) {
		for (const pz of [sh.wid * 0.9, -sh.wid * 0.9]) {
			const cn = new THREE.BoxGeometry(0.25, 0.06, 0.5);
			cn.translate(sh.len * 0.9, sh.ride + 0.15, pz);
			trim.push(cn);
		}
	}

	// Wheels: the cylinder axis is +Y, so rotateX(PI/2) lays it on +Z. Everything but the front
	// axle is merged into the body; the front pair stay separate meshes so they can steer, each
	// hung at its own hub so turning them does not walk them out of the arch.
	const wl: THREE.BufferGeometry[] = [];
	const steered: { geo: THREE.BufferGeometry; at: [number, number, number] }[] = [];
	for (const wx of sh.wheelX) {
		const rear = wx < 0;
		const r = rear ? sh.rearR : sh.wheelR, w = rear ? sh.rearW : sh.wheelW;
		for (const wz of [sh.wheelZ, -sh.wheelZ]) {
			const g = new THREE.CylinderGeometry(r, r, w, sh.wheelSeg);
			g.rotateX(Math.PI / 2);
			if (wx > 0) { steered.push({ geo: g, at: [wx, r, wz] }); continue; }
			if (sh.cock && !rear) g.rotateY(sh.cock);
			g.translate(wx, r, wz);
			wl.push(g);
		}
	}

	// Neon pinstripe — the thing that makes it a neon car and not a lit car.
	const st: THREE.BufferGeometry[] = [];
	for (const sz of [sh.wid + 0.05, -sh.wid - 0.05]) {
		// On the shoulder line, not the sill: from the chase cam the sill is hidden by the bevel.
		const s = new THREE.BoxGeometry(sh.len * 1.88, 0.09, 0.06);
		s.translate(0, top - 0.13, sz);
		st.push(s);
	}
	// Tail bar on the deck lip: the chase cam stares at the back of the car all race long.
	// The tail itself is a round bulge, so a flat bar can only sit flush on top of the deck.
	// Full width, because two hot pixel clusters are what survives the chase-cam downscale.
	const tail = new THREE.BoxGeometry(0.22, 0.12, sh.wid * 1.9);
	tail.translate(-sh.len * 0.92, top + 0.03, 0);
	st.push(tail);
	for (const lz of [sh.wid * 0.6, -sh.wid * 0.6]) {
		const lamp = new THREE.BoxGeometry(0.12, 0.11, 0.30);
		lamp.translate(sh.len * 0.9, top - 0.17, lz);
		st.push(lamp);
	}

	// ExtrudeGeometry is non-indexed and the primitives are indexed; mergeGeometries refuses
	// a mixed list, so everything is flattened first.
	const flat = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
	if (!trim.length) trim.push(new THREE.BoxGeometry(0, 0, 0)); // keep the 4 material groups aligned
	if (!wl.length) wl.push(new THREE.BoxGeometry(0, 0, 0)); // ditto: a car could be front-axle only
	const shell = flat(paint); // reused, ungrouped, by the outline pass: one extra draw call
	// mergeGeometries(list, true) makes one group per input, so each part is pre-merged flat.
	const geo = mergeGeometries([shell, flat(trim), flat(wl), flat(st)], true)!;
	// The sky is the reflection probe: metal with no envMap renders flat black. Only the two
	// metallic slots pay for it — the wall and the tyres stay cheap.
	const mats = [
		new THREE.MeshStandardMaterial({ color: BODY_DIFFUSE[id], metalness: 0.40, roughness: 0.44, emissive: color, emissiveIntensity: 0.70, envMap: env, envMapIntensity: 0.50 }),
		new THREE.MeshStandardMaterial({ color: 0x0A0E1A, metalness: 0.90, roughness: 0.08, envMap: env, envMapIntensity: 1.1 }),
		new THREE.MeshStandardMaterial({ color: 0x08090E, roughness: 0.85 }),
		// Whitened: a neon strip in the raw car colour vanishes against the lit bodywork.
		new THREE.MeshBasicMaterial({ color: mixHex(color, 0xffffff, 0.65), toneMapped: false, fog: false }),
	];

	const root = new THREE.Group();
	// The shadow is offset in WORLD space, away from the key at +X, so it cannot ride the heading.
	const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({
		map: blob, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, fog: false, toneMapped: false,
	}));
	shadow.rotation.x = -Math.PI / 2;
	shadow.position.set(-0.34, 0.03, 0);
	root.add(shadow);

	const spin = new THREE.Group();
	spin.rotation.order = 'YXZ'; // yaw outermost, so x is body roll and z is pitch in car space
	root.add(spin);
	// Inverted hull: without a hard edge the car dissolves into a same-coloured territory.
	const outline = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ color: 0x05060C, side: THREE.BackSide, fog: false, toneMapped: false }));
	outline.scale.setScalar(1.045);
	spin.add(outline);
	spin.add(new THREE.Mesh(geo, mats));

	const wheels = steered.map((s) => {
		const m = new THREE.Mesh(s.geo, mats[2]);
		m.position.set(...s.at);
		m.rotation.y = sh.cock; // the Toupie's front wheels are cocked at rest; steering adds to it
		spin.add(m);
		return m;
	});

	const glowMat = new THREE.MeshBasicMaterial({
		map: glowTex, color, transparent: true, opacity: sh.glowOp, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
	});
	const glow = new THREE.Mesh(new THREE.PlaneGeometry(sh.glowL, sh.glowW), glowMat);
	glow.rotation.x = -Math.PI / 2;
	// Centred on the chassis, not on the origin: every shape offsets its body backwards, and a
	// quad hanging behind the car reads as a floating rhombus.
	glow.position.set(sh.roundelX * 0.6, 0.05, 0);
	spin.add(glow);

	// The roof roundel is the identity cue that survives colour blindness and the minimap downscale.
	const rg = new THREE.PlaneGeometry(1.15, 1.15);
	const uv = rg.attributes.uv as THREE.BufferAttribute;
	for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + (id - 1)) / 4);
	const roundel = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
		map: roundelTex, transparent: true, depthWrite: false, toneMapped: false, fog: false,
	}));
	roundel.position.set(sh.roundelX, sh.roundelY, 0);
	roundel.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); // digit upright, top toward the nose
	spin.add(roundel);

	root.userData.spin = spin;
	root.userData.wheels = wheels;
	// Ackermann needs the axle gap, and it is not the same on a Comète as on a Frelon.
	root.userData.wheelbase = sh.wheelX[0] - sh.wheelX[sh.wheelX.length - 1];
	root.userData.cock = sh.cock;
	root.userData.mats = mats;
	root.userData.glow = glowMat;
	root.userData.glowOp = sh.glowOp;
	root.userData.roundel = roundel;
	return root;
}

interface Pool {
	x: Float32Array; y: Float32Array; z: Float32Array;
	vx: Float32Array; vy: Float32Array; vz: Float32Array;
	life: Float32Array; max: Float32Array;
	r: Float32Array; g: Float32Array; b: Float32Array;
	pos: Float32Array; col: Float32Array;
	geo: THREE.BufferGeometry; n: number; live: number;
}

function makePool(n: number): Pool {
	const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	geo.setDrawRange(0, 0);
	return {
		x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
		vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
		life: new Float32Array(n), max: new Float32Array(n),
		r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
		pos, col, geo, n, live: 0,
	};
}

export interface Renderer {
	/** Live FX read-outs for the DOM layer; polled, never a React state write. */
	readonly fx: { rush: number; risk: number };
	frame(state: GameState, alpha: number, dtSec: number): void;
	reset(): void; // clear trail + skid overlays and repaint territory (instant Rejouer)
	setMinimap(canvas: HTMLCanvasElement | null): void; // top-down overview drawn each frame
	snapshotMap(canvas: HTMLCanvasElement): void; // the arena as it was left, for the end card
	resize(): void;
	dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, state: GameState, carIds?: readonly string[]): Renderer | null {
	// A phone renders 2.2x the fill of a desktop sample on a far weaker GPU, and this is a 3 min
	// race: thermal throttle is the real failure mode. The art is soft glow, so 1.5x holds up.
	const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
	let renderer: THREE.WebGLRenderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse });
	} catch {
		return null;
	}
	// On a dpr-1 monitor this used to render at 1.0 and MSAA only covers geometry edges, so the
	// magnified 2-texel-per-unit floor stepped visibly. Supersampling the whole frame is what
	// fixes it: measured on one frozen frame, hard-step amplitude in the mid+near bands falls
	// 5.63 -> 2.24 at 1.5x while overall detail energy holds at 4.1, i.e. the staircase goes and
	// the sharpness stays. 2x measured no better than 1.5x (2.56) for 4x the fill, so 1.5 is the
	// floor and a real high-dpi screen still caps at 2. Phones keep their thermal budget.
	renderer.setPixelRatio(coarse
		? Math.min(1.5, window.devicePixelRatio || 1)
		: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
	// Neutral, not ACES: ACES rotates hue on saturated primaries and the four identities
	// have to stay bleu/rouge/vert/jaune and match the 2-D minimap byte for byte.
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = 1.0; // Neutral multiplies before the curve — raise the key instead

	const scene = new THREE.Scene();
	const skyTex = makeSkyTexture();
	scene.background = skyTex;
	// Engaged inside the chase frame: at 55/200 the paint at the horizon was the same RGB as the
	// paint under the wheels and the arena read as coloured paper.
	scene.fog = new THREE.Fog(0x150B2E, 14, 100);
	const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 500);
	let fov = FOV_BASE;

	const key = new THREE.DirectionalLight(0xFF4FA3, 2.2); // magenta sunset, low, aligned with the sky disc
	key.position.set(72, 30, 0);
	// 1.6, not 2.6: a hotter rim washed the deck to white and the car lost its team hue.
	const rim = new THREE.DirectionalLight(0x21E7FF, 1.6); // cyan backlight, moved with the camera
	const fill = new THREE.HemisphereLight(0x2B1B5A, 0x0A1830, 0.55);
	const up = new THREE.DirectionalLight(0x7A5CFF, 0.45); // fake neon-floor bounce onto undersides
	up.position.set(0, -1, 0);
	const rimTarget = new THREE.Object3D();
	scene.add(key, rim, fill, up, up.target, rimTarget);
	rim.target = rimTarget;

	// --- territory (opaque), skid decals, and trail: three stacked textured planes ---
	const mkCanvas = (n = GRID) => {
		const c = document.createElement('canvas');
		c.width = c.height = n;
		return { c, ctx: c.getContext('2d')! };
	};
	const terr = mkCanvas();   // with the baked rim: the minimap and the end card read this one
	const base = mkCanvas();   // neutral floor only, uploaded once: owned paint is a shader mix now
	const decal = mkCanvas();
	const trailC = mkCanvas(GRID * TRAIL_SS);
	const TRAIL_W = GRID * TRAIL_SS;

	const maxAniso = renderer.capabilities.getMaxAnisotropy();
	const mkTex = (c: HTMLCanvasElement, linear: boolean, mips = false, aniso = 1) => {
		const t = new THREE.CanvasTexture(c);
		t.flipY = false;
		t.colorSpace = THREE.SRGBColorSpace; // authored RGB reads correctly under lighting
		t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
		t.generateMipmaps = mips;
		t.minFilter = mips ? THREE.LinearMipmapLinearFilter : (linear ? THREE.LinearFilter : THREE.NearestFilter);
		t.anisotropy = Math.min(aniso, maxAniso);
		return t;
	};
	const baseTex = mkTex(base.c, true, true, 8);
	// One channel per car, 255 where that car owns the cell. Linear magnification turns those
	// steps into a continuous coverage field whose 0.5 iso-line is a curve, not a staircase — that
	// is the whole contour. A DataTexture and not a canvas: canvas 2D stores premultiplied, so a
	// car-1 cell (r 255, a 0) would read back as r 0 and that car's territory would vanish.
	const cov = new Uint8Array(TOTAL * 4);
	const covTex = new THREE.DataTexture(cov, GRID, GRID);
	covTex.magFilter = covTex.minFilter = THREE.LinearFilter;
	covTex.colorSpace = THREE.NoColorSpace; // coverage, not colour
	const decalTex = mkTex(decal.c, true, false, 2);
	const trailTex = mkTex(trailC.c, true, true, 4);

	// --- light buffer: the whole bloom pipeline. Rim + seam + trail resampled to 96x96 and
	// magnified back over the arena, so the halo is pure texture filtering. No render target,
	// no composer, and it never touches terr.c — the score bytes stay exact (INV-A).
	const emis = mkCanvas(); // rim + seam pixels only, transparent elsewhere
	const panel96 = mkCanvas(LIGHT_N); // territory contribution, refreshed on captureFlag only
	const lightC = mkCanvas(LIGHT_N); // composite, refreshed when something moved
	panel96.ctx.imageSmoothingEnabled = true;
	lightC.ctx.imageSmoothingEnabled = true;
	const lightTex = mkTex(lightC.c, true, false, 1);
	const flashC = makeFlashCanvas();

	const terrImg = terr.ctx.createImageData(GRID, GRID);
	const terr32 = new Uint32Array(terrImg.data.buffer);
	const baseImg = base.ctx.createImageData(GRID, GRID);
	const base32 = new Uint32Array(baseImg.data.buffer);
	const cov32 = new Uint32Array(cov.buffer);
	// One-hot per car, in the channel order the shader reads back as .rgba.
	const COV32 = [0, pack(255, 0, 0, 0), pack(0, 255, 0, 0), pack(0, 0, 255, 0), pack(0, 0, 0, 255)];
	const emisImg = emis.ctx.createImageData(GRID, GRID);
	const emis32 = new Uint32Array(emisImg.data.buffer);
	// Baked neutral floor: a sun wash toward +X plus a violet bleed off the four rails, so the
	// empty arena is not a flat black square. It can never touch an owned cell (INV-A).
	const SUB = new Uint32Array(TOTAL);
	// Same sweep as a byte multiplier (128 = x1.0), so owned paint keeps the floor's lighting
	// instead of replacing it with a flat chip.
	const SHADE = new Uint8Array(TOTAL);
	const SUN = [22, 7, 26] as const;
	const RAIL = [14, 8, 34] as const;
	for (let i = 0; i < TOTAL; i++) {
		const col = i % GRID, row = (i / GRID) | 0;
		const isMaj = col % 50 === 0 || row % 50 === 0;
		const isMin = col % 10 === 0 || row % 10 === 0;
		const tint = isMaj ? GRID_MAJOR : isMin ? GRID_MINOR : NEUTRAL;
		const k = (isMaj || isMin) ? 0.35 : 1;
		const ws = Math.pow(col / (GRID - 1), 1.8);
		const dw = Math.min(col, row, GRID - 1 - col, GRID - 1 - row);
		const rb = dw < 28 ? Math.pow(1 - dw / 28, 1.7) : 0;
		const d = ((col * 7 + row * 13) % 3) - 1; // dither, kills the gradient banding
		const wash = (c: number, j: number) => Math.min(255, c + k * (ws * SUN[j] + rb * RAIL[j]) + d) | 0;
		SUB[i] = pack(wash(tint[0], 0), wash(tint[1], 1), wash(tint[2], 2));
		// The 3D floor gets the same wash with NO grid lines: one texel per cell magnified over
		// half a world unit can only ever be a blurry, shimmering line, whatever its resolution.
		// The shader rules them instead, antialiased against the pixel footprint. SUB keeps them
		// because the minimap reads it at 1 cell per pixel, where a baked line is exactly right.
		base32[i] = pack(wash(NEUTRAL[0], 0), wash(NEUTRAL[1], 1), wash(NEUTRAL[2], 2));
		SHADE[i] = (0.80 + 0.32 * Math.min(1, ws * 0.9 + rb * 0.5)) * 128;
	}
	base.ctx.putImageData(baseImg, 0, 0);
	baseTex.needsUpdate = true;

	// Land-grab flash: the cells that changed hands, lit as the shape the player actually drew.
	const gainC = mkCanvas();
	const gain96 = mkCanvas(LIGHT_N);
	gain96.ctx.imageSmoothingEnabled = true;
	const gainImg = gainC.ctx.createImageData(GRID, GRID);
	const gain32 = new Uint32Array(gainImg.data.buffer);
	// 0.4, not 0.8: a 2800-cell grab painted a white sheet the size of a suburb and the player's
	// own colour vanished at the exact moment it should win.
	const GAIN32 = Uint32Array.from(BORDER_LUT, (_, i) => {
		const h = mixHex(PALETTE[i], 0xFFFFFF, 0.4);
		return pack((h >> 16) & 255, (h >> 8) & 255, h & 255, 235);
	});
	const prevOwner = new Uint8Array(TOTAL);
	const CAP_FLASH = 0.35;
	const capFx = { t: 0, a: 1 };

	// "Mine" has to be a brightness property, not a hue: the hero seat is not always id 1 online.
	let heroLit = 0;
	const heroRim = new Uint32Array(5);
	const heroEmis = new Uint32Array(5);
	const syncHeroLut = (h: number) => {
		heroLit = h;
		syncLineCol(h);
		for (let i = 1; i <= 4; i++) {
			const w = mixHex(PALETTE[i], 0xFFFFFF, 0.55);
			heroRim[i] = pack((w >> 16) & 255, (w >> 8) & 255, w & 255);
			const [r, g, b] = BORDER_LUT[i];
			heroEmis[i] = pack(r, g, b, Math.min(255, Math.round(RIM_A[i] * 1.35)));
		}
	};

	let lightDirty = true;
	const paintTerritory = (flash = true) => {
		const owner = state.owner;
		const hero = state.hero;
		if (hero !== heroLit) syncHeroLut(hero);
		let gained = 0;
		for (let i = 0; i < TOTAL; i++) {
			const id = owner[i];
			if (id !== prevOwner[i]) {
				prevOwner[i] = id;
				if (id !== 0) { gain32[i] = GAIN32[id]; gained++; } else gain32[i] = 0;
			} else gain32[i] = 0;
			if (id === 0) { terr32[i] = SUB[i]; cov32[i] = 0; emis32[i] = 0; continue; }
			const col = i % GRID, row = (i / GRID) | 0;
			// Two cells thick: a one-cell rim is smoothed away as soon as the minimap shrinks it,
			// and this is what drawMinimap reads as the shape of the map.
			const isEdge = col < 2 || col >= GRID - 2 || row < 2 || row >= GRID - 2
				|| owner[i - 1] !== id || owner[i + 1] !== id || owner[i - GRID] !== id || owner[i + GRID] !== id
				|| owner[i - 2] !== id || owner[i + 2] !== id || owner[i - 2 * GRID] !== id || owner[i + 2 * GRID] !== id;
			const mine = id === hero;
			emis32[i] = isEdge ? (mine ? heroEmis[id] : RIM_E32[id]) : BODY_E32[id];
			const sh = SHADE[i], k = hatchAt(id, col, row) ? (sh * HATCH_K[id]) >> 7 : sh;
			const body = mulShade(seamAt(id, col, row) ? SEAM32[id] : FILL32[id], k);
			// The rim stays unmodulated so the hot edge stays hot; only the interior takes the light.
			terr32[i] = isEdge ? (mine ? heroRim[id] : RIM32[id]) : body;
			cov32[i] = COV32[id];
		}
		terr.ctx.putImageData(terrImg, 0, 0);
		covTex.needsUpdate = true;
		emis.ctx.putImageData(emisImg, 0, 0);
		panel96.ctx.clearRect(0, 0, LIGHT_N, LIGHT_N);
		panel96.ctx.drawImage(emis.c, 0, 0, GRID, GRID, 0, 0, LIGHT_N, LIGHT_N);
		if (flash && gained) {
			gainC.ctx.putImageData(gainImg, 0, 0);
			gain96.ctx.clearRect(0, 0, LIGHT_N, LIGHT_N);
			gain96.ctx.drawImage(gainC.c, 0, 0, GRID, GRID, 0, 0, LIGHT_N, LIGHT_N);
			capFx.t = CAP_FLASH;
			// A big grab is a broad hue bloom; a small one keeps its hot pop.
			capFx.a = Math.max(0.5, 1 - gained * 0.00017);
		}
		lightDirty = true;
	};

	// Unlit on purpose: the territory colour IS the score. It does take a capped haze though —
	// the minimap already guarantees the authored pixels, and a big field needs depth.
	const terrMat = new THREE.MeshBasicMaterial({ map: baseTex, toneMapped: false, fog: true });
	// grainK stays 0 until the PNG lands: an unloaded sampler binds to three's empty texture, and
	// a black grain would flash the whole floor dark on the first frames. Both knobs stay uniforms
	// so scripts/bolides-v7.mjs can re-sweep them against a shipped build.
	const grainU = { grainMap: { value: null as THREE.Texture | null }, grainK: { value: 0 }, grainRep: { value: GRAIN_REPEAT } };
	const grainTex = new THREE.TextureLoader().load(GRAIN_URL, () => { grainU.grainK.value = GRAIN_K; });
	grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
	grainTex.colorSpace = THREE.NoColorSpace; // a multiplier, not a colour: no sRGB decode
	grainTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
	grainU.grainMap.value = grainTex;
	terrMat.userData.grain = grainU;
	// Owned ground: shape, fill, line and motif all come out of the coverage field, so the whole
	// floor above the wash is analytic. Colours are sRGB 0-1 because this runs after
	// colorspace_fragment, i.e. on an already-encoded gl_FragColor — same reason the old baked rim
	// was sampled with NoColorSpace.
	const v3 = (c: readonly number[]) => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255);
	const fillCol = TERRITORY_LUT.map(v3);
	const lineCol = BORDER_LUT.map(v3);
	const edgeU = {
		covMap: { value: covTex }, edgeK: { value: 1 }, edgeW: { value: EDGE_W }, patK: { value: PAT_K },
		fillCol: { value: fillCol }, lineCol: { value: lineCol },
		gridMinor: { value: v3(GRID_MINOR) }, gridMajor: { value: v3(GRID_MAJOR) },
	};
	terrMat.userData.edge = edgeU;
	// "Mine" is a brightness property here too: the hero's own line is the washed-out variant, and
	// the hero seat is not always id 1 online.
	const syncLineCol = (h: number) => {
		for (let i = 1; i <= 4; i++) {
			const w = i === h ? mixHex(PALETTE[i], 0xFFFFFF, 0.55) : 0;
			lineCol[i].copy(i === h ? v3([(w >> 16) & 255, (w >> 8) & 255, w & 255]) : v3(BORDER_LUT[i]));
		}
	};
	terrMat.onBeforeCompile = (sh) => {
		sh.uniforms.grainMap = grainU.grainMap;
		sh.uniforms.grainK = grainU.grainK;
		sh.uniforms.grainRep = grainU.grainRep;
		for (const k of ['covMap', 'edgeK', 'edgeW', 'patK', 'fillCol', 'lineCol', 'gridMinor', 'gridMajor'] as const) {
			sh.uniforms[k] = edgeU[k];
		}
		sh.fragmentShader = 'uniform sampler2D grainMap;\nuniform float grainK;\nuniform float grainRep;\n'
			+ 'uniform sampler2D covMap;\nuniform float edgeK;\nuniform float edgeW;\nuniform float patK;\n'
			+ 'uniform vec3 fillCol[5];\nuniform vec3 lineCol[5];\nuniform vec3 gridMinor;\nuniform vec3 gridMajor;\n'
			+ sh.fragmentShader;
		// Near-field darkening then a real fog mix: paint under the camera has to stay a glow on
		// asphalt, and paint at the horizon has to sit back in the air.
		sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', FLOOR_FRAG
			+ `gl_FragColor.rgb *= 1.0 + grainK * ( texture2D( grainMap, vMapUv * grainRep ).r - ${GRAIN_MEAN.toFixed(3)} );\n`
			+ '#ifdef USE_FOG\n'
			+ 'gl_FragColor.rgb *= mix( 0.70, 1.0, smoothstep( 0.0, 26.0, vFogDepth ) );\n'
			+ 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, smoothstep( fogNear, fogFar, vFogDepth ) * 0.80 );\n'
			+ '#endif');
	};
	const terrMesh = new THREE.Mesh(groundQuad(0), terrMat);
	terrMesh.renderOrder = -1;
	const decalMesh = new THREE.Mesh(groundQuad(0.014), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
	decalMesh.visible = false; // a full-screen blended quad must not cost anything while it is empty
	// Capped at 0.42: above ~0.55 the hero's blue clips to white long before red or yellow do.
	const lightMesh = new THREE.Mesh(groundQuad(0.020), new THREE.MeshBasicMaterial({
		map: lightTex, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
	}));
	const trailMesh = new THREE.Mesh(groundQuad(0.026), new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
	scene.add(terrMesh, decalMesh, lightMesh, trailMesh);
	paintTerritory(false);

	// A white wash on the floor where a line died: the snap's own vocabulary, not the death one.
	const snapFx = { x: 0, z: 0, t: 0 };
	const SNAP_FLASH = 0.28;
	const compositeLight = (fxDt: number) => {
		if (snapFx.t > 0) { snapFx.t = Math.max(0, snapFx.t - fxDt); lightDirty = true; }
		if (capFx.t > 0) { capFx.t = Math.max(0, capFx.t - fxDt); lightDirty = true; }
		if (!lightDirty) return;
		const g = lightC.ctx;
		g.clearRect(0, 0, LIGHT_N, LIGHT_N);
		g.drawImage(panel96.c, 0, 0);
		if (capFx.t > 0) {
			// One extra 96x96 blit: the reward is the ground the player just drew, lit.
			g.globalAlpha = capFx.a * (capFx.t / CAP_FLASH) ** 0.7;
			g.drawImage(gain96.c, 0, 0);
			g.globalAlpha = 1;
		}
		// At full alpha the pool swallows the tube's own white spine and a yellow trail reads
		// as one solid slug.
		g.globalAlpha = 0.7;
		g.drawImage(trailC.c, 0, 0, TRAIL_W, TRAIL_W, 0, 0, LIGHT_N, LIGHT_N);
		g.globalAlpha = 1;
		if (snapFx.t > 0) {
			const a = snapFx.t / SNAP_FLASH;
			const cx = ((snapFx.x + HALF) / ARENA) * LIGHT_N, cy = ((snapFx.z + HALF) / ARENA) * LIGHT_N;
			g.globalAlpha = 0.9 * a;
			g.drawImage(flashC, cx - 7, cy - 7, 14, 14);
			g.globalAlpha = 1;
		}
		lightTex.needsUpdate = true;
		lightDirty = false;
	};

	// --- arena rails: one extruded ring plus a lit cap strip ---
	// The footprint must stay an axis-aligned square: slideWalls clamps to one and the capture
	// flood fill seeds from the rectangular border rows. Only the top edge is chamfered.
	const ringShape = (outer: number, inner: number) => {
		const s = new THREE.Shape();
		s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.closePath();
		const hole = new THREE.Path();
		hole.moveTo(-inner, -inner); hole.lineTo(-inner, inner); hole.lineTo(inner, inner); hole.lineTo(inner, -inner); hole.closePath();
		s.holes.push(hole);
		return s;
	};
	const wallGeo = new THREE.ExtrudeGeometry(ringShape(HALF + 2, HALF), { depth: 2.0, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.14, bevelSegments: 2 });
	wallGeo.rotateX(-Math.PI / 2);
	wallGeo.computeBoundingBox();
	wallGeo.translate(0, -wallGeo.boundingBox!.min.y, 0);
	// Dark, but no longer the only pure black in a painted arena, and hazard-striped: the edge
	// you must not cross has to be identifiable at any camera height.
	const wallHazTex = makeHazardTexture(0xFFB86A, 0x000000, 5);
	wallHazTex.repeat.set(0.34, 0.34);
	wallHazTex.anisotropy = maxAniso; // the rail is the grazing-angle surface aniso exists for
	scene.add(new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
		color: 0x0D0B20, roughness: 0.7, metalness: 0.2, emissive: 0xFFFFFF, emissiveMap: wallHazTex, emissiveIntensity: 0.26,
	})));
	// White-lilac, not magenta: magenta is one hue step from the red fill and reads as territory.
	const capHazTex = makeHazardTexture(0xFFC07A, 0xDCCBFF, 5);
	capHazTex.repeat.set(0.34, 0.34);
	capHazTex.anisotropy = maxAniso; // the rail is the grazing-angle surface aniso exists for
	const capGeo = new THREE.ExtrudeGeometry(ringShape(HALF + 2.2, HALF - 0.2), { depth: 0.1, bevelEnabled: false });
	capGeo.rotateX(-Math.PI / 2);
	capGeo.computeBoundingBox();
	capGeo.translate(0, 2.02 - capGeo.boundingBox!.min.y, 0);
	scene.add(new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ map: capHazTex, toneMapped: false, fog: false })));

	// --- LED share ribbon: the only car-coloured element off the floor, so it can't be
	// misread as territory. Widths track the leaderboard. ---
	const ledCanvas = document.createElement('canvas');
	ledCanvas.width = 256; ledCanvas.height = 8;
	const led = { c: ledCanvas, ctx: ledCanvas.getContext('2d')! };
	const ledTex = mkTex(led.c, true, false, 1);
	ledTex.wrapS = THREE.RepeatWrapping;
	ledTex.repeat.set(4, 1);
	// Measured: at 0.9 / 0.85 units the leader's chevron washes the whole near wall face in its
	// own hue and the pale cap strip disappears. Narrower, dimmer, and mixed toward the cap
	// lilac — still readable at 40 units, no longer a second floor colour.
	const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false, fog: false, transparent: true, opacity: 0.85 });
	const ledGeo = new THREE.PlaneGeometry(ARENA, 0.55);
	for (const [px, pz, ry] of [[0, -HALF + 0.1, 0], [0, HALF - 0.1, Math.PI], [-HALF + 0.1, 0, Math.PI / 2], [HALF - 0.1, 0, -Math.PI / 2]] as const) {
		const m = new THREE.Mesh(ledGeo, ledMat);
		m.position.set(px, 1.55, pz);
		m.rotation.y = ry;
		scene.add(m);
	}
	const repaintLed = (s: GameState) => {
		led.ctx.clearRect(0, 0, 256, 8);
		let x = 0;
		for (let id = 1; id <= 4; id++) {
			const w = Math.max(6, Math.round((s.counts[id] / TOTAL) * 512));
			led.ctx.fillStyle = cssHex(mixHex(PALETTE[id], 0xDCCBFF, 0.35));
			led.ctx.beginPath();
			led.ctx.moveTo(x, 0); led.ctx.lineTo(x + w, 0); led.ctx.lineTo(x + w + 4, 4);
			led.ctx.lineTo(x + w, 8); led.ctx.lineTo(x, 8); led.ctx.lineTo(x + 4, 4);
			led.ctx.closePath(); led.ctx.fill();
			x += w + 6;
		}
		ledTex.needsUpdate = true;
	};
	repaintLed(state);

	// --- cars ---
	const blobTex = makeBlobTexture();
	const glowTex = makeGlowTexture();
	const roundelTex = makeRoundelTexture();
	// Prefiltered, or a raw equirect envMap mirrors the sky sharply whatever the roughness and
	// the bodywork washes out to white against the horizon band.
	const pmrem = new THREE.PMREMGenerator(renderer);
	const envTex = pmrem.fromEquirectangular(skyTex).texture;
	pmrem.dispose();
	const carMeshes: THREE.Group[] = state.cars.map((c, i) => {
		const shape = CAR_SHAPES[carIds?.[i] ?? ''] ?? CAR_SHAPES.roadster;
		const m = makeCarMesh(c.id, shape, blobTex, glowTex, roundelTex, envTex);
		scene.add(m);
		return m;
	});
	const carSpins: THREE.Group[] = carMeshes.map((m) => m.userData.spin as THREE.Group);
	const carGlows: THREE.MeshBasicMaterial[] = carMeshes.map((m) => m.userData.glow as THREE.MeshBasicMaterial);
	const carRoundels: THREE.Mesh[] = carMeshes.map((m) => m.userData.roundel as THREE.Mesh);
	const carWheels: THREE.Mesh[][] = carMeshes.map((m) => m.userData.wheels as THREE.Mesh[]);
	const carBase = carMeshes.map((m) => m.userData.wheelbase as number);
	const carCock = carMeshes.map((m) => m.userData.cock as number);
	const prevSpeed = new Float32Array(state.cars.length);
	const prevHeading = new Float32Array(state.cars.length);
	const steerAng = new Float32Array(state.cars.length);

	// "Which one am I" answered by shape, not by paint.
	const heroRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.65, 40), new THREE.MeshBasicMaterial({
		transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false,
	}));
	heroRing.rotation.x = -Math.PI / 2;
	heroRing.position.y = 0.045;
	scene.add(heroRing);
	// Risk is a SECOND ring in the complement of the ground being crossed. Lerping the hero's own
	// ring toward the foe hue made it vanish on foe ground — the one moment it must not.
	const riskRing = new THREE.Mesh(new THREE.RingGeometry(1.78, 2.28, 40), new THREE.MeshBasicMaterial({
		transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false,
	}));
	riskRing.rotation.x = -Math.PI / 2;
	riskRing.position.y = 0.046;
	riskRing.visible = false;
	scene.add(riskRing);

	// Rail contact flare, ON the rail. A billboard, not a quad in the wall plane: you always
	// slide ALONG a wall, so a wall-plane quad is seen edge-on and collapses to a white bar.
	// Doubles as the proximity warning when the hero closes on a boundary.
	const scrapeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
		// depthTest false is load-bearing: the sprite is coplanar with the rail, so the wall was
		// clipping 63% of it away. Measured on one frame, same opacity: 1571 lit px with the test
		// on, 4809 with it off. Opacity was the wrong knob — the flare was occluded, not dim.
		map: glowTex, color: 0xFFD9A0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
	}));
	scrapeGlow.visible = false;
	scene.add(scrapeGlow);

	// Threat chevrons: rivals are almost never inside the chase frame, so the danger is pinned
	// to the screen edge at their bearing. Children of the camera, so placement is camera-space.
	const chevTex = makeChevronTexture();
	const chevrons = state.cars.map(() => {
		const sp = new THREE.Sprite(new THREE.SpriteMaterial({
			map: chevTex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false,
		}));
		sp.scale.set(0.11, 0.11, 1);
		sp.visible = false;
		sp.renderOrder = 20;
		camera.add(sp);
		return sp;
	});
	scene.add(camera);

	// --- particles: a round sprite (gl.POINTS with no map draws literal screen-space squares),
	// split so smoke can stay non-additive, in two fixed struct-of-arrays pools. ---
	const pMatAdd = new THREE.PointsMaterial({ size: 1.4, map: blobTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
	// Additive: over the dark floor a pale non-additive puff resolved to flat grey — the only
	// unsaturated shape in a neon world — and it erased the trail it sat on.
	// 0.17 was the binding constraint, not the pool size: with the puffs finally living, the smoke
	// still measured indistinguishable over painted floor and 15 px above delta 30 over bare floor.
	const pMatSmoke = new THREE.PointsMaterial({ size: 1.3, map: blobTex, vertexColors: true, transparent: true, opacity: 0.30, depthWrite: false, blending: THREE.AdditiveBlending });
	const burst = makePool(ADD_PARTICLES);
	const smoke = makePool(SMOKE_PARTICLES);
	for (const [p, m] of [[burst, pMatAdd], [smoke, pMatSmoke]] as const) {
		const pts = new THREE.Points(p.geo, m);
		pts.frustumCulled = false;
		scene.add(pts);
	}
	// Destructuring rgb() here would allocate an array per call, and this runs from the car loop.
	// dvx/dvz biases the cone: sparks have to streak along the wall, not pool at the contact.
	// jit scatters the birth points: a burst spawned at one exact point stays a fused ball for
	// half its life, which reads as a flashbulb rather than as debris.
	const spawn = (p: Pool, x: number, z: number, color: number, spread: number, upv: number, count: number, life: number, bright = 1, dvx = 0, dvz = 0, jit = 0) => {
		const k0 = bright / 255;
		const cr = ((color >> 16) & 255) * k0, cg = ((color >> 8) & 255) * k0, cb = (color & 255) * k0;
		for (let k = 0; k < count && p.live < p.n; k++) {
			const i = p.live++;
			const a = Math.random() * TAU, s = Math.random() * spread;
			p.x[i] = x + (Math.random() - 0.5) * jit; p.z[i] = z + (Math.random() - 0.5) * jit; p.y[i] = 0.5;
			p.vx[i] = Math.cos(a) * s + dvx; p.vz[i] = Math.sin(a) * s + dvz; p.vy[i] = upv * (0.4 + Math.random());
			p.life[i] = life; p.max[i] = life;
			p.r[i] = cr; p.g[i] = cg; p.b[i] = cb;
		}
	};
	const stepPool = (p: Pool, dt: number) => {
		for (let i = 0; i < p.live; i++) {
			p.life[i] -= dt;
			if (p.life[i] <= 0) { // swap-remove: no splice, no allocation
				const j = --p.live;
				p.x[i] = p.x[j]; p.y[i] = p.y[j]; p.z[i] = p.z[j];
				p.vx[i] = p.vx[j]; p.vy[i] = p.vy[j]; p.vz[i] = p.vz[j];
				p.life[i] = p.life[j]; p.max[i] = p.max[j];
				p.r[i] = p.r[j]; p.g[i] = p.g[j]; p.b[i] = p.b[j];
				i--; continue;
			}
			p.x[i] += p.vx[i] * dt; p.z[i] += p.vz[i] * dt; p.y[i] += p.vy[i] * dt;
			p.vy[i] -= 6 * dt;
			if (p.y[i] < 0.1) { p.y[i] = 0.1; p.vy[i] = 0; }
			const o = i * 3, f = p.life[i] / p.max[i];
			p.pos[o] = p.x[i]; p.pos[o + 1] = p.y[i]; p.pos[o + 2] = p.z[i];
			p.col[o] = p.r[i] * f; p.col[o + 1] = p.g[i] * f; p.col[o + 2] = p.b[i] * f;
		}
		p.geo.setDrawRange(0, p.live);
		p.geo.attributes.position.needsUpdate = true;
		p.geo.attributes.color.needsUpdate = true;
	};

	// --- capture rings: the shockwave that makes closing a loop feel like it paid off ---
	const rampTex = makeRampTexture();
	const ringGeo = new THREE.RingGeometry(0.72, 1, 96);
	{
		// RingGeometry UVs are box-mapped, so a radial ramp needs them rewritten.
		const p = ringGeo.attributes.position as THREE.BufferAttribute;
		const u = ringGeo.attributes.uv as THREE.BufferAttribute;
		for (let k = 0; k < p.count; k++) u.setXY(k, (Math.hypot(p.getX(k), p.getY(k)) - 0.72) / 0.28, 0.5);
	}
	const rings = Array.from({ length: 7 }, () => {
		const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: rampTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
		m.rotation.x = -Math.PI / 2;
		m.position.y = 0.4;
		m.visible = false;
		scene.add(m);
		return { mesh: m, life: 0, start: 3, grow: 34, delay: 0 };
	});
	const RING_LIFE = 0.75;
	/** `grow` may be negative — that is the snap ring, which collapses inward. */
	const popRing = (x: number, z: number, color: number, start: number, grow: number, delay = 0) => {
		let slot = rings[0];
		for (const r of rings) if (r.life <= 0 && r.delay <= 0) { slot = r; break; }
		slot.life = RING_LIFE;
		slot.start = start; slot.grow = grow; slot.delay = delay;
		slot.mesh.position.set(x, 0.4, z);
		slot.mesh.visible = false; // stepRings sizes it before it is ever shown
		(slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
	};
	const stepRings = (dtSec: number) => {
		for (const r of rings) {
			if (r.delay > 0) { r.delay -= dtSec; r.mesh.visible = false; continue; }
			if (r.life <= 0) { r.mesh.visible = false; continue; }
			r.life -= dtSec;
			const t = 1 - Math.max(0, r.life) / RING_LIFE;
			r.mesh.visible = r.life > 0;
			const s = Math.max(0.2, r.start + t * r.grow);
			r.mesh.scale.set(s, s, 1);
			(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) ** 1.6;
		}
	};

	// --- decal (skid) painter: stroked segments, or a drift is a dotted row of squares ---
	const decalX = new Int16Array(state.cars.length);
	const decalZ = new Int16Array(state.cars.length);
	const decalOk = new Uint8Array(state.cars.length);
	let decalInk = 0; // seconds of skid left on the plane; below 0 the quad is not drawn at all
	const paintDecal = (i: number, x: number, z: number) => {
		const col = clampCell((x + HALF) / CELL), row = clampCell((z + HALF) / CELL);
		// The jump guard backs up the respawn reset: never draw a line across the whole arena.
		if (decalOk[i] && Math.abs(decalX[i] - col) < 6 && Math.abs(decalZ[i] - row) < 6) {
			const g = decal.ctx;
			g.lineCap = g.lineJoin = 'round';
			g.beginPath();
			g.moveTo(decalX[i], decalZ[i]);
			g.lineTo(col, row);
			// Warm dust halo under a dark rubber core: black on black is invisible on the unowned floor and a
			// pure white line is invisible on bright territory. The halo must be WARM: a cold blue-white one
				// read as a light streak instead of gomme, and flip-flopped across two review rounds.
			g.strokeStyle = 'rgba(198,178,150,0.20)'; g.lineWidth = 3.0; g.stroke();
			g.strokeStyle = 'rgba(10,8,14,0.40)'; g.lineWidth = 1.6; g.stroke();
			decalTex.needsUpdate = true;
			decalInk = 9.5;
			decalMesh.visible = true;
		}
		decalX[i] = col; decalZ[i] = row; decalOk[i] = 1;
	};

	// Skid marks used to stay for the whole race and ended up masking the territory
	// underneath, which IS the score. Fade them in steps: an 8-bit alpha ignores a
	// per-frame nudge too small to round down. A mark is gone in ~9 s.
	let decalFadeAcc = 0;
	const fadeDecals = (dtSec: number) => {
		if (decalInk <= 0) return;
		decalInk -= dtSec;
		decalFadeAcc += dtSec;
		if (decalFadeAcc < 0.35) return;
		decalFadeAcc = 0;
		decal.ctx.globalCompositeOperation = 'destination-out';
		decal.ctx.fillStyle = 'rgba(0,0,0,0.1)';
		decal.ctx.fillRect(0, 0, GRID, GRID);
		decal.ctx.globalCompositeOperation = 'source-over';
		decalTex.needsUpdate = true;
		if (decalInk <= 0) { decal.ctx.clearRect(0, 0, GRID, GRID); decalMesh.visible = false; }
	};

	// --- trail: stroked from car.trail (an ordered cell array) as a rounded polyline ---
	const lastStroked = new Int32Array(state.cars.length);
	const sx2 = (cell: number) => (cell % GRID) * TRAIL_SS + TRAIL_SS / 2;
	const sy2 = (cell: number) => ((cell / GRID) | 0) * TRAIL_SS + TRAIL_SS / 2;
	const strokeRun = (t: number[], from: number, to: number, id: number) => {
		if (to - from < 1) return;
		const ctx = trailC.ctx;
		ctx.lineCap = ctx.lineJoin = 'round';
		ctx.beginPath();
		// Cell centres form a staircase; curving through midpoints hides the steps. Starting on a
		// midpoint keeps every restroke identical to the last one, so the overlap leaves no bead.
		if (from > 0) ctx.moveTo((sx2(t[from]) + sx2(t[from + 1])) / 2, (sy2(t[from]) + sy2(t[from + 1])) / 2);
		else ctx.moveTo(sx2(t[from]), sy2(t[from]));
		for (let k = from + 1; k < to; k++) {
			const x = sx2(t[k]), y = sy2(t[k]);
			ctx.quadraticCurveTo(x, y, (x + sx2(t[k + 1])) / 2, (y + sy2(t[k + 1])) / 2);
		}
		// The path stops on the last midpoint: a lineTo the tip cell would poke a bead out of
		// every corner, and this paint is opaque, so a later stroke can never take it back.
		// Body width is uniform: a wider hero body beat against the light buffer's downsample and
		// laddered the tube. Hero emphasis rides on the core instead.
		const mine = id === state.hero;
		ctx.lineWidth = 3.4; ctx.strokeStyle = cssHex(PALETTE[id]);
		ctx.stroke();
		// 0.35, not 0.65: with the additive light plane on top, a whiter core clipped the hero's
		// blue to a pale smear while red and yellow stayed vivid.
		ctx.lineWidth = mine ? 1.7 : 1.2; ctx.strokeStyle = cssHex(mixHex(PALETTE[id], 0xffffff, 0.35));
		ctx.stroke();
	};
	const applyTrail = (s: GameState) => {
		let full = false;
		for (let i = 0; i < s.cars.length; i++) if (s.cars[i].trail.length < lastStroked[i]) full = true;
		if (!full) for (const cell of s.trailDirty) if (s.trail[cell] === 0) { full = true; break; }
		if (full) {
			trailC.ctx.clearRect(0, 0, TRAIL_W, TRAIL_W);
			lastStroked.fill(0);
		}
		let dirty = full;
		for (let i = 0; i < s.cars.length; i++) {
			const t = s.cars[i].trail;
			if (t.length > lastStroked[i]) {
				// Start two indices back so consecutive frames join with no notch.
				strokeRun(t, Math.max(0, lastStroked[i] - 2), t.length - 1, s.cars[i].id);
				lastStroked[i] = t.length;
				dirty = true;
			}
		}
		s.trailDirty.length = 0;
		if (dirty) { trailTex.needsUpdate = true; lightDirty = true; }
	};

	const heroCar = (s: GameState) => s.cars[s.hero - 1] ?? s.cars[0];
	let camHeading = heroCar(state).vh; // eased so quick turns don't whip the camera
	const shake = { t: 0, dur: 0.35, mag: 0 };
	// A weaker source must not cut a bigger shake short.
	const setShake = (mag: number, dur: number) => {
		if (mag <= shake.mag * Math.max(0, shake.t / shake.dur)) return;
		shake.mag = mag; shake.dur = dur; shake.t = dur;
	};
	let hitStop = 0; // FX-only freeze after a kill; the sim never sees it
	let frameNo = 0;
	let fxTime = 0;
	const fx = { rush: 0, risk: 0 };
	// Last frame's trail per car: a snap event arrives after the engine has already cleared it,
	// and the shatter has to spawn along the line that was there.
	const SNAP_MAX = 640;
	const trailSnap = new Int32Array(state.cars.length * SNAP_MAX);
	const trailSnapN = new Int32Array(state.cars.length);
	let miniCtx: CanvasRenderingContext2D | null = null;
	let miniEl: HTMLCanvasElement | null = null;
	let miniFont = '700 6px system-ui, sans-serif';
	// The markup fixes the backing store at 150 for a 108-132 px box; on a phone that is blurry.
	const syncMini = () => {
		if (!miniEl) return;
		const ss = Math.max(1.5, Math.min(2, window.devicePixelRatio || 1));
		const px = Math.round((miniEl.clientWidth || 132) * ss);
		if (miniEl.width !== px) { miniEl.width = px; miniEl.height = px; }
		miniFont = `700 ${Math.round(5.2 * (miniEl.width / 132))}px system-ui, -apple-system, sans-serif`;
	};
	const setMinimap = (c: HTMLCanvasElement | null) => {
		miniEl = c;
		miniCtx = c ? c.getContext('2d') : null;
		syncMini();
	};

	// Top-down overview: territory + trails (resampled from their canvases) + car dots.
	const drawMinimap = (s: GameState) => {
		if (!miniCtx) return;
		const W = miniCtx.canvas.width, H = miniCtx.canvas.height;
		const k = W / 132; // dot scale, so the backing store can grow with devicePixelRatio
		miniCtx.imageSmoothingEnabled = true;
		miniCtx.imageSmoothingQuality = 'high';
		miniCtx.clearRect(0, 0, W, H);
		miniCtx.drawImage(terr.c, 0, 0, GRID, GRID, 0, 0, W, H);
		miniCtx.drawImage(trailC.c, 0, 0, TRAIL_W, TRAIL_W, 0, 0, W, H);
		miniCtx.textAlign = 'center';
		miniCtx.textBaseline = 'middle';
		for (const car of s.cars) {
			if (!car.alive) continue;
			const hero = car.id === s.hero;
			const mx = ((car.x + HALF) / ARENA) * W, my = ((car.z + HALF) / ARENA) * H;
			miniCtx.fillStyle = cssHex(PALETTE[car.id]);
			miniCtx.beginPath();
			miniCtx.arc(mx, my, (hero ? 4.2 : 3.6) * k, 0, TAU);
			miniCtx.fill();
			// A bot's dot sits on its own fill: without a dark collar it vanishes at home.
			miniCtx.strokeStyle = '#05030F';
			miniCtx.lineWidth = 1.6 * k;
			miniCtx.stroke();
			if (hero) {
				miniCtx.strokeStyle = '#fff';
				miniCtx.lineWidth = 1.4 * k;
				miniCtx.stroke();
				miniCtx.beginPath(); // heading tick
				miniCtx.moveTo(mx, my);
				miniCtx.lineTo(mx + Math.cos(car.heading) * 8 * k, my + Math.sin(car.heading) * 8 * k);
				miniCtx.stroke();
			}
			// The digit is the only cue on the overview that is not a hue.
			if (k >= 1.2) {
				miniCtx.font = miniFont;
				miniCtx.fillStyle = '#05030F';
				miniCtx.fillText(String(car.id), mx, my + 0.5 * k);
			}
		}
	};

	// Same two blits as the overview, minus the car dots: the end card is about the ground that
	// changed hands over three minutes, and a dot on it just reads as "here is where you stopped".
	const snapshotMap = (c: HTMLCanvasElement) => {
		const g = c.getContext('2d');
		if (!g) return;
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = 'high';
		g.clearRect(0, 0, c.width, c.height);
		g.drawImage(terr.c, 0, 0, GRID, GRID, 0, 0, c.width, c.height);
		g.drawImage(trailC.c, 0, 0, TRAIL_W, TRAIL_W, 0, 0, c.width, c.height);
	};

	const resize = () => {
		const w = canvas.clientWidth, h = canvas.clientHeight || Math.round(w * 0.625);
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		syncMini(); // fullscreen swaps the minimap box from 108 to 132 css px
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
	const carIndex = (s: GameState, id: number) => {
		for (let i = 0; i < s.cars.length; i++) if (s.cars[i].id === id) return i;
		return -1;
	};
	// A capture event carries the region centroid, which is usually nowhere near where the loop
	// was closed. Read the car's own interpolated pose instead, into scratch (no allocation).
	let poseX = 0, poseZ = 0;
	const readPoseOf = (s: GameState, id: number, alpha: number) => {
		const i = carIndex(s, id);
		const c = i >= 0 ? s.cars[i] : null;
		poseX = c ? c.px + (c.x - c.px) * alpha : 0;
		poseZ = c ? c.pz + (c.z - c.pz) * alpha : 0;
	};
	// A bot exploding in the far corner must not shake the camera at full strength.
	const attenuate = (x: number, z: number, hx: number, hz: number) => {
		const k = Math.max(0, 1 - Math.hypot(x - hx, z - hz) / 70);
		return k * k;
	};
	const cellX = (cell: number) => (cell % GRID) * CELL - HALF + CELL / 2;
	const cellZ = (cell: number) => ((cell / GRID) | 0) * CELL - HALF + CELL / 2;
	// The only effect in the game with a linear silhouette: the lost line shatters where it lay.
	const shatterTrail = (i: number) => {
		if (i < 0) return 0;
		const base = i * SNAP_MAX, n = trailSnapN[i];
		for (let k = 0; k < n; k += 8) spawn(burst, cellX(trailSnap[base + k]), cellZ(trailSnap[base + k]), 0xE8F0FF, 1.7, 2.4, 1, 0.5, 1.3);
		return n;
	};
	const scratch = new THREE.Vector3();
	const RIM_COOL = new THREE.Color(0x21E7FF);
	const foeCol = new THREE.Color();

	// A rival is a threat when it is close to the hero, or closing on the line the hero is
	// laying. Off screen, it becomes a chevron on the rim at its bearing.
	const THREAT_NEAR = 26, THREAT_LINE = 22;
	const placeChevrons = (s: GameState, hx: number, hz: number, heroId: number) => {
		const th = Math.tan(fov * Math.PI / 360), d = 2;
		const heroI = carIndex(s, heroId);
		const ln = heroI >= 0 ? trailSnapN[heroI] : 0;
		for (let i = 0; i < s.cars.length; i++) {
			const car = s.cars[i], sp = chevrons[i];
			if (car.id === heroId || !car.alive) { sp.visible = false; continue; }
			const dx = car.x - hx, dz = car.z - hz;
			let threat = dx * dx + dz * dz < THREAT_NEAR * THREAT_NEAR;
			for (let k = 0; !threat && k < ln; k += 6) {
				const cell = trailSnap[heroI * SNAP_MAX + k];
				const tx = car.x - cellX(cell), tz = car.z - cellZ(cell);
				if (tx * tx + tz * tz < THREAT_LINE * THREAT_LINE) threat = true;
			}
			if (!threat) { sp.visible = false; continue; }
			scratch.set(car.x, 0.8, car.z);
			camera.worldToLocal(scratch);
			let nx: number, ny: number;
			if (scratch.z < -0.2) { nx = scratch.x / -scratch.z / (th * camera.aspect); ny = scratch.y / -scratch.z / th; }
			else { nx = (scratch.x >= 0 ? 4 : -4); ny = -1.6; } // behind the camera: pin low, on its side
			const m = Math.max(Math.abs(nx), Math.abs(ny));
			if (m <= 0.84) { sp.visible = false; continue; } // already in frame, no marker needed
			nx = nx / m * 0.84; ny = ny / m * 0.84;
			sp.position.set(nx * d * th * camera.aspect, ny * d * th, -d);
			const mat = sp.material as THREE.SpriteMaterial;
			mat.rotation = Math.atan2(ny, nx);
			mat.color.setHex(PALETTE[car.id]);
			// A rival closing on the line has to visibly grow, or the alarm has no urgency.
			const near = Math.max(0, Math.min(1, (30 - Math.sqrt(dx * dx + dz * dz)) / 30));
			sp.scale.setScalar(0.09 + 0.07 * near);
			sp.visible = true;
		}
	};

	let miniAcc = 0;
	let ledAcc = 0;

	const frame = (s: GameState, alpha: number, dtSec: number) => {
		frameNo++;
		// FX-only timestep: a kill freezes the particles, rings, shake and camera eases for ~90 ms
		// while the sim (fixed-step, in React) keeps running underneath.
		let fxDt = dtSec;
		if (hitStop > 0) { hitStop -= dtSec; fxDt = dtSec * 0.15; }
		// Consume engine output.
		if (s.captureFlag) { paintTerritory(); s.captureFlag = false; }
		applyTrail(s);
		fadeDecals(fxDt);
		stepRings(fxDt);

		const pp = carPose(heroCar(s), alpha);

		for (const e of s.events) {
			if (e.type === 'capture') {
				// Log, not linear: real landings gain 60-700 cells, so /3000 fired the whole
				// effect at 2% and the reward beat was a repaint.
				const v = Math.min(1, Math.log2(1 + e.gain / 40) / 5.5);
				readPoseOf(s, e.id, alpha);
				// Whitened: an owner-coloured ring expands over ground that just turned that colour.
				const hot = mixHex(PALETTE[e.id], 0xFFFFFF, 0.65);
				spawn(burst, poseX, poseZ, PALETTE[e.id], 6, 3, 20 + ((26 * v) | 0), 0.8);
				// Wide mapping: at 0.6+0.8v an 8x bigger grab was only 1.44x wider on screen.
				popRing(poseX, poseZ, hot, 3 + 6 * v, 34 * (0.25 + 1.6 * v));
				if (v > 0.5) popRing(poseX, poseZ, hot, 2 + 4 * v, 24 * (0.25 + 1.6 * v), 0.07);
				if (v > 0.8) popRing(poseX, poseZ, hot, 1 + 3 * v, 46 * v, 0.15);
				if (e.id === s.hero) setShake(0.25 + 0.5 * v, 0.18);
			} else if (e.type === 'kill') {
				// Shards, not a ring: a kill must not speak the same language as a capture. Spread 10
				// threw them off-frame inside 0.3 s and a kill read as four dim dots, so the cone is
				// tighter, overbright and longer-lived — same language, it just survives the glance.
				// jit is what makes them read AS shards: hitStop runs the burst at 0.15x for 140 ms,
				// so particles born at one point are still a fused white ball when the freeze lifts.
				// The white core is small and dim on purpose — 14 at bright 2.2 clipped the victim's
				// hue out of the first 250 ms, which is the only part of a kill anyone looks at.
				spawn(burst, e.x, e.z, mixHex(PALETTE[e.victim], 0xFFFFFF, 0.22), 6.5, 9, 46, 1.15, 1.3, 0, 0, 4);
				spawn(burst, e.x, e.z, 0xFFFFFF, 2.2, 7, 8, 0.45, 1.5, 0, 0, 2.5);
				if (e.killer === s.hero) { hitStop = 0.14; setShake(1.0, 0.28); }
			} else if (e.type === 'death') {
				spawn(burst, e.x, e.z, PALETTE[e.id], 14, 5, 40, 0.9);
				if (e.isPlayer) setShake(1.6, 0.35);
				else setShake(0.7 * attenuate(e.x, e.z, pp.x, pp.z), 0.30);
				const i = carIndex(s, e.id); if (i >= 0) decalOk[i] = 0;
			} else if (e.type === 'snap') {
				// A setback, not a crash: the line itself shatters along its length, which is the
				// one silhouette no other effect uses. Weight scales with what was actually lost.
				const lost = shatterTrail(carIndex(s, e.id));
				spawn(burst, e.x, e.z, mixHex(PALETTE[e.id], 0xFFFFFF, 0.35), 4, 1.5, 14, 0.35);
				popRing(e.x, e.z, 0xE8F0FF, 12, -9);
				snapFx.x = e.x; snapFx.z = e.z; snapFx.t = SNAP_FLASH;
				if (e.isPlayer) setShake(0.8 + 0.8 * Math.min(1, lost / 120), 0.30);
			} else if (e.type === 'respawn') {
				spawn(burst, e.x, e.z, PALETTE[e.id], 5, 4, 22, 0.7);
				const i = carIndex(s, e.id); if (i >= 0) decalOk[i] = 0;
			}
		}
		// events are cleared by the React loop after both render + UI have read them.
		compositeLight(fxDt);

		// Risk channel: the deeper the excursion, the more the frame takes the colour of the
		// ground being crossed and the harder the hero's underglow beats.
		const hero = heroCar(s);
		fxTime += fxDt;
		const risk = hero.alive && hero.outside ? Math.min(1, hero.trail.length / 120) : 0;
		fx.risk = risk;
		const under = s.owner[clampCell((pp.z + HALF) / CELL) * GRID + clampCell((pp.x + HALF) / CELL)];
		foeCol.setHex(under && under !== s.hero ? PALETTE[under] : 0xFF4FA3);
		rim.color.copy(RIM_COOL).lerp(foeCol, risk * 0.7);

		let wallFlare = 0, wallFlareK = 0;
		// Cars: transform, body attitude, skid decals + smoke.
		for (let i = 0; i < s.cars.length; i++) {
			const car = s.cars[i];
			const mesh = carMeshes[i], spin = carSpins[i];
			// Snapshot before the engine can clear it: a snap fires after the trail is gone.
			{
				const t = car.trail, n = t.length < SNAP_MAX ? t.length : SNAP_MAX, base = i * SNAP_MAX;
				for (let k = 0; k < n; k++) trailSnap[base + k] = t[k];
				trailSnapN[i] = n;
			}
			mesh.visible = car.alive;
			if (!car.alive) { prevSpeed[i] = car.speed; prevHeading[i] = car.heading; continue; }
			const pose = carPose(car, alpha);
			mesh.position.set(pose.x, 0, pose.z);
			// No cosmetic wobble any more: the nose really does point off the travel line.
			spin.rotation.y = -pose.heading;
			// Negated: a car rolls AWAY from the corner onto its outer suspension. Only a
			// motorbike leans in, and leaning a car in is what read as a wrong-axis spin.
			spin.rotation.x = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, -car.turnRate * car.speed * ROLL_K));
			// Real acceleration, not a per-frame speed delta: the old form doubled at 30 fps.
			const accel = (car.speed - prevSpeed[i]) / Math.max(fxDt, 1e-3);
			spin.rotation.z = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, accel * PITCH_K));
			prevSpeed[i] = car.speed;
			// Front wheels. Ackermann off the RENDERED yaw rate, not off car.turnRate: a remote
			// car is eased onto the poses its owner sends and never runs the physics, so its
			// turnRate is frozen at 0 and its wheels would sit dead straight all race.
			const yaw = angleDiff(pose.heading, prevHeading[i]) / Math.max(fxDt, 1e-3);
			prevHeading[i] = pose.heading;
			const want = Math.atan2(carBase[i] * yaw, Math.max(car.speed, 4)) * STEER_K;
			steerAng[i] += (Math.max(-STEER_MAX, Math.min(STEER_MAX, want)) - steerAng[i]) * Math.min(1, fxDt * STEER_EASE);
			for (const w of carWheels[i]) w.rotation.y = carCock[i] + steerAng[i];
			// The chip must never fall under a readable size just because the car is far away.
			const dx = pose.x - camera.position.x, dz = pose.z - camera.position.z;
			const d = Math.sqrt(dx * dx + dz * dz);
			carRoundels[i].scale.setScalar(d < 22 ? 1.5 : Math.min(2.6, 1.5 * d / 22));
			// A rival 40 units away must not be a brighter light than the hero at 6.
			const gk = d < 18 ? 1 : Math.max(0.25, 18 / d);
			carGlows[i].opacity = (mesh.userData.glowOp as number) * gk
				* (car.id === s.hero ? 1 + risk * 0.55 * Math.sin(fxTime * 9) : 1);
			if (car.drifting) {
				const bx = pose.x - Math.cos(pose.heading) * 1.3;
				const bz = pose.z - Math.sin(pose.heading) * 1.3;
				paintDecal(i, bx, bz);
				// Lit by the car's own underglow, not grey: smoke was the one desaturated shape in
				// a neon world, and 80 alpha sprites deleted the trail they sat on.
				spawn(smoke, bx, bz, mixHex(PALETTE[car.id], 0xFFFFFF, 0.25), 2.8, 2.4, 1, 0.45, 0.6);
				// Hot core: the moment traction snaps needs a spike, not a slow bloom.
				if ((frameNo & 1) === 0) spawn(burst, bx, bz, mixHex(PALETTE[car.id], 0xFFFFFF, 0.3), 0.9, 1.0, 1, 0.22, 1.1);
			} else {
				decalOk[i] = 0;
			}
			// Trail head: laying a line spits welding sparks off the rear contact point, and the
			// longer the excursion runs the brighter they get.
			if (car.outside && (frameNo & 1) === 0) {
				const g = 0.25 + 0.45 * Math.min(1, car.trail.length / 120);
				spawn(burst, pose.x - Math.cos(pose.heading) * 1.35, pose.z - Math.sin(pose.heading) * 1.35, PALETTE[car.id], 1.1, 1.2, 1, 0.45, g);
			}
			// Rail scrape: sparks sell the speed the guard rail is eating. Spawned just INSIDE
			// the rail — a scraping car sits at HALF - CELL, so anything pushed outward is
			// buried in the wall solid and depth-tested away — and with a small upward pop,
			// because gravity pins a downward spark to the floor where the trail glow eats it.
			if (car.scraping) {
				const ox = Math.abs(pose.x) > Math.abs(pose.z) ? Math.sign(pose.x) : 0;
				const oz = ox === 0 ? Math.sign(pose.z) : 0;
				// Streaked along the wall tangent: at 2 sprites with no tangential velocity the
				// whole event was a 10 px smudge pooling under the trail glow.
				const tv = -car.speed * (0.25 + Math.random() * 0.35);
				if ((frameNo & 1) === 0) {
					spawn(burst, pose.x - ox * 0.2, pose.z - oz * 0.2, 0xFFD9A0, 2.6, 1.8, 2, 0.4, 0.3,
						Math.cos(pose.heading) * tv, Math.sin(pose.heading) * tv);
				}
				if (car.id === s.hero) {
					wallFlare = ox > 0 ? 0 : ox < 0 ? 1 : oz > 0 ? 2 : 3;
					wallFlareK = 1;
					setShake(0.12, 0.10); // a continuous buzz: losing speed to a wall must cost something
				}
			}
		}
		// Proximity ramp on the nearest rail, so the boundary lights up BEFORE it is hit.
		if (hero.alive && wallFlareK < 1) {
			const ax = Math.abs(pp.x), az = Math.abs(pp.z);
			const near = ax > az ? ax : az;
			if (near > HALF - 8) {
				wallFlare = ax > az ? (pp.x > 0 ? 0 : 1) : (pp.z > 0 ? 2 : 3);
				wallFlareK = (near - (HALF - 8)) / 8 * 0.45;
			}
		}
		scrapeGlow.visible = wallFlareK > 0;
		if (wallFlareK > 0) {
			// Measured by rendering the same scrape frame twice, sprite on vs off, and diffing.
			// The response is wildly super-linear — the sprite's peak delta is only ~65, so most of
			// it sits a few counts above the visibility floor and 0.34 -> 0.28 cost HALF the lit
			// area. Peak 0.34 touches 8.4% of the car's pixels and adds 15 near-white ones, the
			// same as the occluded build it replaced, so there is nothing here to buy safety from.
			scrapeGlow.material.opacity = 0.10 + 0.24 * wallFlareK;
			const s0 = 3.2 + 3.0 * wallFlareK;
			scrapeGlow.scale.set(s0, s0 * 0.6, 1);
			// Trailing the contact point: centred on the car the flare just clipped the paintwork
			// white, and sparks stream backwards anyway.
			// y stays 1.0: raising it to 1.45 changed the lit pixel count by 4%, so it buys nothing.
			const bx = pp.x - Math.cos(pp.heading) * 2.4, bz = pp.z - Math.sin(pp.heading) * 2.4;
			if (wallFlare < 2) scrapeGlow.position.set((wallFlare === 0 ? 1 : -1) * (HALF - 0.05), 1.0, bz);
			else scrapeGlow.position.set(bx, 1.0, (wallFlare === 2 ? 1 : -1) * (HALF - 0.05));
		}
		heroRing.visible = hero.alive;
		riskRing.visible = hero.alive && risk > 0.02;
		if (hero.alive) {
			heroRing.position.set(pp.x, 0.045, pp.z);
			// The inner ring never leaves the hero's own hue — it is the ownership cue. Risk is the
			// outer ring, in the complement of the ground being crossed, so it cannot blend into it.
			const beat = 0.5 + 0.5 * Math.sin(fxTime * 9);
			const mat = heroRing.material as THREE.MeshBasicMaterial;
			mat.color.setHex(PALETTE[s.hero]);
			mat.opacity = 0.55 + risk * (0.15 + 0.3 * beat);
			heroRing.scale.setScalar(1 + risk * 0.12 * beat);
			if (riskRing.visible) {
				riskRing.position.set(pp.x, 0.046, pp.z);
				const rm = riskRing.material as THREE.MeshBasicMaterial;
				rm.color.setRGB(1 - foeCol.r, 1 - foeCol.g, 1 - foeCol.b);
				rm.opacity = risk * (0.35 + 0.45 * beat);
				riskRing.scale.setScalar(1 + risk * 0.22 * beat);
			}
		}

		stepPool(burst, fxDt);
		stepPool(smoke, fxDt);

		// Chase cam: ease the follow heading toward the car, then sit behind + above it.
		// Follow where the car TRAVELS (vh), not where its nose points. Locked to the nose, the
		// engine's slip angle — a couple of degrees gripped, 40 drifting — was invisible: the car stayed
		// square on screen and only the world slid, so the one body motion left to see was the
		// roll. Behind the velocity vector, the nose visibly swings out and the drift reads.
		camHeading += angleDiff(hero.vh, camHeading) * Math.min(1, fxDt * CAM_EASE);
		const cdx = Math.cos(camHeading), cdz = Math.sin(camHeading);
		// A DirectionalLight only uses position - target, so every car ahead of the hero picks
		// up the same cyan edge — which is exactly the separation a crossing rival needs.
		rim.position.set(pp.x + cdx * 26, 11, pp.z + cdz * 26);
		rimTarget.position.set(pp.x, 0.6, pp.z);
		let sx = 0, sy = 0, sz = 0;
		if (shake.t > 0) {
			shake.t -= fxDt;
			const m = shake.mag * Math.max(0, shake.t / shake.dur);
			sx = (Math.random() * 2 - 1) * m;
			sy = (Math.random() * 2 - 1) * m * 0.5;
			sz = (Math.random() * 2 - 1) * m;
		}
		// Speed opens the lens and brakes close it back in — the road rushes without the car
		// actually moving any faster, which is the cheapest sense of speed there is.
		const t = Math.max(-0.4, Math.min(1, (heroCar(s).speed - CFG.cruise) / (CFG.maxSpeed - CFG.cruise)));
		fx.rush = Math.max(0, t); // read by the CSS vignette on the HUD tick
		fov += (FOV_BASE + FOV_KICK * t - fov) * Math.min(1, fxDt * 3);
		camera.fov = fov;
		camera.updateProjectionMatrix();
		camera.position.set(pp.x - cdx * CAM_DIST + sx, CAM_HEIGHT + sy, pp.z - cdz * CAM_DIST + sz);
		camera.lookAt(pp.x + cdx * CAM_LOOK, CAM_LOOK_Y, pp.z + cdz * CAM_LOOK);
		camera.updateMatrixWorld();
		placeChevrons(s, pp.x, pp.z, s.hero);
		renderer.render(scene, camera);

		ledTex.offset.x -= dtSec * 0.08;
		ledAcc += dtSec;
		if (ledAcc >= 0.14) { ledAcc = 0; repaintLed(s); }
		// 25 Hz: the overview cannot visibly stutter at that rate, and the frames it skips
		// pay for the per-capture territory repaint.
		miniAcc += dtSec;
		if (miniAcc >= 0.04) { miniAcc = 0; drawMinimap(s); }
	};

	const reset = () => {
		trailC.ctx.clearRect(0, 0, TRAIL_W, TRAIL_W);
		decal.ctx.clearRect(0, 0, GRID, GRID);
		lastStroked.fill(0);
		decalOk.fill(0);
		prevSpeed.fill(0);
		trailTex.needsUpdate = true;
		decalTex.needsUpdate = true;
		burst.live = 0; smoke.live = 0;
		burst.geo.setDrawRange(0, 0); smoke.geo.setDrawRange(0, 0);
		for (const r of rings) { r.life = 0; r.delay = 0; r.mesh.visible = false; }
		decalFadeAcc = 0;
		miniAcc = 0;
		ledAcc = 0;
		shake.t = 0; shake.mag = 0; shake.dur = 0.35;
		hitStop = 0;
		snapFx.t = 0;
		capFx.t = 0;
		decalInk = 0;
		decalMesh.visible = false;
		trailSnapN.fill(0);
		for (const c of chevrons) c.visible = false;
		frameNo = 0;
		fxTime = 0;
		fx.rush = 0;
		fx.risk = 0;
		fov = FOV_BASE;
		camHeading = heroCar(state).vh;
		paintTerritory(false); // also refills panel96 and raises lightDirty
		lightC.ctx.clearRect(0, 0, LIGHT_N, LIGHT_N);
		lightTex.needsUpdate = true;
		repaintLed(state);
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
		baseTex.dispose(); covTex.dispose(); decalTex.dispose(); trailTex.dispose(); lightTex.dispose(); grainTex.dispose();
		blobTex.dispose(); glowTex.dispose(); roundelTex.dispose();
		rampTex.dispose(); ledTex.dispose(); skyTex.dispose(); envTex.dispose(); chevTex.dispose();
		wallHazTex.dispose(); capHazTex.dispose();
		for (const c of chevrons) { c.material.dispose(); camera.remove(c); }
	};

	return { fx, frame, reset, setMinimap, snapshotMap, resize, dispose };
}
