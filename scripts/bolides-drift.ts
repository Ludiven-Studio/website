/*
 * Cornering feel, measured instead of eyeballed: how far the car's LINE has come
 * round after a steer input, gripped vs drifting.
 *   npx tsx scripts/bolides-drift.ts
 * The control row applies full lock without breaking traction, so the drift's own
 * contribution is visible next to the same input.
 */
import { createGame, stepGame, CFG, angleDiff } from '../src/games/bolides/engine';

const DT = 1 / 60;
const MARKS = [0.8, 1.5, 2.2];
const deg = (r: number) => (r * 180) / Math.PI;

/** Drive the player with a steer input that reaches full lock in `rise` seconds. */
function corner(rise: number) {
	const s = createGame(7, 1);
	const me = s.cars[0];
	me.x = 0; me.z = 0; me.heading = 0; me.vh = 0; me.px = 0; me.pz = 0;
	let t = 0, maxSlip = 0, drift = 0, turned = 0;
	const at: Record<number, number> = {};
	for (let i = 0; i < 150; i++) {
		const steer = rise <= 0 ? 1 : Math.min(1, t / rise);
		const before = me.vh;
		stepGame(s, steer, 0, DT);
		t += DT;
		turned += Math.abs(angleDiff(me.vh, before));
		maxSlip = Math.max(maxSlip, Math.abs(angleDiff(me.heading, me.vh)));
		if (me.drifting) drift += DT;
		for (const mark of MARKS) if (at[mark] === undefined && t >= mark) at[mark] = turned;
	}
	return { maxSlip: deg(maxSlip), drift, at };
}

const show = (label: string, r: ReturnType<typeof corner>) =>
	console.log(
		`${label.padEnd(22)} slip max ${r.maxSlip.toFixed(0).padStart(2)} deg  drift ${r.drift.toFixed(2)}s  line turned` +
		MARKS.map((m) => ` ${deg(r.at[m]).toFixed(0).padStart(3)} deg @${m}s`).join(''),
	);

console.log(`grip radius ${CFG.turnRadius} u at top speed, load limits ${CFG.gripPaint} paint / ${CFG.gripBare} bare, boost ${CFG.driftBoost}`);
show('slow sweep (1.0 s)', corner(1.0));
show('normal sweep (0.5 s)', corner(0.5));
show('flick (0.12 s)', corner(0.12));
show('full lock, frame 0', corner(0));
