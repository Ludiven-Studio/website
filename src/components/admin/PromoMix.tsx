// The admin's house-ad mix table: per app (and « Toutes les applis »), the % of house ads against the networks' ads,
// per format, with consent; without consent locked at 100 %. Published with « Publier », like the ads themselves.
import type { Catalog, MixFormat } from '../../../supabase/functions/_shared/promoRules.mjs';
import { MIX_FORMATS, MIX_NO_CONSENT } from '../../../supabase/functions/_shared/promoRules.mjs';
import { AppName, Help } from './AdminParts';
import { APP_NAMES, SHOWING_OTHERS } from './PromoWeights';
import { showingApps } from '../../lib/promoShares';
import { ALL_APPS, mixRows, mixValue, setMix } from '../../lib/promoMix';

const FORMAT_NAMES: Record<MixFormat, string> = { banner: 'Bannière', interstitial: 'Interstitiel' };
const FORMAT_HINTS: Record<MixFormat, string> = { banner: 'part du temps affiché', interstitial: 'part des pubs montrées' };

interface Props {
	catalog: Catalog;
	/** The catalogue online, to mark the rows « Publier » would change; null while an old version is shown. */
	published: Catalog | null;
	readOnly: boolean;
	change: (fn: (c: Catalog) => void) => void;
}

export default function PromoMix({ catalog, published, readOnly, change }: Props) {
	const rows = [ALL_APPS, ...showingApps(catalog, SHOWING_OTHERS), ...mixRows(catalog)].filter((r, i, all) => all.indexOf(r) === i);
	const name = (row: string): string => (row === ALL_APPS ? 'Toutes les applis' : APP_NAMES[row] ?? catalog.entries.find((e) => e.app?.includes(row))?.title.fr ?? row);
	const own = (c: Catalog | null, row: string) => JSON.stringify(c?.mix && Object.hasOwn(c.mix, row) ? c.mix[row] : null);

	function cell(row: string, format: MixFormat) {
		const v = mixValue(catalog, row, format);
		const set = v.from === 'row';
		const source = set ? 'réglé ici' : v.from === 'all' ? 'comme toutes' : 'par défaut';
		return (
			<td key={format} className="pw-cell pm-cell">
				{readOnly ? <strong>{v.value} %</strong> : (
					<label>
						<input type="number" min="0" max="100" step="1" inputMode="numeric" className={set ? 'pm-own' : 'pm-inherit'} placeholder={String(v.value)} value={set ? v.value : ''}
							aria-label={`${FORMAT_NAMES[format]} avec consentement, ${name(row)}`}
							onChange={(ev) => change((c) => setMix(c, row, format, ev.target.value === '' ? null : Number(ev.target.value)))} /> %
					</label>
				)}
				<small className={set ? 'pm-set' : undefined}>{source}</small>
			</td>
		);
	}

	return (
		<details className="pa-card pw-root pm-root" open>
			<summary><h2>Pubs maison et pubs des régies</h2></summary>
			<Help>
				<p>
					Chaque case : la part de pubs maison face aux pubs des régies (LevelPlay), avec le consentement du joueur.
					Bannière : la part du temps où la bannière montre une pub maison. Interstitiel : la part des interstitiels qui
					sont des pubs maison. Les vidéos récompensées ne sont pas concernées.
				</p>
				<p>
					Une case vide reprend la ligne « Toutes les applis » (« comme toutes »), et celle-ci la valeur de l'appli
					(« par défaut » : bannière 8 %, interstitiel 0 % aujourd'hui). Le chiffre grisé est celui que l'appli utilise ;
					vide une case pour revenir en arrière.
					« Publier » envoie le tableau avec le reste de tes changements.
				</p>
			</Help>
			<p className="pa-note pw-warn">
				Lu par Pétanque Game 1.0.17, Pétanque Meet 1.1.5, Pétanque Scan 1.2.19, Dragon's Gems 1.2.2 et les versions
				suivantes. Les versions déjà publiées gardent leur réglage.
			</p>
			<div className="pw-scroll">
				<table className="pw-table pm-table">
					<thead>
						<tr>
							<th scope="col">Appli</th>
							{MIX_FORMATS.map((f) => <th scope="col" key={f}>{FORMAT_NAMES[f]}<small>{FORMAT_HINTS[f]}, avec consentement</small></th>)}
							<th scope="col" className="pm-lockcol">Sans consentement<small>toutes les pubs</small></th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row} className={`${published && own(published, row) !== own(catalog, row) ? 'pw-changed' : ''} ${row === ALL_APPS ? 'pm-all' : ''}`.trim() || undefined}>
								<th scope="row">{row === ALL_APPS ? <strong>{name(row)}</strong> : <><AppName name={name(row)} of={row} /><small>{row}</small></>}</th>
								{MIX_FORMATS.map((f) => cell(row, f))}
								<td className="pw-cell pm-locked pm-lockcol" title="Sans « Accepter », aucune régie ne démarre : les applis ne montrent que des pubs maison. Verrouillé en attendant la décision de Raphaël.">
									<strong>{MIX_NO_CONSENT} %</strong>
									<small>verrouillé</small>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="pa-note pm-lock-note">Sans consentement : {MIX_NO_CONSENT} % de pubs maison partout, verrouillé en attendant la décision de Raphaël.</p>
		</details>
	);
}
