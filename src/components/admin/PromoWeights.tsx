// The admin's weights table: one row per app that shows house ads, one column per ad, each cell the ad's
// weight in that app and its share of the draws, as the apps compute it (lib/promoShares).
import { useMemo, useState } from 'react';
import type { Catalog } from '../../../supabase/functions/_shared/promoRules.mjs';
import { shares, showingApps, weightIn, type Platform, type Spot } from '../../lib/promoShares';

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

const percent = (x: number): string => `${Math.round(x * 100)} %`;

interface Props {
	catalog: Catalog;
	readOnly: boolean;
	change: (fn: (c: Catalog) => void) => void;
}

export default function PromoWeights({ catalog, readOnly, change }: Props) {
	const [platform, setPlatform] = useState<Platform>('android');
	const [spot, setSpot] = useState<Spot>('banner');
	const [installed, setInstalled] = useState<Set<string>>(new Set());
	const apps = useMemo(() => showingApps(catalog, OTHERS), [catalog]);
	const name = (app: string): string => NAMES[app] ?? catalog.entries.find((e) => e.app?.includes(app))?.title.fr ?? app;

	function setWeighted(app: string, on: boolean) {
		change((c) => {
			for (const e of c.entries) {
				if (on) {
					// Starts from what the app draws today, so switching changes nothing until a weight is edited.
					e.weights = { ...(e.weights ?? {}), [app]: weightIn(e, app, false) };
				} else if (e.weights) {
					const rest = Object.fromEntries(Object.entries(e.weights).filter(([k]) => k !== app));
					if (Object.keys(rest).length) e.weights = rest;
					else delete e.weights;
				}
			}
		});
	}

	function setWeight(app: string, id: string, value: string) {
		const w = Math.max(0, Number(value) || 0);
		change((c) => {
			const e = c.entries.find((x) => x.id === id);
			if (e) e.weights = { ...(e.weights ?? {}), [app]: w };
		});
	}

	return (
		<details className="pa-card pw-root" open>
			<summary>Poids par appli</summary>
			<p className="pa-note">
				Chaque case : le poids de la pub dans l'appli de la ligne, et la part des affichages qui en sort. En mode pondéré,
				l'appli ignore les groupes et tire selon ces poids ; 0 éteint la pub dans cette appli seulement. Sinon elle garde la
				règle actuelle : ses groupes d'abord, puis le poids général de la pub.
			</p>
			<p className="pa-note pw-warn">
				Le mode pondéré ne vaut que pour les versions des applis qui lisent « weights » (LudivenTools, depuis le 20-11-2026).
				Les versions déjà publiées gardent la règle actuelle, quel que soit l'interrupteur.
			</p>
			<div className="pw-controls">
				<span className="pa-checks">
					{(['android', 'ios'] as const).map((p) => (
						<label key={p}><input type="radio" name="pw-platform" checked={platform === p} onChange={() => setPlatform(p)} /> {p === 'ios' ? 'iOS' : 'Android'}</label>
					))}
				</span>
				<span className="pa-checks">
					{(['banner', 'video'] as const).map((s) => (
						<label key={s}><input type="radio" name="pw-spot" checked={spot === s} onChange={() => setSpot(s)} /> {s === 'banner' ? 'Bannière' : 'Vidéo'}</label>
					))}
				</span>
				{platform === 'android' && (
					<span className="pa-checks pw-installed">
						<span className="pa-note">Déjà sur le téléphone :</span>
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
				)}
			</div>
			<div className="pw-scroll">
				<table className="pw-table">
					<thead>
						<tr>
							<th scope="col">Appli qui affiche</th>
							<th scope="col">Pondéré</th>
							{catalog.entries.map((e) => <th scope="col" key={e.id}>{e.title.fr ?? e.id}</th>)}
						</tr>
					</thead>
					<tbody>
						{apps.map((app) => {
							const { weighted, rows } = shares(catalog, app, { platform, spot, installed });
							return (
								<tr key={app}>
									<th scope="row">{name(app)}<small>{app}</small></th>
									<td>
										<label className="pw-switch">
											<input type="checkbox" checked={weighted} disabled={readOnly} onChange={(ev) => setWeighted(app, ev.target.checked)} />
											{weighted ? 'oui' : 'non'}
										</label>
									</td>
									{rows.map((r) => (
										<td key={r.id} className={`pw-cell pw-${r.state}`} title={r.reason}>
											{r.state === 'self' ? <span className="pa-note">sa pub</span> : (
												<>
													{weighted && !readOnly ? (
														<input type="number" min="0" step="0.5" aria-label={`Poids de ${r.id} dans ${name(app)}`}
															value={catalog.entries.find((e) => e.id === r.id)?.weights?.[app] ?? r.weight}
															onChange={(ev) => setWeight(app, r.id, ev.target.value)} />
													) : <span className="pw-weight">{r.weight}</span>}
													<strong>{r.state === 'shown' ? percent(r.share) : '0 %'}</strong>
													{r.reason && <small>{r.reason}</small>}
												</>
											)}
										</td>
									))}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="pa-note">
				Parts sans compter la règle qui ne remontre jamais la même pub deux fois de suite. « À défaut » : la pub ne sort que
				quand celles d'avant manquent.
			</p>
		</details>
	);
}
