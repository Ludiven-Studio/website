import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	type Snapshot, type CourseItem, type Category, type HistoryEntry, type RecentSpace,
	createSpace, getSpace, getList, addItem, updateItem, deleteItem,
	clearChecked, newList, reuseList, reorderItems, renameList,
	addCategory, renameCategory, deleteCategory, reorderCategories,
	recentSpaces, rememberSpace, coursesEnabled,
} from '../../lib/courses';
import { joinSpace, type CoursesLink } from '../../games/courses/net';
import { useDragSort } from './useDragSort';

// Read/replace the ?l=<spaceId> secret in the URL without a full navigation.
const spaceFromUrl = (): string | null => new URLSearchParams(window.location.search).get('l');
function setUrlSpace(id: string): void {
	const url = new URL(window.location.href);
	url.searchParams.set('l', id);
	window.history.replaceState(null, '', url);
}

const fmtDate = (iso: string): string =>
	new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

// The uncategorised bucket has no uuid; 'none' is its stand-in in DOM attributes.
const NONE = 'none';
const zoneOf = (categoryId: string | null): string => categoryId ?? NONE;
const catOf = (zone: string): string | null => (zone === NONE ? null : zone);

type View = 'list' | 'history' | 'detail' | 'categories';

/** Collapsed sections are a per-device preference, not shared state. */
const collapseKey = (spaceId: string): string => `ludiven-courses-collapsed-${spaceId}`;
function readCollapsed(spaceId: string): Set<string> {
	try {
		const raw = localStorage.getItem(collapseKey(spaceId));
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch { return new Set(); }
}

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

	if (!spaceId) {
		return (
			<div className="co-root">
				<p className="co-intro">
					Une liste de courses partagée : ajoute des articles, envoie le lien à quelqu'un, et vous la
					cochez à deux en temps réel. Les articles se rangent par rayon et l'historique garde les
					anciennes listes pour les réutiliser.
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
					onOpenCategories={() => setView('categories')}
					onReload={() => reload(spaceId)}
					mutate={mutate}
				/>
			)}

			{view === 'categories' && (
				<CategoriesView
					snap={snap} spaceId={spaceId} busy={busy}
					onBack={() => setView('list')}
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
					detail={detail} categories={snap.categories}
					onBack={() => setView('history')}
					busy={busy}
					onReuse={() => mutate(() => reuseList(spaceId, detail.id)).then(() => setView('list'))}
				/>
			)}
		</div>
	);
}

// ============================ List view ============================

interface Section { id: string | null; name: string; items: CourseItem[] }

/** Group items into aisle sections, in aisle order, with the uncategorised
 *  bucket last. Empty aisles are kept: the list view shows their header so the
 *  layout never shifts when a drag starts. */
function buildSections(categories: Category[], items: CourseItem[]): Section[] {
	const byCat = new Map<string, CourseItem[]>();
	for (const it of items) {
		const k = zoneOf(it.category_id);
		if (!byCat.has(k)) byCat.set(k, []);
		byCat.get(k)!.push(it);
	}
	// Within a section, ticked items sink to the bottom but keep their relative order.
	const ordered = (list: CourseItem[]): CourseItem[] =>
		[...list].sort((a, b) => Number(a.checked) - Number(b.checked));

	const sections: Section[] = categories.map((c) => ({ id: c.id, name: c.name, items: ordered(byCat.get(c.id) ?? []) }));
	const loose = byCat.get(NONE) ?? [];
	if (loose.length) sections.push({ id: null, name: 'Sans catégorie', items: ordered(loose) });
	return sections;
}

function ListView({ snap, peers, busy, spaceId, onOpenHistory, onOpenCategories, onReload, mutate }: {
	snap: Snapshot; peers: number; busy: boolean; spaceId: string;
	onOpenHistory: () => void; onOpenCategories: () => void; onReload: () => void;
	mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
	const [label, setLabel] = useState('');
	const [qty, setQty] = useState('');
	const [copied, setCopied] = useState(false);
	const [editing, setEditing] = useState<CourseItem | null>(null);
	const [naming, setNaming] = useState(false);
	const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(spaceId));
	// While dragging we render from this local copy so the row follows the finger;
	// null means "just use the server snapshot".
	const [draft, setDraft] = useState<CourseItem[] | null>(null);

	const items = draft ?? snap.active.items;
	const sections = useMemo(() => buildSections(snap.categories, items), [snap.categories, items]);
	// Empty aisles would be eight dead headers on a fresh list, so they live in a
	// compact strip under the list instead — still droppable, no wasted screen.
	const filled = sections.filter((s) => s.items.length);
	const emptyAisles = sections.filter((s) => !s.items.length);
	const remaining = items.filter((i) => !i.checked).length;
	const done = items.length - remaining;

	const toggleCollapse = (key: string): void => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key); else next.add(key);
			try { localStorage.setItem(collapseKey(spaceId), JSON.stringify([...next])); } catch { /* ignore */ }
			return next;
		});
	};

	// ---- drag & drop ----
	const moveBeside = (draggedId: string, targetId: string, before: boolean): void => {
		setDraft((cur) => {
			const arr = [...(cur ?? snap.active.items)];
			const from = arr.findIndex((i) => i.id === draggedId);
			if (from < 0) return arr;
			const [d] = arr.splice(from, 1);
			const to = arr.findIndex((i) => i.id === targetId);
			if (to < 0) return arr;
			arr.splice(before ? to : to + 1, 0, { ...d, category_id: arr[to].category_id });
			return arr;
		});
	};
	const moveIntoZone = (draggedId: string, zone: string): void => {
		setDraft((cur) => {
			const arr = [...(cur ?? snap.active.items)];
			const from = arr.findIndex((i) => i.id === draggedId);
			if (from < 0) return arr;
			const target = catOf(zone);
			const [d] = arr.splice(from, 1);
			const at = arr.findIndex((i) => i.category_id === target);
			arr.splice(at < 0 ? arr.length : at, 0, { ...d, category_id: target });
			return arr;
		});
	};
	const commitDrag = (draggedId: string): void => {
		const arr = draft;
		setDraft(null);
		if (!arr) return;
		const moved = arr.find((i) => i.id === draggedId);
		if (!moved) return;
		// Persist the destination aisle's whole order; items left behind keep theirs.
		const ids = arr.filter((i) => i.category_id === moved.category_id).map((i) => i.id);
		void mutate(() => reorderItems(spaceId, moved.category_id, ids));
	};
	const { draggingId, handleProps } = useDragSort({
		onHoverRow: moveBeside, onHoverZone: moveIntoZone, onDrop: commitDrag,
	});

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

	return (
		<>
			<div className="co-head">
				<div className="co-title-row">
					<h1>
						<button className="co-title-btn" onClick={() => setNaming(true)} title="Renommer la liste">
							{snap.active.title || 'Liste de courses'}
						</button>
					</h1>
					{peers > 0 && <span className="co-peer" title="Une autre personne est connectée">● {peers + 1}</span>}
				</div>
				<div className="co-tools">
					<button className="co-btn" onClick={share}>{copied ? 'Lien copié ✓' : 'Partager'}</button>
					<button className="co-btn" onClick={onOpenCategories}>Rayons</button>
					<button className="co-btn" onClick={onOpenHistory}>Historique</button>
					<button className="co-btn co-icon" onClick={onReload} title="Rafraîchir" aria-label="Rafraîchir">↻</button>
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
				<div className="co-sections">
					{filled.map((s) => {
						const key = zoneOf(s.id);
						const isCollapsed = collapsed.has(key);
						const taken = s.items.filter((i) => i.checked).length;
						return (
							<section className="co-sec" key={key}>
								<button
									className={['co-sec-head', isCollapsed ? 'co-sec-collapsed' : '', draggingId ? 'co-sec-drop' : ''].filter(Boolean).join(' ')}
									data-drop-zone={key}
									onClick={() => toggleCollapse(key)}
								>
									<span className="co-caret">{isCollapsed ? '▸' : '▾'}</span>
									<span className="co-sec-name">{s.name}</span>
									<span className="co-sec-count">
										{taken > 0 && (taken === s.items.length ? '✓ ' : `${taken} pris · `)}
										{s.items.length}
									</span>
								</button>
								{!isCollapsed && (
									<ul className="co-list">
										{s.items.map((it) => (
											<Row
												key={it.id} item={it} spaceId={spaceId} mutate={mutate}
												dragging={draggingId === it.id}
												handleProps={handleProps}
												onEdit={() => setEditing(it)}
											/>
										))}
									</ul>
								)}
							</section>
						);
					})}
				</div>
			)}

			{emptyAisles.length > 0 && items.length > 0 && (
				<div className={`co-shelf${draggingId ? ' co-shelf-active' : ''}`}>
					<span className="co-shelf-title">{draggingId ? 'Déposer dans…' : 'Rayons vides'}</span>
					<div className="co-chips">
						{emptyAisles.map((s) => (
							<span className="co-chip" key={zoneOf(s.id)} data-drop-zone={zoneOf(s.id)}>{s.name}</span>
						))}
					</div>
				</div>
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

			{naming && (
				<RenameSheet
					heading="Renommer la liste" value={snap.active.title} busy={busy}
					onClose={() => setNaming(false)}
					onSave={async (n) => { await mutate(() => renameList(spaceId, snap.active.id, n)); setNaming(false); }}
				/>
			)}

			{editing && (
				<ItemEditor
					item={editing} categories={snap.categories} spaceId={spaceId} busy={busy}
					onClose={() => setEditing(null)} mutate={mutate}
				/>
			)}
		</>
	);
}

function Row({ item, spaceId, mutate, dragging, handleProps, onEdit }: {
	item: CourseItem; spaceId: string; mutate: (fn: () => Promise<unknown>) => Promise<void>;
	dragging: boolean; handleProps: (id: string) => { onPointerDown: (e: React.PointerEvent) => void };
	onEdit: () => void;
}) {
	return (
		<li className={`co-row${item.checked ? ' co-row-done' : ''}${dragging ? ' co-dragging' : ''}`} data-drag-id={item.id}>
			<span className="co-grip" title="Déplacer" aria-hidden="true" {...handleProps(item.id)}>≡</span>
			<label className="co-check">
				<input
					type="checkbox" checked={item.checked}
					onChange={() => mutate(() => updateItem(spaceId, item.id, { checked: !item.checked }))}
				/>
				<span className="co-box" />
			</label>
			<button className="co-main co-label-btn" onClick={onEdit} aria-label={`Modifier ${item.label}`}>
				<span className="co-label">{item.label}</span>
				<span className={`co-qty${item.qty ? '' : ' co-qty-empty'}`}>{item.qty || '+ qté'}</span>
				<span className="co-pencil" aria-hidden="true">✎</span>
			</button>
			<button
				className="co-del" title="Supprimer" aria-label={`Supprimer ${item.label}`}
				onClick={() => mutate(() => deleteItem(spaceId, item.id))}
			>×</button>
		</li>
	);
}

/** Tap an item to rename it, set its quantity, or file it in an aisle. Filing
 *  here is what teaches the space where that label belongs next time. */
function ItemEditor({ item, categories, spaceId, busy, onClose, mutate }: {
	item: CourseItem; categories: Category[]; spaceId: string; busy: boolean;
	onClose: () => void; mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
	const [label, setLabel] = useState(item.label);
	const [qty, setQty] = useState(item.qty ?? '');
	const [categoryId, setCategoryId] = useState<string>(zoneOf(item.category_id));

	const save = async () => {
		const l = label.trim();
		if (!l) return;
		await mutate(() => updateItem(spaceId, item.id, { label: l, qty, categoryId: catOf(categoryId) }));
		onClose();
	};

	return (
		<div className="co-modal" onClick={onClose}>
			<div className="co-sheet" onClick={(e) => e.stopPropagation()}>
				<h2>Modifier l'article</h2>
				<label className="co-field">
					<span>Nom</span>
					<input className="co-in" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
				</label>
				<label className="co-field">
					<span>Quantité</span>
					<input className="co-in" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2, 500 g, 1 pack…" />
				</label>
				<label className="co-field">
					<span>Rayon</span>
					<select className="co-in" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
						<option value={NONE}>Sans catégorie</option>
						{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
					</select>
				</label>
				<p className="co-note">Le rayon choisi est retenu : la prochaine fois que tu ajoutes « {label.trim() || item.label} », il s'y rangera tout seul.</p>
				<div className="co-sheet-actions">
					<button className="co-btn" onClick={onClose}>Annuler</button>
					<button className="co-btn co-btn-primary" onClick={save} disabled={busy || !label.trim()}>Enregistrer</button>
				</div>
			</div>
		</div>
	);
}

// ============================ Aisles ============================

function CategoriesView({ snap, spaceId, busy, onBack, mutate }: {
	snap: Snapshot; spaceId: string; busy: boolean; onBack: () => void;
	mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
	const [name, setName] = useState('');
	const [draft, setDraft] = useState<Category[] | null>(null);
	const [renaming, setRenaming] = useState<Category | null>(null);
	const cats = draft ?? snap.categories;

	const moveBeside = (draggedId: string, targetId: string, before: boolean): void => {
		setDraft((cur) => {
			const arr = [...(cur ?? snap.categories)];
			const from = arr.findIndex((c) => c.id === draggedId);
			if (from < 0) return arr;
			const [d] = arr.splice(from, 1);
			const to = arr.findIndex((c) => c.id === targetId);
			if (to < 0) return arr;
			arr.splice(before ? to : to + 1, 0, d);
			return arr;
		});
	};
	const commitDrag = (): void => {
		const arr = draft;
		setDraft(null);
		if (arr) void mutate(() => reorderCategories(spaceId, arr.map((c) => c.id)));
	};
	const { draggingId, handleProps } = useDragSort({
		onHoverRow: moveBeside, onHoverZone: () => { /* no zones here */ }, onDrop: commitDrag,
	});

	const add = () => {
		const n = name.trim();
		if (!n) return;
		setName('');
		void mutate(() => addCategory(spaceId, n));
	};

	return (
		<>
			<div className="co-head">
				<button className="co-btn co-icon" onClick={onBack} title="Retour" aria-label="Retour">←</button>
				<h1>Rayons</h1>
			</div>
			<p className="co-intro">
				Mets-les dans l'ordre où tu traverses ton magasin : la liste suivra. Attrape ≡ pour déplacer.
			</p>

			<div className="co-add">
				<input
					className="co-in co-in-label" placeholder="Nouveau rayon…" value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && add()}
					enterKeyHint="done" autoComplete="off"
				/>
				<button className="co-btn co-btn-primary" onClick={add} disabled={busy || !name.trim()}>+</button>
			</div>

			<ul className="co-list">
				{cats.map((c) => (
					<li className={`co-row${draggingId === c.id ? ' co-dragging' : ''}`} key={c.id} data-drag-id={c.id}>
						<span className="co-grip" title="Déplacer" aria-hidden="true" {...handleProps(c.id)}>≡</span>
						<button className="co-label co-label-btn" onClick={() => setRenaming(c)}>{c.name}</button>
						<button
							className="co-del" title="Supprimer" aria-label={`Supprimer le rayon ${c.name}`}
							onClick={() => mutate(() => deleteCategory(spaceId, c.id))}
						>×</button>
					</li>
				))}
			</ul>
			<p className="co-note">
				Supprimer un rayon ne supprime pas ses articles : ils repassent dans « Sans catégorie ».
			</p>

			{renaming && (
				<RenameSheet
					heading="Renommer le rayon" value={renaming.name} busy={busy}
					onClose={() => setRenaming(null)}
					onSave={async (n) => { await mutate(() => renameCategory(spaceId, renaming.id, n)); setRenaming(null); }}
				/>
			)}
		</>
	);
}

export function RenameSheet({ heading, value, busy, onClose, onSave }: {
	heading: string; value: string; busy: boolean; onClose: () => void; onSave: (name: string) => void;
}) {
	const [name, setName] = useState(value);
	return (
		<div className="co-modal" onClick={onClose}>
			<div className="co-sheet" onClick={(e) => e.stopPropagation()}>
				<h2>{heading}</h2>
				<label className="co-field">
					<span>Nom</span>
					<input
						className="co-in" value={name} autoFocus
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
					/>
				</label>
				<div className="co-sheet-actions">
					<button className="co-btn" onClick={onClose}>Annuler</button>
					<button className="co-btn co-btn-primary" onClick={() => onSave(name.trim())} disabled={busy || !name.trim()}>
						Enregistrer
					</button>
				</div>
			</div>
		</div>
	);
}

// ============================ History ============================

function HistoryView({ history, onBack, onOpen }: {
	history: HistoryEntry[]; onBack: () => void; onOpen: (h: HistoryEntry) => void;
}) {
	return (
		<>
			<div className="co-head">
				<button className="co-btn co-icon" onClick={onBack} title="Retour" aria-label="Retour">←</button>
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

function DetailView({ detail, categories, onBack, onReuse, busy }: {
	detail: { id: string; title: string; items: CourseItem[] }; categories: Category[];
	onBack: () => void; onReuse: () => void; busy: boolean;
}) {
	const sections = buildSections(categories, detail.items).filter((s) => s.items.length);
	return (
		<>
			<div className="co-head">
				<button className="co-btn co-icon" onClick={onBack} title="Retour" aria-label="Retour">←</button>
				<h1>{detail.title || 'Liste'}</h1>
			</div>
			<div className="co-sections">
				{sections.map((s) => (
					<section className="co-sec" key={zoneOf(s.id)}>
						<div className="co-sec-head co-sec-static">
							<span className="co-sec-name">{s.name}</span>
							<span className="co-sec-count">{s.items.length}</span>
						</div>
						<ul className="co-list">
							{s.items.map((it) => (
								<li key={it.id} className="co-row co-row-static">
									<span className="co-label">{it.label}</span>
									{it.qty && <span className="co-qty">{it.qty}</span>}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
			<div className="co-foot">
				<span className="co-count">{detail.items.length} article{detail.items.length > 1 ? 's' : ''}</span>
				<button className="co-btn co-btn-primary" onClick={onReuse} disabled={busy}>
					Réutiliser cette liste
				</button>
			</div>
		</>
	);
}
