import { describe, it, expect, vi } from 'vitest';
import { makeClockPauser } from './usePlayClock';

/* The chrono epoch drifts forward by however long the game was off screen, so
   `Date.now() - startRef.current` only ever counts time spent actually playing. */
describe('play clock pauser', () => {
	const elapsed = (ref: { current: number }, now: number) => now - ref.current;

	it('does not bill the time spent hidden', () => {
		const ref = { current: 0 };
		const clock = makeClockPauser(ref);

		expect(elapsed(ref, 5_000)).toBe(5_000); // played 5 s
		clock.pause(5_000);
		clock.resume(65_000); // hidden for a minute
		expect(elapsed(ref, 65_000)).toBe(5_000);

		expect(elapsed(ref, 68_000)).toBe(8_000); // and it keeps counting after
	});

	it('adds up over several pauses', () => {
		const ref = { current: 0 };
		const clock = makeClockPauser(ref);

		clock.pause(1_000);
		clock.resume(11_000);
		clock.pause(13_000);
		clock.resume(43_000);

		expect(elapsed(ref, 43_000)).toBe(3_000); // 1 s + 2 s of real play
	});

	it('ignores a second pause, so pagehide after visibilitychange is harmless', () => {
		const ref = { current: 0 };
		const clock = makeClockPauser(ref);

		clock.pause(2_000);
		clock.pause(9_000); // must not move the pause start forward
		clock.resume(12_000);

		expect(elapsed(ref, 12_000)).toBe(2_000);
	});

	it('resuming without a pause changes nothing', () => {
		const ref = { current: 0 };
		const clock = makeClockPauser(ref);

		clock.resume(7_000);
		expect(elapsed(ref, 7_000)).toBe(7_000);
		expect(clock.paused).toBe(false);
	});

	it('reports the play time to the checkpoint, not the wall clock', () => {
		const ref = { current: 0 };
		const onPause = vi.fn();
		const clock = makeClockPauser(ref, onPause);

		clock.pause(4_000);
		clock.resume(64_000);
		clock.pause(70_000);

		expect(onPause.mock.calls).toEqual([[4_000], [10_000]]);
	});
});
