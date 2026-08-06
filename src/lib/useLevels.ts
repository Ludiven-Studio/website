// Shared levels-mode lifecycle for any game. Owns progression load, the current
// level, star grading, and the best-retained submit — so a game only has to:
//   const lv = useLevels(gameId, myPlan);
//   ... ModeToggle showLevels levelsActive={lv.active} onLevels={lv.enter}
//   ... when lv.menu: <LevelSelect progress={lv.progress} onPick={l => startLevel(l)} />
//   startLevel(l): const cfg = lv.play(l); <build the puzzle/run from cfg>
//   on solve/lose: lv.finish({ won, score, stat?, raw? })
//   when lv.done: <LevelOutcome ... /> (next/retry/menu)

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProgression, submitLevel, type GameProgress, type LevelPlan, type LevelResult } from './progression';
import { earn } from './wallet';

export type LevelPhase = 'off' | 'menu' | 'playing' | 'done';

export interface UseLevels<Cfg> {
	phase: LevelPhase;
	active: boolean; // levels mode is on (menu | playing | done)
	/** True until the landing is decided. `active` is false while resume() loads progression,
	    so a menu gated on `!active` alone flashes for ~0.8s before the level opens. */
	booting: boolean;
	menu: boolean;
	playing: boolean;
	done: boolean;
	progress: GameProgress;
	level: number;
	stars: number; // 0-3, valid once done
	won: boolean;
	enter: () => void; // switch into levels mode, load progression, show the grid
	/** Load progression, then return the next level to auto-start — or null (all cleared →
	    grid shown). For "open on the current level" landing. */
	resume: () => Promise<number | null>;
	exit: () => void; // leave levels mode (back to free/daily)
	play: (level: number) => Cfg; // start a level; returns its difficulty config
	backToMenu: () => void;
	finish: (r: LevelResult) => void; // grade + record a finished run (once)
	replay: () => Cfg; // replay the current level
	next: () => Cfg | null; // play the next level (null if last)
}

export function useLevels<Cfg>(gameId: string, plan: LevelPlan<Cfg>): UseLevels<Cfg> {
	const [phase, setPhase] = useState<LevelPhase>('off');
	const [progress, setProgress] = useState<GameProgress>({ stars: {}, best: {} });
	const [level, setLevel] = useState(1);
	const [stars, setStars] = useState(0);
	const [won, setWon] = useState(false);
	const [booting, setBooting] = useState(true);
	const submittedRef = useRef(false);
	const resumedRef = useRef(false);

	// Games that deep-link straight to the daily never call resume(), so nothing would ever
	// clear the flag. They settle on the next tick instead: resume() runs in a mount effect,
	// so by the time this fires we know whether one is coming.
	useEffect(() => {
		const t = setTimeout(() => { if (!resumedRef.current) setBooting(false); }, 0);
		return () => clearTimeout(t);
	}, []);

	const enter = useCallback(() => {
		setBooting(false);
		setPhase('menu');
		setStars(0);
		setWon(false);
		void getProgression(gameId).then((p) => setProgress({ stars: { ...p.stars }, best: { ...p.best }, count: plan.count }));
	}, [gameId, plan]);

	const exit = useCallback(() => setPhase('off'), []);
	const backToMenu = useCallback(() => setPhase('menu'), []);

	const resume = useCallback(async (): Promise<number | null> => {
		resumedRef.current = true;
		let p;
		try {
			p = await getProgression(gameId);
		} catch {
			setBooting(false); // progression unreachable → fall back to the game's own menu
			return null;
		}
		setProgress({ stars: { ...p.stars }, best: { ...p.best }, count: plan.count });
		const cleared = Object.keys(p.stars).map(Number).filter((n) => p.stars[n] >= 1);
		const maxCleared = cleared.length ? Math.max(...cleared) : 0;
		if (maxCleared >= plan.count) { setPhase('menu'); setBooting(false); return null; } // all cleared → grid
		return maxCleared + 1; // next unlocked level → caller auto-starts it, and play() clears booting
	}, [gameId, plan.count]);

	const play = useCallback((lvl: number): Cfg => {
		submittedRef.current = false;
		setBooting(false); // batched with setPhase below, so the menu never gets a frame
		setLevel(lvl);
		setStars(0);
		setWon(false);
		setPhase('playing');
		return plan.config(lvl);
	}, [plan]);

	const finish = useCallback((r: LevelResult) => {
		if (submittedRef.current) return;
		submittedRef.current = true;
		const s = r.won ? plan.stars(level, r) : 0;
		setWon(r.won);
		setStars(s);
		setPhase('done');
		if (s >= 1) {
			const gained = Math.max(0, s - (progress.stars[level] ?? 0));
			if (gained > 0) earn(gained * 3); // cocottes for newly-earned stars
			void submitLevel({
				gameId, level, stars: s as 1 | 2 | 3, score: Math.round(r.score),
				metricIsTime: plan.metric === 'time', rawData: r.raw,
			}).then((p) => setProgress({ stars: { ...p.stars }, best: { ...p.best }, count: plan.count }));
		}
	}, [gameId, level, plan, progress]);

	const replay = useCallback((): Cfg => play(level), [play, level]);
	const next = useCallback((): Cfg | null => (level < plan.count ? play(level + 1) : null), [play, level, plan.count]);

	return {
		phase, active: phase !== 'off', booting, menu: phase === 'menu', playing: phase === 'playing', done: phase === 'done',
		progress, level, stars, won, enter, exit, play, backToMenu, finish, replay, next, resume,
	};
}
