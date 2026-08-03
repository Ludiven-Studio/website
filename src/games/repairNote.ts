/* Shared wording for the hint button when it repairs the grid instead of advancing it.
   Duplicates are flagged live, but an entry that is simply wrong breaks no rule and stays
   invisible until the puzzle turns out to be dead. The hint clears those cells first. */
export const repairNote = (count: number): string =>
	count === 1
		? 'Une case fausse effacée : la grille redevient juste.'
		: `${count} cases fausses effacées : la grille redevient juste.`;
