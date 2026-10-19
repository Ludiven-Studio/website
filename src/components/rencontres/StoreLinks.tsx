import { MEET_STORES } from '../../data/petanqueMeet';

/** The official badges, as on the Pétanque Scanner page (global .store-badges). */
export default function StoreLinks() {
	return (
		<div className="store-badges">
			<a href={MEET_STORES.play} target="_blank" rel="noopener">
				<img className="badge-play" src="/assets/badges/google-play-fr.png" alt="Disponible sur Google Play" />
			</a>
			<a href={MEET_STORES.apple} target="_blank" rel="noopener">
				<img className="badge-appstore" src="/assets/badges/app-store-fr.svg" alt="Télécharger dans l'App Store" />
			</a>
		</div>
	);
}
