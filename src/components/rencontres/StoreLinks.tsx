import { MEET_STORES } from '../../data/petanqueMeet';

const ICON = '/assets/petanque-meet/icon.webp';

/** The official badges, as on the Pétanque Scanner page (global .store-badges). */
export default function StoreLinks() {
	return (
		<div className="store-badges store-badges--compact">
			<a href={MEET_STORES.play} target="_blank" rel="noopener">
				<img className="badge-play" src="/assets/badges/google-play-fr.png" alt="Disponible sur Google Play" />
			</a>
			<a href={MEET_STORES.apple} target="_blank" rel="noopener">
				<img className="badge-appstore" src="/assets/badges/app-store-fr.svg" alt="Télécharger dans l'App Store" />
			</a>
		</div>
	);
}

/** Publishing and joining happen in the app: say so where the map opens, badges in reach. */
export function AppCard() {
	return (
		<aside className="re-appcard" aria-label="L'appli Pétanque Meet">
			<img className="re-appicon" src={ICON} alt="" width={56} height={56} />
			<p className="re-appcard-text">
				<strong>L'appli Pétanque Meet</strong>
				<span>Publie ta partie, rejoins celle des autres, suis les concours. Gratuite sur Android et iPhone.</span>
			</p>
			<StoreLinks />
		</aside>
	);
}

export function AppIcon({ size }: { size: number }) {
	return <img className="re-appicon" src={ICON} alt="" width={size} height={size} />;
}
