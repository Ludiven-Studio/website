// Zoomed out, pins of one kind closer than a pin's width merge into one with a
// count, at their average position. Screen pixels, so the answer changes with the
// zoom and not with a pan. Mirror of MarkerClusters.cs in the PetanqueMeet app.

export interface ScreenPoint { x: number; y: number; }

/** Greedy and order-stable: each point joins the first cluster whose current
 *  centre is within `radius`, else starts its own. Returns member indices. */
export function clusterPoints(points: readonly ScreenPoint[], radius: number): number[][] {
	const r2 = radius * radius;
	return greedy(points, (dx, dy) => dx * dx + dy * dy <= r2);
}

/** Same greedy pass, for cards of one size anchored alike: a point joins a
 *  cluster when its card would overlap the one at the centre. A tall poster
 *  90 px above another was still half hidden under the round test. */
export function clusterBoxes(points: readonly ScreenPoint[], w: number, h: number): number[][] {
	return greedy(points, (dx, dy) => Math.abs(dx) < w && Math.abs(dy) < h);
}

/** Average of the members' coordinates: where the count pin goes. */
export function centreOf(members: readonly number[], at: (i: number) => { lat: number; lng: number }): { lat: number; lng: number } {
	let lat = 0;
	let lng = 0;
	for (const i of members) {
		const p = at(i);
		lat += p.lat;
		lng += p.lng;
	}
	return { lat: lat / members.length, lng: lng / members.length };
}

function greedy(points: readonly ScreenPoint[], joins: (dx: number, dy: number) => boolean): number[][] {
	const clusters: number[][] = [];
	const centres: ScreenPoint[] = [];
	points.forEach((p, i) => {
		const c = centres.findIndex((q) => joins(p.x - q.x, p.y - q.y));
		if (c < 0) {
			clusters.push([i]);
			centres.push({ x: p.x, y: p.y });
			return;
		}
		clusters[c].push(i);
		// Running mean: the centre moves toward the newcomer.
		const n = clusters[c].length;
		centres[c] = { x: centres[c].x + (p.x - centres[c].x) / n, y: centres[c].y + (p.y - centres[c].y) / n };
	});
	return clusters;
}
