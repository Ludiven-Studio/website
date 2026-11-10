// /admin/pubs/: the house ads catalogue the apps read (public/promo/v1/catalog.json), edited, previewed per
// language and published through promo-admin, which commits it on main for Raphaël's account only.
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { accountLabel, currentSession, onSessionChange, signIn, signOut, takeRedirectError } from '../../lib/meetupAuth';
import {
	AdminError, LOCAL_RUN, fileBase64, load, publish, revert, upload, versionAt, versions,
	type Catalog, type CatalogEntry, type Loaded, type Published, type Upload, type Version,
} from '../../lib/promoAdmin';
import { BANNER_TEXT_MAX, CATALOG_URL, LANGUAGES, PROMO_DIR, catalogUrl, checkCatalog, sitePath } from '../../../supabase/functions/_shared/promoRules.mjs';

const LANG_NAMES: Record<string, string> = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano' };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const list = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
// A new name for every upload: the apps cache images by their URL, so a file replaced in place would stay old.
const stamp = (): string => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const when = (iso: string): string => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** What changed, in the repo's commit style. */
function summary(before: Catalog, after: Catalog): string {
	const old = new Map(before.entries.map((e) => [e.id, e]));
	const now = new Map(after.entries.map((e) => [e.id, e]));
	const parts: string[] = [];
	const added = after.entries.filter((e) => !old.has(e.id)).map((e) => e.id);
	const removed = before.entries.filter((e) => !now.has(e.id)).map((e) => e.id);
	const off = after.entries.filter((e) => old.has(e.id) && (old.get(e.id)!.weight ?? 1) > 0 && (e.weight ?? 1) === 0).map((e) => e.id);
	const on = after.entries.filter((e) => old.has(e.id) && (old.get(e.id)!.weight ?? 1) === 0 && (e.weight ?? 1) > 0).map((e) => e.id);
	const changed = after.entries.filter((e) => old.has(e.id) && !off.includes(e.id) && !on.includes(e.id)
		&& JSON.stringify(e) !== JSON.stringify(old.get(e.id))).map((e) => e.id);
	if (added.length) parts.push(`${added.join(', ')} added`);
	if (removed.length) parts.push(`${removed.join(', ')} removed`);
	if (off.length) parts.push(`${off.join(', ')} turned off`);
	if (on.length) parts.push(`${on.join(', ')} turned on`);
	if (changed.length) parts.push(`${changed.join(', ')} changed`);
	return `[CHANGED] House ads catalogue: ${parts.join('; ') || 'settings'} (admin page)`;
}

function emptyEntry(n: number, lang: string): CatalogEntry {
	return {
		id: `nouvelle-pub-${n}`,
		title: { [lang]: '' },
		text: { [lang]: '' },
		image: '',
		link: {},
		app: [],
		groups: [],
		hideIn: [],
		weight: 0,
	};
}

export default function PromoAdmin() {
	const [session, setSession] = useState<Session | null>(null);
	const [authReady, setAuthReady] = useState(LOCAL_RUN);
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [draft, setDraft] = useState<Catalog | null>(null);
	const [uploads, setUploads] = useState<Map<string, Upload>>(new Map());
	// Kept across reloads: a file just published shows here before the site's deploy serves it.
	const [previews, setPreviews] = useState<Map<string, string>>(new Map());
	const [selected, setSelected] = useState(0);
	const [lang, setLang] = useState('fr');
	const [busy, setBusy] = useState('');
	const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; problems?: string[] } | null>(null);
	const [history, setHistory] = useState<Version[] | null>(null);
	const [peek, setPeek] = useState<{ version: Version; catalog: Catalog } | null>(null);
	const [lastWeight, setLastWeight] = useState<Record<string, number>>({});

	useEffect(() => {
		if (LOCAL_RUN) return;
		const err = takeRedirectError();
		if (err) setMessage({ kind: 'error', text: err });
		currentSession().then((s) => {
			setSession(s);
			setAuthReady(true);
		});
		return onSessionChange(setSession);
	}, []);

	const signedIn = LOCAL_RUN || !!session;
	useEffect(() => {
		if (signedIn) void reload();
		// Once signed in: reload only calls state setters, so a new render's copy changes nothing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [signedIn]);

	async function run<T>(what: string, job: () => Promise<T>): Promise<T | undefined> {
		setBusy(what);
		try {
			return await job();
		} catch (e) {
			const err = e instanceof AdminError ? e : new AdminError(0, String(e));
			// The id is what PROMO_ADMIN_USER_ID must hold for this account.
			const text = err.status === 403 ? `Ce compte n'a pas accès à l'admin des pubs${session ? ` (${accountLabel(session)}, identifiant ${session.user.id})` : ''}.`
				: err.status === 409 ? 'Le catalogue a changé entre-temps : recharge-le, puis refais tes changements.'
					: err.status === 0 ? 'Le serveur ne répond pas.' : `Refusé : ${err.message}`;
			setMessage({ kind: 'error', text, problems: err.problems });
			return undefined;
		} finally {
			setBusy('');
		}
	}

	async function reload() {
		const data = await run('Chargement…', load);
		if (!data) return;
		setLoaded(data);
		setDraft(clone(data.catalog));
		setUploads(new Map());
		setSelected((i) => Math.min(i, data.catalog.entries.length - 1));
		setPeek(null);
		setHistory(await run('Historique…', versions) ?? null);
	}

	const dirty = !!loaded && !!draft && JSON.stringify(draft) !== JSON.stringify(loaded.catalog);
	const problems = useMemo(() => {
		if (!draft || !loaded) return [];
		const { problems: rules, files } = checkCatalog(draft, { strict: true });
		const known = new Set([...loaded.files.map((f) => f.path), ...uploads.keys()]);
		const missing = files.filter((f) => f.path.startsWith(PROMO_DIR) && !known.has(f.path)).map((f) => `${f.what}: ${f.path} n'existe pas`);
		return [...rules, ...missing];
	}, [draft, loaded, uploads]);

	/** Where the page can show a file: the pending upload, or the site. */
	const fileUrl = (url: string | undefined): string | undefined => {
		if (!url) return undefined;
		const path = sitePath(url, CATALOG_URL);
		const local = path ? previews.get(path) : undefined;
		if (local) return local;
		try {
			const u = new URL(url, CATALOG_URL);
			return path ? u.pathname : u.href;
		} catch {
			return undefined;
		}
	};

	function edit(change: (e: CatalogEntry) => void) {
		setDraft((d) => {
			if (!d) return d;
			const next = clone(d);
			change(next.entries[selected]);
			return next;
		});
	}

	async function pick(kind: 'image' | 'clip', file: File | undefined) {
		if (!file || !draft) return;
		const entry = draft.entries[selected];
		const ext = kind === 'clip' ? 'mp4' : file.type === 'image/jpeg' ? 'jpg' : 'png';
		const path = kind === 'clip' ? `${PROMO_DIR}clips/${entry.id}_${lang}-${stamp()}.${ext}` : `${PROMO_DIR}img/${entry.id}-${stamp()}.${ext}`;
		const done = await run('Envoi du fichier…', async () => upload(path, await fileBase64(file)));
		if (!done) return;
		setUploads((u) => new Map(u).set(path, { path, sha: done.sha }));
		setPreviews((p) => new Map(p).set(path, URL.createObjectURL(file)));
		edit((e) => {
			if (kind === 'clip') e.clips = { ...(e.clips ?? {}), [lang]: catalogUrl(path) };
			else e.image = catalogUrl(path);
		});
		setMessage({ kind: 'ok', text: `${file.name} envoyé, en attente de « Publier ».` });
	}

	async function doPublish() {
		if (!loaded || !draft) return;
		const used = new Set(checkCatalog(draft).files.map((f) => f.path));
		const sent = [...uploads.values()].filter((u) => used.has(u.path)).map(({ path, sha }) => ({ path, sha }));
		const done: Published | undefined = await run('Publication…', () => publish(draft, loaded.blob, sent, summary(loaded.catalog, draft)));
		if (!done) return;
		await reload();
		setMessage({ kind: 'ok', text: `Publié (${done.commit.slice(0, 7)}). Le site se déploie en 5 min environ ; les applis le liront à leur lancement suivant.${done.removed.length ? ` Fichiers effacés après 30 jours : ${done.removed.length}.` : ''}${done.warnings.length ? ` À noter : ${done.warnings.join(' ; ')}` : ''}` });
	}

	async function doRevert(v: Version) {
		if (!loaded || !confirm(`Revenir à la version du ${when(v.date)} ? Elle sera publiée telle quelle.`)) return;
		const done = await run('Retour en arrière…', () => revert(v.sha, v.date, loaded.blob));
		if (!done) return;
		await reload();
		setMessage({ kind: 'ok', text: `Version du ${when(v.date)} republiée (${done.commit.slice(0, 7)}).` });
	}

	async function doPeek(v: Version) {
		const got = await run('Lecture de la version…', () => versionAt(v.sha));
		if (got) setPeek({ version: v, catalog: got.catalog });
	}

	if (!authReady) return <p className="pa-note">Chargement…</p>;
	if (!signedIn)
		return (
			<div className="pa-card pa-signin">
				<p>Cette page est réservée à l'administration des pubs maison.</p>
				<button type="button" className="pa-btn pa-primary" onClick={async () => {
					const err = await signIn('google', window.location.href);
					if (err) setMessage({ kind: 'error', text: err });
				}}>Se connecter avec Google</button>
				{message && <p className="pa-error">{message.text}</p>}
			</div>
		);

	const entry = draft?.entries[selected];
	const shown = peek?.catalog ?? draft;

	return (
		<div className="pa-root">
			<div className="pa-bar">
				<span className="pa-note">
					{LOCAL_RUN ? 'Essai local' : session ? `Connecté : ${accountLabel(session)}` : ''}
					{loaded && ` · en ligne : ${loaded.head.slice(0, 7)}, catalogue du ${when(loaded.catalog.updated)}`}
				</span>
				<span className="pa-actions">
					{busy && <span className="pa-note">{busy}</span>}
					<button type="button" className="pa-btn" disabled={!!busy} onClick={() => void reload()}>Recharger</button>
					<button type="button" className="pa-btn" disabled={!dirty || !!busy} onClick={() => { setDraft(clone(loaded!.catalog)); setUploads(new Map()); setMessage(null); }}>Annuler mes changements</button>
					<button type="button" className="pa-btn pa-primary" disabled={!dirty || problems.length > 0 || !!busy || !!peek} onClick={() => void doPublish()}>Publier</button>
					{!LOCAL_RUN && <button type="button" className="pa-btn" onClick={() => void signOut()}>Se déconnecter</button>}
				</span>
			</div>

			{message && (
				<div className={`pa-card ${message.kind === 'ok' ? 'pa-ok' : 'pa-error'}`}>
					<p>{message.text}</p>
					{!!message.problems?.length && <ul>{message.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
				</div>
			)}
			{dirty && problems.length > 0 && (
				<div className="pa-card pa-error">
					<p>À corriger avant de publier :</p>
					<ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
				</div>
			)}
			{peek && (
				<div className="pa-card pa-peek">
					<p>Tu regardes la version du {when(peek.version.date)} ({peek.version.message}).</p>
					<button type="button" className="pa-btn" onClick={() => setPeek(null)}>Revenir au brouillon</button>
					<button type="button" className="pa-btn pa-primary" disabled={!!busy} onClick={() => void doRevert(peek.version)}>Revenir à cette version</button>
				</div>
			)}

			{shown && (
				<div className="pa-grid">
					<div className="pa-list">
						{shown.entries.map((e, i) => (
							<button type="button" key={`${e.id}-${i}`} className={`pa-item ${i === selected ? 'pa-item--on' : ''}`} onClick={() => setSelected(i)}>
								{e.image && <img src={fileUrl(e.image)} alt="" width="40" height="40" />}
								<span>
									<strong>{e.title.fr || e.title[shown.defaultLanguage ?? 'fr'] || e.id}</strong>
									<small>{e.id} · {(e.weight ?? 1) > 0 ? `active, poids ${e.weight ?? 1}` : 'désactivée'}</small>
								</span>
							</button>
						))}
						{!peek && (
							<button type="button" className="pa-btn" disabled={!!busy} onClick={() => {
								setDraft((d) => (d ? { ...d, entries: [...d.entries, emptyEntry(d.entries.length + 1, lang)] } : d));
								setSelected(draft!.entries.length);
							}}>+ Nouvelle pub</button>
						)}
					</div>

					{(peek ? peek.catalog.entries[selected] : entry) && (
						<Editor
							entry={(peek ? peek.catalog.entries[selected] : entry)!}
							readOnly={!!peek}
							lang={lang}
							setLang={setLang}
							edit={edit}
							pick={pick}
							fileUrl={fileUrl}
							toggle={() => edit((e) => {
								const w = e.weight ?? 1;
								if (w > 0) {
									setLastWeight((m) => ({ ...m, [e.id]: w }));
									e.weight = 0;
								} else e.weight = lastWeight[e.id] ?? 1;
							})}
							remove={() => {
								if (!draft || !confirm(`Supprimer « ${entry?.id} » ? Ses fichiers restent 30 jours sur le site.`)) return;
								setDraft({ ...draft, entries: draft.entries.filter((_, i) => i !== selected) });
								setSelected(0);
							}}
						/>
					)}
				</div>
			)}

			<details className="pa-card pa-history">
				<summary>Historique des versions</summary>
				{history?.length ? (
					<ul>
						{history.map((v) => (
							<li key={v.sha}>
								<span>{when(v.date)} · {v.message} · <code>{v.sha.slice(0, 7)}</code></span>
								<button type="button" className="pa-btn" disabled={!!busy} onClick={() => void doPeek(v)}>Voir</button>
							</li>
						))}
					</ul>
				) : <p className="pa-note">Aucune version chargée.</p>}
			</details>
		</div>
	);
}

interface EditorProps {
	entry: CatalogEntry;
	readOnly: boolean;
	lang: string;
	setLang: (l: string) => void;
	edit: (change: (e: CatalogEntry) => void) => void;
	pick: (kind: 'image' | 'clip', file: File | undefined) => void;
	fileUrl: (url: string | undefined) => string | undefined;
	toggle: () => void;
	remove: () => void;
}

function Editor({ entry, readOnly, lang, setLang, edit, pick, fileUrl, toggle, remove }: EditorProps) {
	const title = entry.title[lang] ?? '';
	const text = entry.text?.[lang] ?? '';
	const clip = entry.clips?.[lang] ?? entry.clips?.fr;
	const active = (entry.weight ?? 1) > 0;
	const shortText = [...text].length > BANNER_TEXT_MAX ? [...text].slice(0, BANNER_TEXT_MAX - 1).join('') + '…' : text;
	const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
		<label className="pa-field">
			<span>{label}{hint && <small> {hint}</small>}</span>
			<input value={value} disabled={readOnly} onChange={(ev) => set(ev.target.value)} />
		</label>
	);
	return (
		<div className="pa-editor">
			<div className="pa-tabs" role="tablist">
				{LANGUAGES.map((l) => (
					<button type="button" role="tab" aria-selected={l === lang} key={l} className={`pa-tab ${l === lang ? 'pa-tab--on' : ''}`} onClick={() => setLang(l)}>
						{LANG_NAMES[l]}{(!entry.title[l] || !entry.text?.[l]) && ' ⚠'}
					</button>
				))}
			</div>

			<div className="pa-previews">
				<div>
					<p className="pa-note">Bannière ({LANG_NAMES[lang]})</p>
					<div className="pa-banner">
						{entry.image ? <img src={fileUrl(entry.image)} alt="" width="48" height="48" /> : <span className="pa-noimg" />}
						<span>
							<span className="pa-banner-title">{title || '—'} <small>Ludiven Studio</small></span>
							<span className="pa-banner-text">{shortText || '—'}</span>
						</span>
					</div>
				</div>
				<div>
					<p className="pa-note">Vidéo ({clip === entry.clips?.[lang] ? LANG_NAMES[lang] : 'langue par défaut'})</p>
					{clip ? <video className="pa-video" src={fileUrl(clip)} controls muted playsInline preload="metadata" /> : <p className="pa-note">Pas de vidéo : bannière seulement.</p>}
					<p className="pa-video-under"><strong>{title}</strong> <span className="pa-fake-btn">Découvrir</span></p>
				</div>
			</div>

			<div className="pa-fields">
				<label className="pa-field">
					<span>Titre ({lang})</span>
					<input value={title} disabled={readOnly} onChange={(ev) => edit((e) => { e.title = { ...e.title, [lang]: ev.target.value }; })} />
				</label>
				<label className="pa-field">
					<span>Texte de la bannière ({lang}) <small>{[...text].length}/{BANNER_TEXT_MAX}</small></span>
					<input value={text} disabled={readOnly} onChange={(ev) => edit((e) => { e.text = { ...(e.text ?? {}), [lang]: ev.target.value }; })} />
				</label>
				{!readOnly && (
					<div className="pa-uploads">
						<label className="pa-btn">Changer l'icône (PNG ou JPEG, carrée)
							<input type="file" accept="image/png,image/jpeg" hidden onChange={(ev) => pick('image', ev.target.files?.[0])} />
						</label>
						<label className="pa-btn">Vidéo en {LANG_NAMES[lang]} (MP4)
							<input type="file" accept="video/mp4" hidden onChange={(ev) => pick('clip', ev.target.files?.[0])} />
						</label>
					</div>
				)}
				{field('Identifiant', entry.id, (v) => edit((e) => { e.id = v; }), 'minuscules, chiffres, tirets')}
				{field('Lien Google Play', entry.link?.android ?? '', (v) => edit((e) => { e.link = { ...e.link, android: v || undefined }; }), 'nom du paquet')}
				{field('Lien App Store', entry.link?.ios ?? '', (v) => edit((e) => { e.link = { ...e.link, ios: v || undefined }; }), 'numéro de l’appli')}
				{field('Lien web', entry.link?.web ?? '', (v) => edit((e) => { e.link = { ...e.link, web: v || undefined }; }), 'à défaut de store')}
				{field('Appli présentée', (entry.app ?? []).join(', '), (v) => edit((e) => { e.app = list(v); }), 'identifiants, séparés par des virgules')}
				{field('Groupes', (entry.groups ?? []).join(', '), (v) => edit((e) => { e.groups = list(v); }), 'petanque, games')}
				{field('Masquée dans', (entry.hideIn ?? []).join(', '), (v) => edit((e) => { e.hideIn = list(v); }), 'identifiants des applis')}
				<label className="pa-field">
					<span>Plateformes <small>vide : toutes</small></span>
					<span className="pa-checks">
						{['android', 'ios'].map((p) => (
							<label key={p}>
								<input type="checkbox" disabled={readOnly} checked={entry.platforms?.includes(p) ?? false}
									onChange={(ev) => edit((e) => {
										const set = new Set(e.platforms ?? []);
										if (ev.target.checked) set.add(p); else set.delete(p);
										e.platforms = set.size ? [...set] : undefined;
									})} /> {p === 'ios' ? 'iOS' : 'Android'}
							</label>
						))}
					</span>
				</label>
				<label className="pa-field">
					<span>Poids <small>0 = jamais montrée</small></span>
					<input type="number" min="0" step="0.5" value={entry.weight ?? 1} disabled={readOnly}
						onChange={(ev) => edit((e) => { e.weight = Math.max(0, Number(ev.target.value) || 0); })} />
				</label>
			</div>

			{!readOnly && (
				<div className="pa-actions">
					<button type="button" className="pa-btn" onClick={toggle}>{active ? 'Désactiver (poids 0)' : 'Activer'}</button>
					<button type="button" className="pa-btn pa-danger" onClick={remove}>Supprimer</button>
				</div>
			)}
			<p className="pa-note">Fichiers : {entry.image || '—'}{entry.clips ? ` · vidéos : ${Object.entries(entry.clips).map(([l, c]) => `${l} ${c}`).join(', ')}` : ''}</p>
		</div>
	);
}
