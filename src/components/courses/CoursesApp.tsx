import { useCallback, useEffect, useRef, useState } from 'react';
import {
	type Snapshot, type CourseItem, type HistoryEntry, type RecentSpace,
	createSpace, getSpace, getList, addItem, updateItem, deleteItem,
	clearChecked, newList, reuseList,
	recentSpaces, rememberSpace, coursesEnabled,
} from '../../lib/courses';
import { joinSpace, type CoursesLink } from '../../games/courses/net';

// Read/replace the ?l=<spaceId> secret in the URL without a full navigation.
const spaceFromUrl = (): string | null => new URLSearchParams(window.location.search).get('l');
function setUrlSpace(id: string): void {
	const url = new URL(window.location.href);
	url.searchParams.set('l', id);
	window.history.replaceState(null, '', url);
}

const fmtDate = (iso: string): string =>
	new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

type View = 'list' | 'history' | 'detail';

export default function CoursesApp() {
	const [spaceId, setSpaceId] = useState<string | null>(null);
	const [snap, setSnap] = useState<Snapshot | null>(null);
	const [view, setView] = useState<View>('list');
	const [detail, setDetail] = useState<{ id: string; title: string; items: CourseItem[] } | null>(null);
	const [peers, setPeers] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [booted, setBooted] = useState(false);
	const [recents, setRecents] = useState<RecentSpace[]>([]);
	const linkRef = useRef<CoursesLink | null>(null);

	// ---- Boot: pick up the space from the URL (or show the landing). ----
	useEffect(() => {
		setRecents(recentSpaces());
		const fromUrl = spaceFromUrl();
		if (fromUrl) setSpaceId(fromUrl);
		setBooted(true);
	}, []);

	const reload = useCallback(async (id: string) => {
		try {
			const s = await getSpace(id);
			setSnap(s);
			setError(null);
			rememberSpace(id, s.active.title);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Erreur de chargement');
		}
	}, []);

	// ---- Load the space + open the live channel whenever spaceId changes. ----
	useEffect(() => {
		if (!spaceId) return;
		let alive = true;
		setSnap(null);
		void (async () => { if (alive) await reload(spaceId); })();
		const link = joinSpace(spaceId);
		linkRef.current = link;
		link?.onNudge(() => { void reload(spaceId); });
		link?.onPeers((n) => setPeers(n));
		return () => { alive = false; link?.leave(); linkRef.current = null; };
	}, [spaceId, reload]);

	// Run a mutation, refresh our own view, then tell the other device to refresh.
	const mutate = useCallback(async (fn: () => Promise<unknown>) => {
		if (!spaceId) return;
		setBusy(true);
		try {
			await fn();
			await reload(spaceId);
			linkRef.current?.nudge();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Erreur');
		} finally {
			setBusy(false);
		}
	}, [spaceId, reload]);

	const onCreate = useCallback(async () => {
		setBusy(true);
		try {
			const s = await createSpace();
			rememberSpace(s.spaceId, '');
			setUrlSpace(s.spaceId);
			setSpaceId(s.spaceId);
			setSnap(s);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Erreur');
		} finally {
			setBusy(false);
		}
	}, []);

	if (!coursesEnabled()) return <p className="co-empty">Le service n'est pas disponible.</p>;
	if (!booted) return null;

	// ---------- Landing: no space in the URL ----------
	if (!spaceId) {
		return (
			<div className="co-root">
				<p className="co-intro">
					Une liste de courses partagée : ajoute des articles, envoie le lien à quelqu'un, et vous la
					cochez à deux en temps réel. L'historique garde les anciennes listes pour les réutiliser.
				</p>
				<button className="co-btn co-btn-primary co-big" onClick={onCreate} disabled={busy}>
					{busy ? '…' : 'Créer ma liste'}
				</button>
				{recents.length > 0 && (
					<div className="co-recents">
						<h2>Mes listes récentes</h2>
						{recents.map((r) => (
							<a key={r.id} className="co-recent" href={`?l=${r.id}`}>
								<span>{r.title || 'Liste de courses'}</span>
								<small>{fmtDate(new Date(r.savedAt).toISOString())}</small>
							</a>
						))}
					</div>
				)}
			</div>
		);
	}

	// ---------- A space is loading ----------
	if (!snap) {
		return (
			<div className="co-root">
				{error ? <p className="co-error">{error}</p> : <p className="co-empty">Chargement…</p>}
			</div>
		);
	}

	return (
		<div className="co-root">
			{error && <p className="co-error" onClick={() => setError(null)}>{error}</p>}

			{view === 'list' && (
				<ListView
					snap={snap} peers={peers} busy={busy} spaceId={spaceId}
					onOpenHistory={() => setView('history')}
					onReload={() => reload(spaceId)}
					mutate={mutate}
				/>
			)}

			{view === 'history' && (
				<HistoryView
					history={snap.history}
					onBack={() => setView('list')}
					onOpen={async (h) => {
						const l = await getList(spaceId, h.id);
						setDetail(l);
						setView('detail');
					}}
				/>
			)}

			{view === 'detail' && detail && (
				<DetailView
					detail={detail}
					onBack={() => setView('history')}
					busy={busy}
					onReuse={() => mutate(() => reuseList(spaceId, detail.id)).then(() => setView('list'))}
				/>
			)}
		</div>
	);
}

// ============================ List view ============================

function ListView({ snap, peers, busy, spaceId, onOpenHistory, onReload, mutate }: {
	snap: Snapshot; peers: number; busy: boolean; spaceId: string;
	onOpenHistory: () => void; onReload: () => void;
	mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
	const [label, setLabel] = useState('');
	const [qty, setQty] = useState('');
	const [copied, setCopied] = useState(false);
	const items = snap.active.items;
	const remaining = items.filter((i) => !i.checked).length;
	const done = items.length - remaining;

	const add = () => {
		const l = label.trim();
		if (!l) return;
		setLabel(''); setQty('');
		void mutate(() => addItem(spaceId, l, qty.trim() || undefined));
	};

	const share = async () => {
		const url = window.location.href;
		try {
			if (navigator.share) { await navigator.share({ title: 'Liste de courses', url }); return; }
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch { /* cancelled */ }
	};

	// Unchecked first (keep order), checked sink to the bottom.
	const ordered = [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.sort - b.sort);

	return (
		<>
			<div className="co-head">
				<div className="co-title-row">
					<h1>Liste de courses</h1>
					{peers > 0 && <span className="co-peer" title="Une autre personne est connectée">● {peers + 1}</span>}
				</div>
				<div className="co-tools">
					<button className="co-btn" onClick={share}>{copied ? 'Lien copié ✓' : 'Partager'}</button>
					<button className="co-btn" onClick={onOpenHistory}>Historique</button>
					<button className="co-btn co-icon" onClick={onReload} title="Rafraîchir">↻</button>
				</div>
			</div>

			<div className="co-add">
				<input
					className="co-in co-in-label" placeholder="Ajouter un article…" value={label}
					onChange={(e) => setLabel(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && add()}
					enterKeyHint="done" autoComplete="off"
				/>
				<input
					className="co-in co-in-qty" placeholder="Qté" value={qty}
					onChange={(e) => setQty(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && add()}
					autoComplete="off"
				/>
				<button className="co-btn co-btn-primary" onClick={add} disabled={busy || !label.trim()}>+</button>
			</div>

			{items.length === 0 ? (
				<p className="co-empty">Liste vide. Ajoute ton premier article ci-dessus.</p>
			) : (
				<ul className="co-list">
					{ordered.map((it) => (
						<Row key={it.id} item={it} spaceId={spaceId} mutate={mutate} />
					))}
				</ul>
			)}

			<div className="co-foot">
				<span className="co-count">{remaining} à prendre{done > 0 ? ` · ${done} pris` : ''}</span>
				<div className="co-foot-actions">
					{done > 0 && (
						<button className="co-btn" onClick={() => mutate(() => clearChecked(spaceId, snap.active.id))} disabled={busy}>
							Retirer les articles pris
						</button>
					)}
					<button className="co-btn" onClick={() => mutate(() => newList(spaceId))} disabled={busy}>
						Nouvelle liste
					</button>
				</div>
			</div>
		</>
	);
}

function Row({ item, spaceId, mutate }: { item: CourseItem; spaceId: string; mutate: (fn: () => Promise<unknown>) => Promise<void> }) {
	return (
		<li className={`co-row${item.checked ? ' co-row-done' : ''}`}>
			<label className="co-check">
				<input
					type="checkbox" checked={item.checked}
					onChange={() => mutate(() => updateItem(spaceId, item.id, { checked: !item.checked }))}
				/>
				<span className="co-box" />
			</label>
			<span className="co-label">{item.label}</span>
			{item.qty && <span className="co-qty">{item.qty}</span>}
			<button className="co-del" title="Supprimer" onClick={() => mutate(() => deleteItem(spaceId, item.id))}>×</button>
		</li>
	);
}

// ============================ History ============================

function HistoryView({ history, onBack, onOpen }: {
	history: HistoryEntry[]; onBack: () => void; onOpen: (h: HistoryEntry) => void;
}) {
	return (
		<>
			<div className="co-head">
				<button className="co-btn co-icon" onClick={onBack} title="Retour">←</button>
				<h1>Historique</h1>
			</div>
			{history.length === 0 ? (
				<p className="co-empty">Aucune liste archivée pour l'instant. Une liste rejoint l'historique quand tu en démarres une nouvelle.</p>
			) : (
				<ul className="co-list">
					{history.map((h) => (
						<li key={h.id} className="co-hrow" onClick={() => onOpen(h)}>
							<div className="co-hmain">
								<span className="co-hlabel">{h.title || 'Liste de courses'}</span>
								<small>{fmtDate(h.archived_at)}</small>
							</div>
							<span className="co-hcount">{h.count} article{h.count > 1 ? 's' : ''} ›</span>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

function DetailView({ detail, onBack, onReuse, busy }: {
	detail: { id: string; title: string; items: CourseItem[] }; onBack: () => void; onReuse: () => void; busy: boolean;
}) {
	return (
		<>
			<div className="co-head">
				<button className="co-btn co-icon" onClick={onBack} title="Retour">←</button>
				<h1>{detail.title || 'Liste'}</h1>
			</div>
			<ul className="co-list">
				{detail.items.map((it) => (
					<li key={it.id} className="co-row co-row-static">
						<span className="co-label">{it.label}</span>
						{it.qty && <span className="co-qty">{it.qty}</span>}
					</li>
				))}
			</ul>
			<div className="co-foot">
				<span className="co-count">{detail.items.length} article{detail.items.length > 1 ? 's' : ''}</span>
				<button className="co-btn co-btn-primary" onClick={onReuse} disabled={busy}>
					Réutiliser cette liste
				</button>
			</div>
		</>
	);
}
