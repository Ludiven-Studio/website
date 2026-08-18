import { useCallback, useEffect, useState } from 'react';
import { type AdminSpace, adminList, adminDeleteSpace, renameList, recentSpaces, coursesEnabled } from '../../lib/courses';
import { RenameSheet } from './CoursesApp';

// The operator key can come from ?k= (bookmarkable) or be typed once. It is kept
// here only to send it back to the function, which is the sole judge of it.
const KEY_STORE = 'ludiven-courses-admin';
const readKey = (): string => {
	const fromUrl = new URLSearchParams(window.location.search).get('k');
	if (fromUrl) return fromUrl;
	try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
};

const fmt = (iso: string): string =>
	new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

/** "aujourd'hui" reads better than a date when the list was just touched. */
function ago(iso: string): string {
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
	if (days <= 0) return "aujourd'hui";
	if (days === 1) return 'hier';
	if (days < 30) return `il y a ${days} jours`;
	return fmt(iso);
}

const linkTo = (id: string): string => `${window.location.origin}/courses?l=${id}`;

export default function CoursesAdmin() {
	const [key, setKey] = useState('');
	const [typed, setTyped] = useState('');
	const [spaces, setSpaces] = useState<AdminSpace[] | null>(null);
	const [mine, setMine] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);
	const [naming, setNaming] = useState<AdminSpace | null>(null);
	const [booted, setBooted] = useState(false);

	useEffect(() => {
		setKey(readKey());
		setMine(new Set(recentSpaces().map((s) => s.id)));
		setBooted(true);
	}, []);

	const load = useCallback(async (k: string) => {
		if (!k) return;
		setBusy(true);
		try {
			const res = await adminList(k);
			setSpaces(res.spaces);
			setError(null);
			try { localStorage.setItem(KEY_STORE, k); } catch { /* ignore */ }
		} catch (e) {
			setSpaces(null);
			setError(e instanceof Error && e.message === 'forbidden' ? 'Clé refusée.' : 'Erreur de chargement.');
		} finally {
			setBusy(false);
		}
	}, []);

	useEffect(() => { void load(key); }, [key, load]);

	const copy = async (id: string) => {
		try {
			await navigator.clipboard.writeText(linkTo(id));
			setCopied(id);
			setTimeout(() => setCopied(null), 1800);
		} catch { /* clipboard refused */ }
	};

	const remove = async (s: AdminSpace) => {
		const label = s.title || 'Liste de courses';
		if (!window.confirm(`Supprimer « ${label} » et tout son historique ? C'est définitif.`)) return;
		setBusy(true);
		try {
			await adminDeleteSpace(key, s.id);
			await load(key);
		} catch {
			setError('Suppression impossible.');
			setBusy(false);
		}
	};

	if (!coursesEnabled()) return <p className="co-empty">Le service n'est pas disponible.</p>;
	if (!booted) return null;

	if (!spaces) {
		return (
			<div className="co-root">
				<h1>Listes de courses</h1>
				<div className="co-gate">
					<p className="co-intro">Entre la clé pour voir toutes les listes.</p>
					<input
						className="co-in" type="password" value={typed} placeholder="Clé admin" autoFocus
						onChange={(e) => setTyped(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && setKey(typed.trim())}
					/>
					{error && <p className="co-error">{error}</p>}
					<button className="co-btn co-btn-primary" onClick={() => setKey(typed.trim())} disabled={busy || !typed.trim()}>
						{busy ? '…' : 'Ouvrir'}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="co-root">
			<div className="co-head">
				<div className="co-title-row"><h1>Listes de courses</h1></div>
				<div className="co-tools">
					<button className="co-btn" onClick={() => load(key)} disabled={busy}>Rafraîchir</button>
					<a className="co-btn" href="/courses">Nouvelle</a>
				</div>
			</div>

			{error && <p className="co-error" onClick={() => setError(null)}>{error}</p>}
			<p className="co-intro">
				{spaces.length} liste{spaces.length > 1 ? 's' : ''}. Chaque lien est le secret de sa liste :
				qui l'a peut la modifier.
			</p>

			{spaces.length === 0 ? (
				<p className="co-empty">Aucune liste pour l'instant.</p>
			) : (
				<div className="co-recents">
					{spaces.map((s) => (
						<div className="co-card" key={s.id} data-space-id={s.id}>
							<div className="co-card-top">
								<span className="co-card-title">{s.title || 'Liste de courses'}</span>
								{mine.has(s.id) && <span className="co-mine" title="Ouverte sur cet appareil">● à moi</span>}
							</div>
							<span className="co-card-meta">
								{s.items - s.checked} à prendre{s.checked > 0 ? ` · ${s.checked} pris` : ''}
								{s.archived > 0 && ` · ${s.archived} archivée${s.archived > 1 ? 's' : ''}`}
								<br />
								Créée le {fmt(s.created_at)} · activité {ago(s.lastActivity)}
							</span>
							<div className="co-card-actions">
								<a className="co-btn" href={`/courses?l=${s.id}`}>Ouvrir</a>
								<button className="co-btn" onClick={() => copy(s.id)}>
									{copied === s.id ? 'Lien copié ✓' : 'Copier le lien'}
								</button>
								<button className="co-btn" onClick={() => setNaming(s)} disabled={!s.activeListId}>Renommer</button>
								<button className="co-btn co-danger" onClick={() => remove(s)} disabled={busy}>Supprimer</button>
							</div>
						</div>
					))}
			</div>
			)}

			{naming && naming.activeListId && (
				<RenameSheet
					heading="Renommer la liste" value={naming.title} busy={busy}
					onClose={() => setNaming(null)}
					onSave={async (n) => {
						// The space uuid IS the write credential, so no admin action is needed here.
						await renameList(naming.id, naming.activeListId!, n);
						setNaming(null);
						await load(key);
					}}
				/>
			)}
		</div>
	);
}
