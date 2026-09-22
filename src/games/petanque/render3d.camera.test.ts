import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
	verticalFov, topCamera, laneFrame, haloRadius, haloFloorFor, wx, wz,
	aimCamera, zoomWalk, VFOV_MIN, VFOV_MAX,
	elevationForBoard, boardForElevation, ELEV_LOW, ELEV_HIGH,
	ZOOM_DIST, ZOOM_EYE, ZOOM_VFOV, EYE_H,
} from './render3d';
import { MIN_JACK, MAX_JACK } from './rules13';
import { PITCH_W } from './terrain';
import { BOULE_R } from './engine';

describe('field of view', () => {
	it('narrows as the intent narrows, and clamps at both ends', () => {
		expect(verticalFov(74, 1.4)).toBeGreaterThan(verticalFov(44, 1.4));
		expect(verticalFov(4, 1.4)).toBe(VFOV_MIN);
		expect(verticalFov(179, 1.4)).toBe(VFOV_MAX);
	});

	it('never opens wider than the stock value, so a portrait phone is never made worse', () => {
		for (const aspect of [0.42, 0.49, 0.62, 1, 1.33, 1.78, 2.2]) {
			expect(verticalFov(62, aspect)).toBeLessThanOrEqual(VFOV_MAX);
		}
		expect(verticalFov(62, 0.49)).toBe(VFOV_MAX); // a phone keeps exactly today's vertical
	});

	it('a wider canvas needs less vertical field for the same lane width', () => {
		expect(verticalFov(62, 1.78)).toBeLessThan(verticalFov(62, 1.1));
	});
});

describe('halo sizing', () => {
	it('keeps its apparent size when the fov narrows', () => {
		// Same ring, same distance, half the field: the metre radius must shrink to match.
		const wide = haloRadius(10, 58, 0.016, 0.09);
		const tele = haloRadius(10, 34, 0.016, 0.09);
		expect(tele).toBeLessThan(wide);
		expect(tele / wide).toBeCloseTo(Math.tan((34 * Math.PI) / 360) / Math.tan((58 * Math.PI) / 360), 5);
	});

	it('is unchanged at the reference fov', () => {
		expect(haloRadius(10, VFOV_MAX, 0.016, 0.09)).toBeCloseTo(0.16, 6);
		expect(haloRadius(1, VFOV_MAX, 0.016, 0.09)).toBeCloseTo(0.09, 6); // the floor still holds
	});

	/* Holding an apparent size is right for a halo sized by distance, and wrong for a floored one:
	   the boule it rings is a fixed 3.75 cm of world, so at 26 deg the floored ring shrank to
	   exactly the boule radius and vanished into the silhouette. The floor is a world size. */
	it('the floor keeps its ratio to the boule when the fov narrows', () => {
		expect(haloFloorFor(0.09, VFOV_MAX)).toBeCloseTo(0.09, 6);
		const flat = haloRadius(1, ZOOM_VFOV, 0.016, 0.09);
		expect(flat).toBeCloseTo(BOULE_R, 3); // the bug: ring radius == boule radius
		const fixed = haloRadius(1, ZOOM_VFOV, 0.016, haloFloorFor(0.09, ZOOM_VFOV));
		expect(fixed).toBeCloseTo(0.09, 9);
		expect(fixed / BOULE_R).toBeCloseTo(0.09 / BOULE_R, 9);
	});
});

/* The complaint that opened this round was "on n'y voit rien meme sur PC". The answer has to be an
   absolute number, not a relative gain: at full zoom the eye stops a fixed distance from the head
   whatever the deal, so the boule's on-screen size is an identity and can be locked here. */
describe('the zoom makes a boule readable', () => {
	const CANVAS_H = 388; // .pe-root is 620 px wide with a 16/10 wrap. NOT the fullscreen 760.

	/** Slant distance from the zoomed eye to a boule sitting at the head. */
	const eyeToHead = (reach: number, yaw: number, dir: 1 | -1, useWalkDir = true): number => {
		const cam = new THREE.PerspectiveCamera(ZOOM_VFOV, 1.6, 0.05, 220);
		const circle = { x: PITCH_W / 2, y: dir === 1 ? 2 : 13 };
		const focus = { x: circle.x, y: circle.y + dir * reach };
		const walk = zoomWalk(reach, 1);
		const axis = useWalkDir ? { x: 0, y: dir as number } : undefined;
		aimCamera(cam, circle, dir, 0.55, yaw, 2.7, 0, walk, true, axis, ZOOM_EYE);
		return cam.position.distanceTo(new THREE.Vector3(wx(focus.x), BOULE_R, wz(focus.y)));
	};

	const px = (m: number, fov: number) =>
		(BOULE_R / Math.tan((fov * Math.PI) / 360)) * (CANVAS_H / m);

	it('stops the eye a fixed distance from the head, whatever the deal', () => {
		// The ground gap is exactly ZOOM_DIST; the shoulder step and the crouch add the rest.
		const want = Math.hypot(Math.hypot(ZOOM_DIST, 0.55 * 0.55), ZOOM_EYE - BOULE_R);
		for (const dir of [1, -1] as const) {
			for (const reach of [3, 5.5, 8, 10.5]) {
				expect(eyeToHead(reach, 0, dir), `dir ${dir} reach ${reach}`).toBeCloseTo(want, 9);
			}
		}
	});

	it('a boule at the head is at least 30 px across on the default canvas', () => {
		for (const yaw of [0, 0.21, 0.42, -0.42]) {
			expect(px(eyeToHead(8, yaw, 1), ZOOM_VFOV), `yaw ${yaw}`).toBeGreaterThanOrEqual(30);
		}
		// The baseline it replaces, for the record: 8 m out in the stock field is a speck.
		expect(px(8, verticalFov(62, 1.6))).toBeLessThan(6);
	});

	it('the feet walk to the head, not along the camera heading', () => {
		// A yaw at its limit leaves metres of lateral error at 8 m, and the px floor collapses.
		expect(eyeToHead(8, 0.42, 1, false)).toBeGreaterThan(eyeToHead(8, 0.42, 1) * 1.8);
		expect(px(eyeToHead(8, 0.42, 1, false), ZOOM_VFOV)).toBeLessThan(20);
	});

	it('at zoom 0 the pose is the one that shipped', () => {
		const before = new THREE.PerspectiveCamera(41, 1.6, 0.05, 220);
		const after = before.clone();
		const circle = { x: PITCH_W / 2, y: 2 };
		aimCamera(before, circle, 1, 0.55, 0.2, 2.7, 0, 0, true);
		aimCamera(after, circle, 1, 0.55, 0.2, 2.7, 0, zoomWalk(8, 0), true, { x: 0, y: 1 }, EYE_H);
		expect(after.position.distanceTo(before.position)).toBeLessThan(1e-12);
	});
});

/* The bug this closes: the player threw an illegal jack, the overview camera followed it off the
   pitch, and the legal window to place it in was behind the eye. Framing is asked as a number. */
describe('the top view frames the legal jack window', () => {
	const project = (cam: THREE.PerspectiveCamera, x: number, y: number): THREE.Vector3 => {
		cam.updateMatrixWorld(true);
		cam.updateProjectionMatrix();
		return new THREE.Vector3(wx(x), 0, wz(y)).project(cam);
	};

	for (const dir of [1, -1] as const) {
		for (const aspect of [0.49, 1.33, 1.78]) {
			it(`dir ${dir} at aspect ${aspect}`, () => {
				const cam = new THREE.PerspectiveCamera(58, aspect, 0.05, 220);
				cam.fov = verticalFov(74, aspect);
				const circle = { x: PITCH_W / 2, y: dir === 1 ? 2 : 13 };
				const { focus, along } = laneFrame(circle, dir, MAX_JACK);
				topCamera(cam, focus, dir, along, PITCH_W + 1, 0);

				// The circle you throw from, and both edges of the window you may place in.
				const probes: [string, number, number][] = [
					['circle', circle.x, circle.y],
					['near ring', circle.x, circle.y + dir * MIN_JACK],
					['far ring', circle.x, circle.y + dir * MAX_JACK],
					['near ring, left', circle.x - MIN_JACK * 0.5, circle.y + dir * MIN_JACK * 0.87],
					['far ring, right', circle.x + 2.5, circle.y + dir * MAX_JACK * 0.95],
				];
				for (const [tag, x, y] of probes) {
					const p = project(cam, x, y);
					expect(Math.abs(p.x), `${tag} x`).toBeLessThan(0.92);
					expect(Math.abs(p.y), `${tag} y`).toBeLessThan(0.92);
				}
			});
		}
	}
});

/* The launch board IS the loft. This pair is the whole mechanic; nobody gets to drift it. */
describe('the board drives the loft', () => {
	it('maps the strip onto the loft range, bottom grazing and top plomb', () => {
		expect(elevationForBoard(0)).toBeCloseTo(ELEV_LOW, 6);
		expect(elevationForBoard(1)).toBeCloseTo(ELEV_HIGH, 6);
		expect(elevationForBoard(-5)).toBeCloseTo(ELEV_LOW, 6);
		expect(elevationForBoard(5)).toBeCloseTo(ELEV_HIGH, 6);
	});

	it('is monotonic, so a nudge of the finger never jumps the throw', () => {
		let prev = elevationForBoard(0);
		for (let i = 1; i <= 40; i++) {
			const e = elevationForBoard(i / 40);
			expect(e).toBeGreaterThan(prev);
			prev = e;
		}
	});

	it('round-trips through the gauge, which reads the board back out of the loft', () => {
		for (let i = 0; i <= 20; i++) {
			expect(boardForElevation(elevationForBoard(i / 20))).toBeCloseTo(i / 20, 6);
		}
		expect(boardForElevation(0)).toBe(0); // a network aim below the range still lands on the bar
		expect(boardForElevation(3)).toBe(1);
	});

	/* A plomb trades carry for bite; it must stay able to reach the nearest legal jack, or the top
	   of the board would just be a dead zone. `v² sin(2e) / g` at MAX_SPEED = 10.5. */
	it('a full plomb still carries to the nearest legal jack', () => {
		const range = (v: number, e: number): number => (v * v * Math.sin(2 * e)) / 9.81;
		expect(range(10.5, ELEV_HIGH)).toBeGreaterThan(MIN_JACK);
		expect(range(10.5, 1.05)).toBeGreaterThan(MAX_JACK - 0.5);
	});
});
