// Shared levels-mode lifecycle for any game. Owns progression load, the current
// level, star grading, and the best-retained submit — so a game only has to:
//   const lv = useLevels(gameId, myPlan);
//   ... ModeToggle showLevels levelsActive={lv.active} onLevels={lv.enter}
//   ... when lv.menu: <LevelSelect progress={lv.progress} onPick={l => startLevel(l)} />
//   startLevel(l): const cfg = lv.play(l); <build the puzzle/run from cfg>
//   on solve/lose: lv.finish({ won, score, stat?, raw? })
//   when lv.done: <LevelOutcome ... /> (next/retry/menu)

import { useCallback, useRef, useState } from 'react';
import { getProgression, submitLevel, type GameProgress, type LevelPlan, type LevelResult } from './progression';

export type LevelPhase = 'off' | 'menu' | 'playing' | 'done';

export interface UseLevels<Cfg> {
	phase: LevelPhase;
	active: boolean; // levels mode is on (menu | playing | done)
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
	const submittedRef = useRef(false);

	const enter = useCallback(() => {
		setPhase('menu');
		setStars(0);
		setWon(false);
		void getProgression(gameId).then((p) => setProgress({ stars: { ...p.stars }, best: { ...p.best } }));
	}, [gameId]);

	const exit = useCallback(() => setPhase('off'), []);
	const backToMenu = useCallback(() => setPhase('menu'), []);

	const resume = useCallback(async (): Promise<number | null> => {
		const p = await getProgression(gameId);
		setProgress({ stars: { ...p.stars }, best: { ...p.best } });
		const cleared = Object.keys(p.stars).map(Number).filter((n) => p.stars[n] >= 1);
		const maxCleared = cleared.length ? Math.max(...cleared) : 0;
		if (maxCleared >= plan.count) { setPhase('menu'); return null; } // all cleared → grid
		return maxCleared + 1; // next unlocked level → caller auto-starts it
	}, [gameId, plan.count]);

	const play = useCallback((lvl: number): Cfg => {
		submittedRef.current = false;
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
			void submitLevel({
				gameId, level, stars: s as 1 | 2 | 3, score: Math.round(r.score),
				metricIsTime: plan.metric === 'time', rawData: r.raw,
			}).then((p) => setProgress({ stars: { ...p.stars }, best: { ...p.best } }));
		}
	}, [gameId, level, plan]);

	const replay = useCallback((): Cfg => play(level), [play, level]);
	const next = useCallback((): Cfg | null => (level < plan.count ? play(level + 1) : null), [play, level, plan.count]);

	return {
		phase, active: phase !== 'off', menu: phase === 'menu', playing: phase === 'playing', done: phase === 'done',
		progress, level, stars, won, enter, exit, play, backToMenu, finish, replay, next, resume,
	};
}
