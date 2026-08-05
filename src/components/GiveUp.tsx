/* Shared "see the solution" control for the daily challenge.
   Revealing spends the day's single attempt: the board fills in, no time is ranked
   and the streak does not advance. On a board that can still be played that is a
   real choice, so the button asks once before doing it; on a lost or stuck board
   the run is already over and there is nothing left to confirm. */

import { useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
	onGiveUp: () => void;
	/** The board is already lost or stuck — reveal straight away, no confirmation. */
	over?: boolean;
	/** What giving up costs here. Defaults to the daily wording. */
	warn?: ReactNode;
}

export default function GiveUp({ onGiveUp, over, warn }: Props): ReactNode {
	const [armed, setArmed] = useState(false);

	return (
		<div className="gu">
			<style>{CSS}</style>
			{armed && !over ? (
				<div className="gu-confirm">
					<span className="gu-warn">{warn ?? 'Le défi du jour sera terminé, sans temps classé.'}</span>
					<span className="gu-row">
						<button className="gu-btn gu-danger" onClick={onGiveUp}>Voir la solution</button>
						<button className="gu-btn" onClick={() => setArmed(false)}>Annuler</button>
					</span>
				</div>
			) : (
				<button className="gu-btn" onClick={() => (over ? onGiveUp() : setArmed(true))}>
					{over ? '👁 Voir la solution' : '🏳️ J’abandonne'}
				</button>
			)}
		</div>
	);
}

/** Banner shown once the solution is on screen, in place of a "Rejouer" button. */
export function RevealNote({ children }: { children?: ReactNode }): ReactNode {
	return (
		<div className="gu-note">
			<style>{CSS}</style>
			<strong>👁 Solution affichée</strong>
			<span>{children ?? 'Défi du jour terminé — aucun temps classé. Reviens demain !'}</span>
		</div>
	);
}

const CSS = `
.gu { display: flex; justify-content: center; margin-top: 0.75rem; }
.gu-confirm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.gu-warn { font-size: 13.5px; color: var(--gray-400); text-align: center; }
.gu-row { display: flex; gap: 8px; }
.gu-btn {
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--gray-300);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  padding: 9px 16px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--theme-transition), background-color var(--theme-transition), border-color var(--theme-transition);
}
.gu-btn:hover { background: var(--gray-800); color: var(--gray-0); }
.gu-danger { border-color: var(--accent-regular); color: var(--accent-regular); }
.gu-danger:hover { background: var(--accent-regular); color: var(--accent-text-over); }
.gu-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 1.5rem;
  text-align: center;
}
.gu-note strong { color: var(--gray-100); }
.gu-note span { font-size: 14px; color: var(--gray-400); }
@media (prefers-reduced-motion: reduce) { .gu-btn { transition: none; } }
`;
