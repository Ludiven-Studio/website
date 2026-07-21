// Safe wrapper around Umami's custom-event API. No-op when Umami isn't loaded
// (e.g. local dev, or domain excluded via data-domains).
type GameEvent = 'game_started' | 'game_won' | 'game_over' | 'hint_used' | 'solution_shown' | 'daily_played' | 'daily_done' | 'discovery';

export function trackGame(
	gameId: string,
	event: GameEvent,
	data: Record<string, unknown> = {},
): void {
	if (typeof window === 'undefined') return;
	const umami = (window as unknown as { umami?: { track: (e: string, d?: unknown) => void } }).umami;
	if (!umami) return;
	// The event NAME carries the game (e.g. "mine:game_won") so Umami's event list is
	// readable at a glance; the properties keep game + event separate for filtering
	// and cross-game aggregation.
	umami.track(`${gameId}:${event}`, { game: gameId, event, ...data });
}
