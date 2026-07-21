// Safe wrapper around Umami's custom-event API. No-op when Umami isn't loaded
// (e.g. local dev, or domain excluded via data-domains).
type GameEvent = 'game_started' | 'game_won' | 'game_over' | 'hint_used' | 'solution_shown' | 'daily_played' | 'daily_done' | 'discovery';

/** Play mode, so free / daily / levels runs can be told apart in Umami. */
export type GameMode = 'free' | 'daily' | 'levels';

export function trackGame(
	gameId: string,
	event: GameEvent,
	data: Record<string, unknown> & { mode?: GameMode } = {},
): void {
	if (typeof window === 'undefined') return;
	const umami = (window as unknown as { umami?: { track: (e: string, d?: unknown) => void } }).umami;
	if (!umami) return;
	// The event NAME carries the game and (when provided) the mode — e.g.
	// "mine:levels:game_won" — so Umami's event list is readable at a glance; the
	// properties keep game / event / mode separate for filtering and aggregation.
	const name = data.mode ? `${gameId}:${data.mode}:${event}` : `${gameId}:${event}`;
	umami.track(name, { game: gameId, event, ...data });
}
