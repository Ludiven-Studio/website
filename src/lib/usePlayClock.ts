import { useEffect } from 'react';
import type { RefObject } from 'react';
import { checkpointDailyClock } from './leaderboard';

/* Stops the chrono while the game is off screen, so a break never costs time.
 *
 * Games all measure time as `Date.now() - startRef.current`, so instead of touching a
 * dozen elapsed formulas we push that epoch forward by the time spent hidden. Leaving
 * the page entirely is handled elsewhere: saveDailyRun stamps elapsedMs and loadDailyRun
 * rebases startedAt from it. */

/** Pure half, kept separate so the pause arithmetic is testable without a DOM. */
export function makeClockPauser(
	startRef: { current: number },
	onPause?: (elapsedMs: number) => void,
) {
	let hiddenAt: number | null = null;
	return {
		pause(now: number): void {
			if (hiddenAt != null) return; // already paused: pagehide can follow visibilitychange
			hiddenAt = now;
			onPause?.(now - startRef.current);
		},
		resume(now: number): void {
			if (hiddenAt == null) return;
			startRef.current += now - hiddenAt;
			hiddenAt = null;
		},
		get paused(): boolean {
			return hiddenAt != null;
		},
	};
}

export function usePlayClock(
	startRef: RefObject<number>,
	running: boolean,
	/** Game id while a daily is in progress, else null — banks the chrono on hide. */
	dailyId: string | null = null,
): void {
	useEffect(() => {
		if (!running) return;
		const clock = makeClockPauser(
			startRef,
			dailyId ? (elapsedMs) => checkpointDailyClock(dailyId, elapsedMs) : undefined,
		);

		const onVisibility = () =>
			document.hidden ? clock.pause(Date.now()) : clock.resume(Date.now());
		const onHide = () => clock.pause(Date.now());

		document.addEventListener('visibilitychange', onVisibility);
		// Safari/iOS can skip visibilitychange when the tab is closed or swiped away.
		window.addEventListener('pagehide', onHide);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', onHide);
			clock.resume(Date.now()); // unmounting while hidden must not bill the pause
		};
	}, [startRef, running, dailyId]);
}
