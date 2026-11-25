// The /tests/ hub's order: newest build first; cards without a date (a fixed APK, a manifest that failed) keep the
// list's order after them.
export function newestFirst<T extends { date: number | null; order: number }>(cards: T[]): T[] {
	return [...cards].sort((a, b) => {
		if (a.date !== null && b.date !== null) return b.date - a.date || a.order - b.order;
		if (a.date !== null) return -1;
		if (b.date !== null) return 1;
		return a.order - b.order;
	});
}
