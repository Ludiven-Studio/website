/* The end of a daily run, inside a game's result card. There is no "Rejouer" left
   at that point, so without this the card is a dead end: same closing line and the
   same one way out in every game. */

import type { ReactNode } from 'react';

export default function DailyDone({ children }: { children?: ReactNode }): ReactNode {
	return (
		<div className="dd">
			<style>{CSS}</style>
			<p className="dd-note">{children ?? <>Défi du jour terminé — reviens demain&nbsp;!</>}</p>
			<a className="dd-back" href="/jeux/defi/">🗓 Tous les défis</a>
		</div>
	);
}

const CSS = `
.dd { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.dd-note { color: var(--gray-300); font-size: 13px; line-height: 1.5; margin: 0; text-align: center; }
.dd-back {
  border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 8px 18px;
  text-decoration: none; white-space: nowrap;
}
.dd-back:hover, .dd-back:focus-visible { border-color: var(--accent-regular); color: var(--accent-regular); }
`;
