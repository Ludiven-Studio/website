import { useState, useEffect, useCallback } from 'react';
import {
	balance,
	rewardState,
	claimDailyReward,
	BLASONS,
	buyBlason,
	equipBlason,
	equippedBlason,
	owns,
	type Blason,
} from '../lib/wallet';

/* Local cocottes wallet UI on /jeux: balance, escalating daily-return reward, and the
   blason shop (buy + equip). All device-local — see lib/wallet.ts. */

export default function CocottesPanel() {
	const [bal, setBal] = useState(0);
	const [reward, setReward] = useState<{ canClaim: boolean; playedToday: boolean; amount: number }>({
		canClaim: false,
		playedToday: false,
		amount: 5,
	});
	const [equipped, setEquipped] = useState<string | null>(null);
	const [shopOpen, setShopOpen] = useState(false);
	const [msg, setMsg] = useState('');

	const refresh = useCallback(() => {
		setBal(balance());
		setReward(rewardState());
		setEquipped(equippedBlason()?.id ?? null);
	}, []);

	useEffect(() => {
		refresh();
		const onVis = () => { if (!document.hidden) refresh(); };
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('pageshow', refresh);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('pageshow', refresh);
		};
	}, [refresh]);

	const claim = () => {
		const g = claimDailyReward();
		if (g > 0) {
			setMsg(`+${g} 🐔 récompense du jour !`);
			refresh();
			setTimeout(() => setMsg(''), 2200);
		}
	};
	const buy = (b: Blason) => {
		if (buyBlason(b.id)) {
			equipBlason(b.id);
			setMsg(`${b.emoji} ${b.label} débloqué et équipé !`);
			refresh();
			setTimeout(() => setMsg(''), 2200);
		}
	};
	const toggleEquip = (id: string) => {
		equipBlason(equipped === id ? null : id);
		refresh();
	};

	return (
		<div className="cp-root">
			<style>{CSS}</style>
			<div className="cp-bar">
				<span className="cp-bal" title="Tes cocottes">🐔 {bal}</span>
				{reward.canClaim ? (
					<button className="cp-claim" onClick={claim}>🎁 Récompense du jour · +{reward.amount}</button>
				) : reward.playedToday ? (
					<span className="cp-note">✓ Récompense du jour prise</span>
				) : (
					<span className="cp-note">Joue un jeu pour ta récompense (+{reward.amount} 🐔)</span>
				)}
				<button className="cp-shopbtn" onClick={() => setShopOpen((o) => !o)} aria-expanded={shopOpen}>
					🎖️ Blasons {shopOpen ? '▲' : '▼'}
				</button>
			</div>

			{msg && <div className="cp-msg">{msg}</div>}

			{shopOpen && (
				<div className="cp-shop">
					{BLASONS.map((b) => {
						const has = owns(b.id);
						const eq = equipped === b.id;
						return (
							<div key={b.id} className={`cp-item ${eq ? 'equipped' : ''}`}>
								<span className="cp-emoji" aria-hidden="true">{b.emoji}</span>
								<span className="cp-label">{b.label}</span>
								{has ? (
									<button className={`cp-eq ${eq ? 'on' : ''}`} onClick={() => toggleEquip(b.id)}>
										{eq ? 'Équipé ✓' : 'Équiper'}
									</button>
								) : (
									<button className="cp-buy" disabled={bal < b.price} onClick={() => buy(b)}>
										{b.price} 🐔
									</button>
								)}
							</div>
						);
					})}
					<p className="cp-shop-note">Les blasons sont décoratifs — ils s'affichent à côté de ton pseudo.</p>
				</div>
			)}
		</div>
	);
}

const CSS = `
.cp-root { width: 100%; max-width: 640px; margin: 0 auto; font-family: var(--font-body); }
.cp-bar {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
  background: var(--gray-999); border: 1.5px solid var(--gray-800); border-radius: 999px;
  padding: 8px 14px;
}
.cp-bal { font-weight: 800; font-size: 15px; color: var(--gray-0); font-variant-numeric: tabular-nums; }
.cp-claim {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 8px 16px; cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.cp-claim:hover { filter: brightness(1.06); }
.cp-note { color: var(--gray-300); font-size: 12.5px; font-weight: 500; }
.cp-shopbtn {
  border: 1.5px solid var(--gray-700); background: transparent; color: var(--gray-100);
  font: inherit; font-weight: 700; font-size: 13px; border-radius: 999px; padding: 7px 14px; cursor: pointer;
}
.cp-shopbtn:hover { border-color: var(--accent-regular); color: var(--accent-regular); }
.cp-msg { text-align: center; margin-top: 8px; font-weight: 700; font-size: 13.5px; color: var(--accent-regular); }
.cp-shop {
  margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px;
  background: var(--gray-999); border: 1px solid var(--gray-800); border-radius: 16px; padding: 12px;
}
.cp-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 12px;
  background: var(--gray-900); border: 1px solid var(--gray-800);
}
.cp-item.equipped { border-color: var(--accent-regular); }
.cp-emoji { font-size: 20px; line-height: 1; }
.cp-label { flex: 1; font-size: 13px; font-weight: 600; color: var(--gray-100); }
.cp-buy, .cp-eq {
  border: none; font: inherit; font-weight: 700; font-size: 12px; border-radius: 999px; padding: 5px 11px; cursor: pointer;
  background: var(--accent-regular); color: var(--accent-text-over); white-space: nowrap;
}
.cp-buy:disabled { opacity: 0.4; cursor: not-allowed; }
.cp-eq { background: var(--gray-700); color: var(--gray-0); }
.cp-eq.on { background: transparent; border: 1.5px solid var(--accent-regular); color: var(--accent-regular); }
.cp-shop-note { grid-column: 1 / -1; margin: 2px 0 0; text-align: center; color: var(--gray-400); font-size: 11.5px; }
`;
