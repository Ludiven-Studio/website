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
	// The event NAME carries the game and (when provided) the mode — and for a levels
	// run the level number, e.g. "mine:level_007:game_won" — so Umami's event list is
	// readable at a glance; the properties keep game / event / mode / level separate for
	// filtering and aggregation.
	const seg = data.mode === 'levels' && typeof data.level === 'number'
		? `level_${String(data.level).padStart(3, '0')}`
		: data.mode;
	const name = seg ? `${gameId}:${seg}:${event}` : `${gameId}:${event}`;
	umami.track(name, { game: gameId, event, ...data });
}
