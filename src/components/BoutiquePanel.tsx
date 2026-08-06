import { useState } from 'react';
import {
	claimDailyReward, BLASONS, buyBlason, equipBlason, owns,
	buyUnlock, hasUnlock, UNLOCK_PRICE, type Blason,
} from '../lib/wallet';
import { useWallet } from '../lib/useWallet';
import { trackEvent } from '../lib/analytics';

/* The cocottes shop: daily reward, blasons (common + legendary), and the per-game
   Expert packs — a pack unlocks the Expert difficulty and levels 101-200 at once. */

export interface PackGame {
	id: string;
	title: string;
	href: string;
	expert: boolean; // false = levels only (no difficulty selector in that game)
}

export default function BoutiquePanel({ games }: { games: PackGame[] }) {
	const { balance, equipped, reward, unlocked, refresh } = useWallet();
	const [msg, setMsg] = useState('');
	const [filter, setFilter] = useState('');

	const flash = (t: string) => {
		setMsg(t);
		refresh();
		setTimeout(() => setMsg(''), 2400);
	};

	const claim = () => {
		const g = claimDailyReward();
		if (g > 0) {
			trackEvent('cocottes:reward_claim', { amount: g });
			flash(`+${g} 🐔 récompense du jour !`);
		}
	};
	const buy = (b: Blason) => {
		if (buyBlason(b.id)) {
			trackEvent('cocottes:buy_blason', { blason: b.id, price: b.price });
			equipBlason(b.id);
			flash(`${b.emoji} ${b.label} débloqué et équipé !`);
		}
	};
	const toggleEquip = (id: string) => {
		const on = equipped !== id;
		equipBlason(on ? id : null);
		trackEvent('cocottes:equip_blason', { blason: on ? id : 'none' });
		refresh();
	};
	const buyPack = (g: PackGame) => {
		if (buyUnlock(g.id)) {
			trackEvent('cocottes:buy_pack', { game: g.id, price: UNLOCK_PRICE });
			flash(`🔓 Pack Expert — ${g.title} débloqué !`);
		}
	};

	const q = filter.trim().toLowerCase();
	const shown = q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games;
	const blason = (b: Blason) => {
		const has = owns(b.id);
		const eq = equipped === b.id;
		return (
			<div key={b.id} className={`bp-item ${eq ? 'equipped' : ''} ${b.tier === 'legendaire' ? 'legend' : ''}`}>
				<span className="bp-emoji" aria-hidden="true">{b.emoji}</span>
				<span className="bp-label">{b.label}</span>
				{has ? (
					<button className={`bp-eq ${eq ? 'on' : ''}`} onClick={() => toggleEquip(b.id)}>
						{eq ? 'Équipé ✓' : 'Équiper'}
					</button>
				) : (
					<button className="bp-buy" disabled={balance < b.price} onClick={() => buy(b)}>{b.price} 🐔</button>
				)}
			</div>
		);
	};

	return (
		<div className="bp-root">
			<style>{CSS}</style>

			<div className="bp-bar">
				<span className="bp-bal" title="Tes cocottes">🐔 {balance}</span>
				{reward.canClaim ? (
					<button className="bp-claim" onClick={claim}>🎁 Récompense du jour · +{reward.amount}</button>
				) : reward.playedToday ? (
					<span className="bp-note">✓ Récompense du jour prise</span>
				) : (
					<span className="bp-note">Joue un jeu pour ta récompense (+{reward.amount} 🐔)</span>
				)}
			</div>
			{msg && <div className="bp-msg">{msg}</div>}

			<section className="bp-sec">
				<h2>🎖️ Blasons</h2>
				<p className="bp-sub">Décoratifs — ils s'affichent à côté de ton pseudo dans les classements.</p>
				<div className="bp-grid">{BLASONS.filter((b) => b.tier !== 'legendaire').map(blason)}</div>
				<h3 className="bp-legend-head">✨ Légendaires</h3>
				<p className="bp-sub">Le but lointain : des mois de parties pour les réunir tous.</p>
				<div className="bp-grid">{BLASONS.filter((b) => b.tier === 'legendaire').map(blason)}</div>
			</section>

			<section className="bp-sec">
				<h2>🔓 Packs Expert · {UNLOCK_PRICE} 🐔</h2>
				<p className="bp-sub">
					Un pack par jeu. Il ouvre d'un coup la difficulté <strong>Expert</strong> et les
					<strong> niveaux 101 à 200</strong>, nettement plus durs.
					{unlocked.length > 0 && ` · ${unlocked.length}/${games.length} débloqués`}
				</p>
				<input
					className="bp-filter"
					type="search"
					placeholder="Filtrer les jeux…"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					aria-label="Filtrer les jeux"
				/>
				<div className="bp-grid">
					{shown.map((g) => {
						const has = hasUnlock(g.id);
						return (
							<div key={g.id} className={`bp-item ${has ? 'equipped' : ''}`}>
								<span className="bp-label">
									{g.title}
									{!g.expert && <em className="bp-only"> niveaux seuls</em>}
								</span>
								{has ? (
									<a className="bp-eq on" href={g.href}>Jouer →</a>
								) : (
									<button className="bp-buy" disabled={balance < UNLOCK_PRICE} onClick={() => buyPack(g)}>
										{UNLOCK_PRICE} 🐔
									</button>
								)}
							</div>
						);
					})}
					{shown.length === 0 && <p className="bp-sub">Aucun jeu ne correspond.</p>}
				</div>
			</section>
		</div>
	);
}

const CSS = `
.bp-root { width: 100%; max-width: 900px; margin: 0 auto; font-family: var(--font-body); }
.bp-bar {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
  background: var(--gray-999); border: 1.5px solid var(--gray-800); border-radius: 999px; padding: 8px 14px;
}
.bp-bal { font-weight: 800; font-size: 16px; color: var(--gray-0); font-variant-numeric: tabular-nums; }
.bp-claim {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 13.5px; border-radius: 999px; padding: 8px 16px; cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.bp-claim:hover { filter: brightness(1.06); }
.bp-note { color: var(--gray-300); font-size: 12.5px; font-weight: 500; }
.bp-msg { text-align: center; margin-top: 10px; font-weight: 700; font-size: 14px; color: var(--accent-regular); }
.bp-sec { margin-top: 28px; }
.bp-sec h2 { font-size: 20px; margin: 0 0 4px; color: var(--gray-0); }
.bp-legend-head { font-size: 16px; margin: 18px 0 4px; color: var(--gray-0); }
.bp-sub { margin: 0 0 10px; color: var(--gray-300); font-size: 13px; }
.bp-filter {
  width: 100%; max-width: 280px; margin-bottom: 10px; font: inherit; font-size: 13px;
  background: var(--gray-999); border: 1.5px solid var(--gray-800); border-radius: 999px;
  padding: 7px 14px; color: var(--gray-0);
}
.bp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.bp-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 11px; border-radius: 12px;
  background: var(--gray-900); border: 1px solid var(--gray-800);
}
.bp-item.equipped { border-color: var(--accent-regular); }
.bp-item.legend { background: linear-gradient(135deg, var(--gray-900), var(--gray-800)); border-color: var(--gray-700); }
.bp-emoji { font-size: 20px; line-height: 1; }
.bp-label { flex: 1; font-size: 13px; font-weight: 600; color: var(--gray-100); }
.bp-only { font-style: normal; font-size: 11px; font-weight: 500; color: var(--gray-400); }
.bp-buy, .bp-eq {
  border: none; font: inherit; font-weight: 700; font-size: 12px; border-radius: 999px; padding: 5px 11px;
  cursor: pointer; background: var(--accent-regular); color: var(--accent-text-over);
  white-space: nowrap; text-decoration: none;
}
.bp-buy:disabled { opacity: 0.4; cursor: not-allowed; }
.bp-eq { background: var(--gray-700); color: var(--gray-0); }
.bp-eq.on { background: transparent; border: 1.5px solid var(--accent-regular); color: var(--accent-regular); }
`;
