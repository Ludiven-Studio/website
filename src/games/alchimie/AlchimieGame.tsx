import { useState, useEffect, useRef, useCallback } from 'react';
import { ELEMENTS, BASE_IDS, TOTAL, combine, getElement, type Element } from './engine';
import { trackGame } from '../../lib/analytics';

/* =====================================================
   ALCHIMIE — React island. Little-Alchemy-like: drag elements onto the workbench and drop one
   onto another to fuse them. ~150 elements to discover from 5 bases. Progress persists locally.
   Engine (element tree + combine) is pure/tested in ./engine.
   ===================================================== */

const STORE_KEY = 'ludiven-alchimie-discovered';
const TOKEN = 74; // token diameter (px)
const HIT = 52; // drop-overlap radius (px)

interface Token { tid: number; id: string; x: number; y: number; } // x,y = board-local centre

const loadDiscovered = (): string[] => {
	try {
		const raw = localStorage.getItem(STORE_KEY);
		const arr = raw ? (JSON.parse(raw) as string[]) : [];
		const seen = new Set<string>();
		const out: string[] = [];
		for (const id of [...BASE_IDS, ...arr]) if (getElement(id) && !seen.has(id)) { seen.add(id); out.push(id); }
		return out;
	} catch { return [...BASE_IDS]; }
};

export default function AlchimieGame({ gameId }: { gameId: string }) {
	const [discovered, setDiscovered] = useState<string[]>(() => (typeof window === 'undefined' ? [...BASE_IDS] : loadDiscovered()));
	const [tokens, setTokens] = useState<Token[]>([]);
	const [search, setSearch] = useState('');
	const [reveal, setReveal] = useState<Element | null>(null);
	const [toast, setToast] = useState<string>('');
	const [draggingTid, setDraggingTid] = useState<number | null>(null);
	const [pulseId, setPulseId] = useState<string>('');

	const boardRef = useRef<HTMLDivElement | null>(null);
	const floatRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{ id: string; sourceTid: number | null } | null>(null);
	const tokenSeq = useRef(1);
	const tokensRef = useRef<Token[]>([]);
	const discoveredSet = useRef(new Set(discovered));

	useEffect(() => { tokensRef.current = tokens; }, [tokens]);
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => { discoveredSet.current = new Set(discovered); }, [discovered]);
	useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(discovered)); } catch { /* ignore */ } }, [discovered]);

	const flash = useCallback((text: string) => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		setToast(text);
		toastTimer.current = setTimeout(() => setToast(''), 1600);
	}, []);

	const showReveal = useCallback((el: Element) => {
		if (revealTimer.current) clearTimeout(revealTimer.current);
		setReveal(el);
		revealTimer.current = setTimeout(() => setReveal(null), 2200);
	}, []);

	/* ---- Combine resolution when a token is dropped (computed off a ref, no nested setState) ---- */
	const resolveDrop = useCallback((dragId: string, sourceTid: number | null, bx: number, by: number, onBoard: boolean) => {
		const cur = tokensRef.current;
		if (!onBoard) { setTokens(cur.filter((t) => t.tid !== sourceTid)); return; } // dropped off the board → remove
		const target = cur.find((t) => t.tid !== sourceTid && Math.hypot(t.x - bx, t.y - by) < HIT);
		if (!target) {
			if (sourceTid != null) setTokens(cur.map((t) => (t.tid === sourceTid ? { ...t, x: bx, y: by } : t)));
			else setTokens([...cur, { tid: tokenSeq.current++, id: dragId, x: bx, y: by }]); // new token from inventory
			return;
		}
		const product = combine(dragId, target.id);
		if (!product) {
			flash('Rien ne se passe…');
			if (sourceTid != null) setTokens(cur.map((t) => (t.tid === sourceTid ? { ...t, x: bx, y: by } : t)));
			return;
		}
		// success: consume both, drop the product where they met
		const rest = cur.filter((t) => t.tid !== sourceTid && t.tid !== target.tid);
		const el = getElement(product)!;
		if (!discoveredSet.current.has(product)) {
			discoveredSet.current.add(product);
			setDiscovered((d) => [...d, product]);
			setPulseId(product);
			setTimeout(() => setPulseId(''), 950);
			showReveal(el);
			trackGame(gameId, 'discovery', { element: product, total: discoveredSet.current.size });
		} else {
			flash(`${el.emoji} ${el.name} · déjà connu`);
		}
		setTokens([...rest, { tid: tokenSeq.current++, id: product, x: target.x, y: target.y }]);
	}, [flash, showReveal, gameId]);

	/* ---- Pointer drag (works for mouse + touch) ---- */
	const startDrag = useCallback((id: string, sourceTid: number | null, ev: React.PointerEvent) => {
		ev.preventDefault();
		dragRef.current = { id, sourceTid };
		if (sourceTid != null) setDraggingTid(sourceTid);
		const el = getElement(id)!;
		const fl = floatRef.current;
		if (fl) {
			fl.textContent = el.emoji;
			fl.style.display = 'flex';
			fl.style.left = `${ev.clientX}px`;
			fl.style.top = `${ev.clientY}px`;
		}
		const move = (e: PointerEvent) => {
			if (!floatRef.current) return;
			floatRef.current.style.left = `${e.clientX}px`;
			floatRef.current.style.top = `${e.clientY}px`;
		};
		const up = (e: PointerEvent) => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			if (floatRef.current) floatRef.current.style.display = 'none';
			const drag = dragRef.current;
			dragRef.current = null;
			setDraggingTid(null);
			if (!drag) return;
			const rect = boardRef.current?.getBoundingClientRect();
			const inside = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
			const bx = rect ? e.clientX - rect.left : 0;
			const by = rect ? e.clientY - rect.top : 0;
			resolveDrop(drag.id, drag.sourceTid, bx, by, inside);
		};
		window.addEventListener('pointermove', move, { passive: false });
		window.addEventListener('pointerup', up);
	}, [resolveDrop]);

	/* Tap an inventory item → drop it near the middle of the board (cascade so they don't stack). */
	const spawnToBoard = useCallback((id: string) => {
		const rect = boardRef.current?.getBoundingClientRect();
		const w = rect?.width ?? 320, h = rect?.height ?? 360;
		const n = tokenSeq.current;
		const x = w / 2 + ((n * 37) % 120) - 60;
		const y = h / 2 + ((n * 53) % 100) - 50;
		setTokens((prev) => [...prev, { tid: tokenSeq.current++, id, x: Math.max(TOKEN / 2, x), y: Math.max(TOKEN / 2, y) }]);
	}, []);

	const hint = useCallback(() => {
		const set = discoveredSet.current;
		const options = ELEMENTS.filter((el) => el.recipe && !set.has(el.id) && set.has(el.recipe[0]) && set.has(el.recipe[1]));
		if (options.length === 0) { flash(discovered.length >= TOTAL ? 'Tout est découvert ! 🎉' : 'Combine encore pour ouvrir de nouvelles pistes'); return; }
		const pick = options[Math.floor(Math.random() * options.length)];
		const a = getElement(pick.recipe![0])!, b = getElement(pick.recipe![1])!;
		flash(`💡 Essaie ${a.emoji} + ${b.emoji}`);
	}, [discovered.length, flash]);

	const clearBoard = useCallback(() => setTokens([]), []);
	const resetAll = useCallback(() => {
		if (!window.confirm('Effacer toutes tes découvertes et repartir des 5 éléments de base ?')) return;
		setTokens([]); setDiscovered([...BASE_IDS]); discoveredSet.current = new Set(BASE_IDS); setSearch('');
	}, []);

	useEffect(() => { trackGame(gameId, 'game_started'); }, [gameId]);

	const q = search.trim().toLowerCase();
	const invList = discovered.map((id) => getElement(id)!).filter((el) => !q || el.name.toLowerCase().includes(q));

	return (
		<div className="al-root">
			<style>{CSS}</style>

			<div className="al-bar">
				<span className="al-count"><b>{discovered.length}</b> / {TOTAL} découverts</span>
				<div className="al-actions">
					<button className="al-btn" onClick={hint}>💡 Indice</button>
					<button className="al-btn" onClick={clearBoard}>🧹 Vider l'établi</button>
					<button className="al-btn ghost" onClick={resetAll}>↻</button>
				</div>
			</div>

			<div className="al-progress"><span style={{ width: `${(discovered.length / TOTAL) * 100}%` }} /></div>

			<div className="al-stage">
				<div className="al-board" ref={boardRef}>
					{tokens.length === 0 && <div className="al-board-hint">Glisse deux éléments ici et lâche l'un sur l'autre pour les fusionner ✨</div>}
					{tokens.map((t) => {
						const el = getElement(t.id)!;
						return (
							<button
								key={t.tid}
								className={`al-token${draggingTid === t.tid ? ' dragging' : ''}`}
								style={{ left: t.x, top: t.y }}
								onPointerDown={(ev) => startDrag(t.id, t.tid, ev)}
								onDoubleClick={() => setTokens((prev) => prev.filter((x) => x.tid !== t.tid))}
								title={`${el.name} — double-clic pour retirer`}
							>
								<span className="al-emo">{el.emoji}</span>
								<span className="al-name">{el.name}</span>
							</button>
						);
					})}

					{reveal && (
						<div className="al-reveal" onClick={() => setReveal(null)}>
							<div className="al-reveal-card">
								<div className="al-spark">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 30}deg` }} />)}</div>
								<div className="al-reveal-emo">{reveal.emoji}</div>
								<div className="al-reveal-new">Nouveau&nbsp;!</div>
								<div className="al-reveal-name">{reveal.name}</div>
							</div>
						</div>
					)}
					{toast && <div className="al-toast">{toast}</div>}
				</div>

				<div className="al-inv">
					<input className="al-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un élément…" />
					<div className="al-grid">
						{invList.map((el) => (
							<button
								key={el.id}
								className={`al-card${pulseId === el.id ? ' pulse' : ''}${BASE_IDS.includes(el.id) ? ' base' : ''}`}
								onPointerDown={(ev) => startDrag(el.id, null, ev)}
								onClick={() => spawnToBoard(el.id)}
								title={el.name}
							>
								<span className="al-emo">{el.emoji}</span>
								<span className="al-name">{el.name}</span>
							</button>
						))}
						{invList.length === 0 && <p className="al-empty">Aucun élément ne correspond.</p>}
					</div>
				</div>
			</div>

			<div ref={floatRef} className="al-float" style={{ display: 'none' }} />

			<p className="al-help">
				Pars des 5 éléments de base et <strong>combine-les 2 par 2</strong> pour en débloquer ~{TOTAL}.
				Glisse une carte sur l'établi puis lâche-la sur une autre pour tenter une fusion — ou tape une carte pour la poser.
				Bloqué&nbsp;? Le bouton <strong>Indice</strong> te souffle une combinaison possible.
			</p>
		</div>
	);
}

const CSS = `
.al-root { --al-accent: var(--accent-regular); width: 100%; max-width: 900px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; }
.al-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
.al-count { font-size: 15px; font-weight: 600; color: var(--gray-100); }
.al-count b { color: var(--al-accent); font-size: 20px; font-variant-numeric: tabular-nums; }
.al-actions { display: flex; gap: 6px; }
.al-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.al-btn:hover { border-color: var(--al-accent); color: var(--al-accent); }
.al-btn.ghost { padding: 6px 12px; }
.al-progress { height: 6px; background: var(--gray-900); border-radius: 999px; overflow: hidden; margin-bottom: 0.8rem; }
.al-progress span { display: block; height: 100%; background: linear-gradient(90deg, var(--al-accent), #c8b6ff); border-radius: 999px; transition: width 0.4s ease; }

.al-stage { display: grid; grid-template-columns: 1fr 320px; gap: 14px; }
@media (max-width: 720px) { .al-stage { grid-template-columns: 1fr; } }

.al-board {
  position: relative; min-height: 440px; border-radius: 18px; overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(160,140,255,0.16), transparent 60%),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 26px),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 26px),
    linear-gradient(160deg, #241b3a, #1a1730 60%, #201a37);
  border: 1px solid var(--gray-800); touch-action: none;
}
.al-board-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 30px; color: rgba(255,255,255,0.6); font-size: 14px; pointer-events: none; }

.al-token, .al-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  border-radius: 14px; cursor: grab; font: inherit; user-select: none; -webkit-user-select: none; touch-action: none;
}
.al-token { position: absolute; width: ${TOKEN}px; height: ${TOKEN}px; transform: translate(-50%, -50%); box-shadow: 0 4px 14px rgba(0,0,0,0.4); animation: al-pop 0.22s ease; z-index: 1; }
.al-token.dragging { opacity: 0; }
.al-token:active { cursor: grabbing; }
.al-emo { font-size: 26px; line-height: 1; }
.al-name { font-size: 10.5px; font-weight: 600; color: var(--gray-200); max-width: 68px; text-align: center; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.al-inv { display: flex; flex-direction: column; min-height: 0; }
.al-search { width: 100%; box-sizing: border-box; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-size: 14px; border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; }
.al-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 7px; max-height: 440px; overflow-y: auto; padding: 2px; align-content: start; }
@media (max-width: 720px) { .al-grid { max-height: 300px; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); } }
.al-card { width: 100%; aspect-ratio: 1; padding: 4px; }
.al-card.base { border-color: var(--al-accent); }
.al-card:hover { border-color: var(--al-accent); transform: translateY(-1px); }
.al-card.pulse { animation: al-pulse 0.9s ease; border-color: #c8b6ff; }
.al-empty { grid-column: 1 / -1; color: var(--gray-400); font-size: 13px; text-align: center; padding: 20px 0; }

.al-float { position: fixed; z-index: 50; width: ${TOKEN}px; height: ${TOKEN}px; margin-left: -${TOKEN / 2}px; margin-top: -${TOKEN / 2}px; align-items: center; justify-content: center; font-size: 30px; pointer-events: none; border-radius: 14px; background: var(--gray-999); border: 1.5px solid var(--al-accent); box-shadow: 0 8px 22px rgba(0,0,0,0.5); }

.al-toast { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: rgba(20,16,34,0.92); border: 1px solid rgba(255,255,255,0.25); color: #fff; font-size: 13.5px; font-weight: 600; padding: 7px 16px; border-radius: 999px; white-space: nowrap; animation: al-pop 0.2s ease; }

.al-reveal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 20; background: rgba(10,8,20,0.45); backdrop-filter: blur(2px); cursor: pointer; }
.al-reveal-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px 34px; border-radius: 20px; background: linear-gradient(160deg, #2a2150, #1c1836); border: 2px solid var(--al-accent); box-shadow: 0 0 44px rgba(160,140,255,0.5); animation: al-reveal 0.5s cubic-bezier(0.2,1.4,0.4,1); }
.al-reveal-emo { font-size: 62px; line-height: 1; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
.al-reveal-new { font-family: var(--font-brand); font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #c8b6ff; }
.al-reveal-name { font-family: var(--font-brand); font-weight: 700; font-size: 24px; color: #fff; }
.al-spark { position: absolute; inset: 0; pointer-events: none; }
.al-spark i { position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; border-radius: 50%; background: #f5d76e; transform: rotate(var(--a)) translateY(0); animation: al-spark 0.7s ease-out forwards; }

@keyframes al-pop { from { transform: translate(-50%, -50%) scale(0.6); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
@keyframes al-pulse { 0% { transform: scale(1); } 40% { transform: scale(1.18); box-shadow: 0 0 18px rgba(200,182,255,0.7); } 100% { transform: scale(1); } }
@keyframes al-reveal { from { transform: scale(0.5) rotate(-6deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes al-spark { to { transform: rotate(var(--a)) translateY(-70px) scale(0.2); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .al-token, .al-card.pulse, .al-reveal-card, .al-spark i, .al-toast { animation: none; } }
`;
