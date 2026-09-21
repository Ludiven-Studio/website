import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
	verticalFov, topCamera, laneFrame, haloRadius, elevationForPitch, wx, wz,
	VFOV_MIN, VFOV_MAX, CAM_PITCH_MIN, CAM_PITCH_MAX,
} from './render3d';
import { MIN_JACK, MAX_JACK } from './rules13';
import { PITCH_W } from './terrain';

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

/* The camera pitch IS the loft. This pair is the whole mechanic; nobody gets to drift it. */
describe('pitch drives the loft', () => {
	it('maps the camera pitch range onto the loft range, inverted', () => {
		expect(elevationForPitch(CAM_PITCH_MIN)).toBeCloseTo(0.92, 6); // grazing eye, full lob
		expect(elevationForPitch(CAM_PITCH_MAX)).toBeCloseTo(0.17, 6); // plunging eye, roulette
		expect(elevationForPitch(-5)).toBeCloseTo(0.92, 6);
		expect(elevationForPitch(5)).toBeCloseTo(0.17, 6);
	});

	it('is monotonic, so a nudge of the camera never jumps the throw', () => {
		let prev = elevationForPitch(CAM_PITCH_MIN);
		for (let i = 1; i <= 40; i++) {
			const e = elevationForPitch(CAM_PITCH_MIN + ((CAM_PITCH_MAX - CAM_PITCH_MIN) * i) / 40);
			expect(e).toBeLessThan(prev);
			prev = e;
		}
	});
});
