/* Shared large segmented toggle: 🎲 Mode libre / 🏆 Défi du jour, plus an
   optional 🎯 Niveaux segment (levels/progression mode). Used by every game
   island to keep the mode switch visually distinct from game-specific buttons.
   Deep link: ?defi (or ?mode=defi / ?mode=daily) auto-opens the daily challenge. */

import { useEffect, useRef } from 'react';

interface Props {
	daily: boolean;
	onFree: () => void;
	onDaily: () => void;
	/** Opt-in third segment. When set, `levelsActive` and `onLevels` are required. */
	showLevels?: boolean;
	levelsActive?: boolean;
	onLevels?: () => void;
	/** Opt-in online segment (e.g. billard multiplayer). When set, `onlineActive` + `onOnline` required. */
	showOnline?: boolean;
	onlineActive?: boolean;
	onOnline?: () => void;
}

export default function ModeToggle({ daily, onFree, onDaily, showLevels, levelsActive, onLevels, showOnline, onlineActive, onOnline }: Props) {
	const onDailyRef = useRef(onDaily);
	onDailyRef.current = onDaily;

	// On mount, honor a daily deep link. Deferred so it runs AFTER the game's own
	// mount init (which arms free mode) — otherwise that would override it.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		let params: URLSearchParams;
		try {
			params = new URLSearchParams(window.location.search);
		} catch {
			return;
		}
		const wantsDaily =
			params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily';
		if (!wantsDaily) return;
		const id = setTimeout(() => onDailyRef.current(), 0);
		return () => clearTimeout(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// With the third segment the label 'Mode libre' is too wide on phones — shorten.
	const freeActive = !daily && !levelsActive && !onlineActive;
	return (
		<div className={`dt-toggle ${showLevels ? 'three' : ''} ${showOnline ? 'four' : ''}`} role="tablist" aria-label="Mode">
			<style>{CSS}</style>
			{showLevels && (
				<button
					role="tab"
					aria-selected={!!levelsActive && !onlineActive}
					className={`dt-seg ${levelsActive && !onlineActive ? 'active' : ''}`}
					onClick={onLevels}
				>
					🎯 Niveaux
				</button>
			)}
			<button
				role="tab"
				aria-selected={daily && !levelsActive && !onlineActive}
				className={`dt-seg ${daily && !levelsActive && !onlineActive ? 'active' : ''}`}
				onClick={onDaily}
			>
				🏆 {showLevels ? 'Défi' : 'Défi du jour'}
			</button>
			<button
				role="tab"
				aria-selected={freeActive}
				className={`dt-seg ${freeActive ? 'active' : ''}`}
				onClick={onFree}
			>
				🎲 {showLevels ? 'Libre' : 'Mode libre'}
			</button>
			{showOnline && (
				<button
					role="tab"
					aria-selected={!!onlineActive}
					className={`dt-seg ${onlineActive ? 'active' : ''}`}
					onClick={onOnline}
				>
					👥 En ligne
				</button>
			)}
		</div>
	);
}

const CSS = `
.dt-toggle {
  width: 100%;
  max-width: 380px;
  margin: 0 auto 1rem;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--gray-999);
  border: 1.5px solid var(--gray-700);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
}
.dt-toggle.three { max-width: 440px; }
.dt-toggle.four { max-width: 520px; }
.dt-toggle.four .dt-seg { font-size: 12.5px; padding: 10px 3px; }
.dt-seg {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 700;
  font-size: 14.5px;
  padding: 11px 8px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.dt-toggle.three .dt-seg { font-size: 13.5px; padding: 11px 4px; }
.dt-seg.active {
  background: var(--accent-regular);
  color: var(--accent-text-over);
}
.dt-seg:not(.active):hover { color: var(--gray-0); }
@media (prefers-reduced-motion: reduce) { .dt-seg { transition: none; } }
`;
