// The admin's weights tables, one per platform: one row per app that shows house ads, one column per ad, each cell
// the ad's weight in that app and its share of the draws, as the apps compute it (lib/promoShares).
import { useMemo, useState } from 'react';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { AppName, Help, appStyle } from './AdminParts';
import { isWeighted, perPlatform, rowChanged, setWeightIn, shares, showingApps, weightIn, type Platform, type Spot } from '../../lib/promoShares';

// Apps that show the ads without an entry of their own.
const OTHERS = ['com.ludivenstudio.dominoland'];
const NAMES: Record<string, string> = {
	'com.ludivenstudio.petanquegame': 'Pétanque Game',
	'com.ludivenstudio.petanquemeet': 'Pétanque Meet',
	'com.raphbenpro.petanquear': 'Pétanque Scan',
	'com.ludivenstudio.dragonsgems': "Dragon's Gems",
	'com.ludivenstudio.ninorush': 'Nino Rush',
	'com.ludivenstudio.dominoland': 'Dominoland',
};
const PLATFORM_NAMES: Record<Platform, string> = { android: 'Android', ios: 'iOS' };

const percent = (x: number): string => `${Math.round(x * 100)} %`;

interface Props {
	catalog: Catalog;
	/** The catalogue online, which « Valider » changes one row of; null while an old version is shown. */
	published: Catalog | null;
	readOnly: boolean;
	busy: boolean;
	change: (fn: (c: Catalog) => void) => void;
	validate: (app: string, platform: Platform) => void;
}

export default function PromoWeights({ catalog, published, readOnly, busy, change, validate }: Props) {
	const [spot, setSpot] = useState<Spot>('banner');
	const [installed, setInstalled] = useState<Set<string>>(new Set());
	const apps = useMemo(() => showingApps(catalog, OTHERS), [catalog]);
	const name = (app: string): string => NAMES[app] ?? catalog.entries.find((e) => e.app?.includes(app))?.title.fr ?? app;
	const split = catalog.entries.some(perPlatform);

	function setWeighted(app: string, on: boolean) {
		change((c) => {
			for (const e of c.entries) {
				if (on) {
					// Starts from what the app draws today, so switching changes nothing until a weight is edited.
					e.weights = { ...(e.weights ?? {}), [app]: weightIn(e, app, false, 'android') };
				} else if (e.weights) {
					const rest = Object.fromEntries(Object.entries(e.weights).filter(([k]) => k !== app));
					if (Object.keys(rest).length) e.weights = rest;
					else delete e.weights;
				}
			}
		});
	}

	function setWeight(app: string, platform: Platform, id: string, value: string) {
		change((c) => {
			const e = c.entries.find((x) => x.id === id);
			if (e) setWeightIn(e, app, platform, Number(value) || 0);
		});
	}

	function table(platform: Platform) {
		const other = PLATFORM_NAMES[platform === 'android' ? 'ios' : 'android'];
		return (
			<section className="pw-platform" key={platform}>
				<h3>{PLATFORM_NAMES[platform]}</h3>
				<div className="pw-scroll">
					<table className="pw-table">
						<thead>
							<tr>
								<th scope="col">Appli qui affiche</th>
								<th scope="col">Pondéré</th>
								{catalog.entries.map((e) => <th scope="col" key={e.id}><AppName name={e.title.fr ?? e.id} of={e.id} /></th>)}
								<th scope="col">Enregistrer</th>
							</tr>
						</thead>
						<tbody>
							{apps.map((app) => {
								const { weighted, rows } = shares(catalog, app, { platform, spot, installed });
								const changed = !!published && rowChanged(published, catalog, app, platform);
								const flips = !!published && isWeighted(published, app) !== weighted;
								return (
									<tr key={app} className={changed ? 'pw-changed' : undefined}>
										<th scope="row"><AppName name={name(app)} of={app} /><small>{app}</small></th>
										<td>
											<label className="pw-switch">
												<input type="checkbox" checked={weighted} disabled={readOnly} onChange={(ev) => setWeighted(app, ev.target.checked)} />
												{weighted ? 'oui' : 'non'}
											</label>
										</td>
										{rows.map((r) => (
											<td key={r.id} className={`pw-cell pw-${r.state}`} title={r.reason} style={appStyle(r.id)}>
												{r.state === 'self' ? <span className="pa-note">sa pub</span> : (
													<>
														{weighted && !readOnly ? (
															<input type="number" min="0" step="0.5" aria-label={`Poids de ${r.id} dans ${name(app)} sur ${PLATFORM_NAMES[platform]}`}
																value={r.weight} onChange={(ev) => setWeight(app, platform, r.id, ev.target.value)} />
														) : <span className="pw-weight">{r.weight}</span>}
														<strong>{r.state === 'shown' ? percent(r.share) : '0 %'}</strong>
														<span className="ak-bar-track" aria-hidden="true"><span className="ak-bar" style={{ width: `${r.state === 'shown' ? Math.round(r.share * 100) : 0}%` }} /></span>
														{r.reason && <small>{r.reason}</small>}
													</>
												)}
											</td>
										))}
										<td className="pw-save">
											<button type="button" className="pa-btn pa-primary" disabled={readOnly || busy || !changed}
												aria-label={`Valider ${name(app)} sur ${PLATFORM_NAMES[platform]}`}
												onClick={() => validate(app, platform)}>Valider</button>
											{changed && flips && <small>{weighted ? `passe aussi ${other} en pondéré` : `rend aussi ${other} aux groupes`}</small>}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
		);
	}

	return (
		<details className="pa-card pw-root" open>
			<summary><h2>Poids par appli</h2></summary>
			<Help>
				<p>
					Chaque case : le poids de la pub dans l'appli de la ligne, sur cette plateforme, et la part des affichages qui en
					sort. En mode pondéré, l'appli ignore les groupes et tire selon ces poids ; 0 éteint la pub dans cette appli
					seulement. Sinon elle garde la règle actuelle : ses groupes d'abord, puis le poids général de la pub.
				</p>
				<p>
					« Valider » publie tout de suite cette ligne seule (cette appli, cette plateforme), sans le reste de tes changements.
					L'interrupteur « Pondéré » vaut pour Android et iOS à la fois.
				</p>
				<p>
					Parts sans compter la règle qui ne remontre jamais la même pub deux fois de suite. « À défaut » : la pub ne sort que
					quand celles d'avant manquent.
				</p>
			</Help>
			<p className="pa-note pw-warn">
				Le mode pondéré ne vaut que pour les versions des applis qui lisent « weights » (LudivenTools, depuis le 20-11-2026).
				Les versions déjà publiées gardent la règle actuelle, quel que soit l'interrupteur.
			</p>
			{split && (
				<p className="pa-note pw-warn">
					Une pub a des poids différents entre Android et iOS : les versions d'appli qui ne lisent que des poids en nombre
					(avant le template LudivenTools e7cfdee3) ne montrent plus du tout cette pub.
				</p>
			)}
			<div className="pw-controls">
				<span className="pa-checks">
					{(['banner', 'video'] as const).map((s) => (
						<label key={s}><input type="radio" name="pw-spot" checked={spot === s} onChange={() => setSpot(s)} /> {s === 'banner' ? 'Bannière' : 'Vidéo'}</label>
					))}
				</span>
				<span className="pa-checks pw-installed">
					<span className="pa-note">Déjà sur le téléphone (Android seulement) :</span>
					{catalog.entries.map((e) => (
						<label key={e.id}>
							<input type="checkbox" checked={installed.has(e.id)} onChange={(ev) => setInstalled((s) => {
								const next = new Set(s);
								if (ev.target.checked) next.add(e.id); else next.delete(e.id);
								return next;
							})} /> {e.title.fr ?? e.id}
						</label>
					))}
				</span>
			</div>
			{table('android')}
			{table('ios')}
		</details>
	);
}
