import { MEET_STORES } from '../../data/petanqueMeet';
import { useLang, useT } from './i18n';

const ICON = '/assets/petanque-meet/icon.webp';

/** The official badges, as on the Pétanque Scanner page (global .store-badges). */
export default function StoreLinks() {
	const lang = useLang();
	const tr = useT();
	const stores = MEET_STORES[lang];
	return (
		<div className="store-badges store-badges--compact">
			<a href={stores.play} target="_blank" rel="noopener">
				<img
					className="badge-play"
					src={`/assets/badges/google-play-${lang}.png`}
					alt={tr('Disponible sur Google Play', 'Get it on Google Play')}
				/>
			</a>
			<a href={stores.apple} target="_blank" rel="noopener">
				<img
					className="badge-appstore"
					src={`/assets/badges/app-store-${lang}.svg`}
					alt={tr("Télécharger dans l'App Store", 'Download on the App Store')}
				/>
			</a>
		</div>
	);
}

/** Publishing and joining happen in the app: say so where the map opens, badges in reach. */
export function AppCard() {
	const tr = useT();
	return (
		<aside className="re-appcard" aria-label={tr("L'appli Pétanque Meet", 'The Pétanque Meet app')}>
			<img className="re-appicon" src={ICON} alt="" width={56} height={56} />
			<p className="re-appcard-text">
				<strong>{tr("L'appli Pétanque Meet", 'The Pétanque Meet app')}</strong>
				<span>
					{tr(
						'Publie ta partie, rejoins celle des autres, suis les concours. Gratuite sur Android et iPhone.',
						"Post your game, join other people's, follow the tournaments. Free on Android and iPhone.",
					)}
				</span>
			</p>
			<StoreLinks />
		</aside>
	);
}

export function AppIcon({ size }: { size: number }) {
	return <img className="re-appicon" src={ICON} alt="" width={size} height={size} />;
}
