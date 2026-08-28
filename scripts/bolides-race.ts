/* Throwaway: does the 50% win condition ever fire, and how long does a run last?
   Runs headless sims per difficulty with an idle player (bots race each other). */
import { createGame, stepGame, pct, CFG, DIFFS, NAMES } from '../src/games/bolides/engine';

const DT = 1 / 60;
const CAP = 60 * 10; // hard stop; CFG.timeLimit should always fire first

for (let diff = 0; diff < DIFFS.length; diff++) {
	const times: number[] = [];
	const finals: number[] = [];
	let byTime = 0;
	for (let seed = 1; seed <= 40; seed++) {
		const s = createGame(seed, diff);
		while (!s.over && s.clock < CAP) stepGame(s, 0, 0, DT);
		if (s.overByTime) byTime++;
		else times.push(s.clock);
		finals.push(pct(s, s.winner));
	}
	times.sort((a, b) => a - b);
	finals.sort((a, b) => a - b);
	const med = times.length ? times[times.length >> 1] : NaN;
	console.log(
		`${DIFFS[diff].label.padEnd(10)} by ${CFG.winPct}% ${String(40 - byTime).padStart(2)}/40` +
		`  (median ${times.length ? `${med.toFixed(0)}s` : '—'})  on the clock ${byTime}/40` +
		`  winner share median ${finals[20].toFixed(1)}%  min ${finals[0].toFixed(1)}%`,
	);
}
console.log(`threshold ${CFG.winPct}% · limit ${CFG.timeLimit}s`);
