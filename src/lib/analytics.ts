// Safe wrapper around Umami's custom-event API. No-op when Umami isn't loaded
// (e.g. local dev, or domain excluded via data-domains).
type GameEvent = 'game_started' | 'game_won' | 'game_over' | 'hint_used' | 'solution_shown';

export function trackGame(
	gameId: string,
	event: GameEvent,
	data: Record<string, unknown> = {},
): void {
	if (typeof window === 'undefined') return;
	(window as unknown as { umami?: { track: (e: string, d?: unknown) => void } }).umami?.track(
		event,
		{ game: gameId, ...data },
	);
}
