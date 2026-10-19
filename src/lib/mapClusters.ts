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

/** The [right, up] slot, px, that lifts a w×h card standing on `at` above every
 *  game card it would cover: a poster on a game's pitch hid the game. Points in
 *  map pixels, y down; cards stand on their point, centred. Same rule as the app's
 *  MapMarkers.LiftOverGames. */
export function liftOver(
	at: ScreenPoint, slot: readonly [number, number], w: number, h: number,
	games: readonly ScreenPoint[], gw: number, gh: number, gap: number,
): [number, number] {
	const x = at.x + slot[0];
	let bottom = at.y - slot[1];
	// Each pass clears one more card at most: as many passes as cards.
	for (let pass = 0; pass < games.length; pass++) {
		let moved = false;
		for (const g of games) {
			const across = Math.abs(x - g.x) < (w + gw) / 2;
			const along = bottom > g.y - gh && bottom - h < g.y;
			if (!across || !along) continue;
			bottom = g.y - gh - gap;
			moved = true;
		}
		if (!moved) break;
	}
	return [slot[0], at.y - bottom];
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
