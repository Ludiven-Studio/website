/* The pétanque shop: boules whose make plays, jacks and decors, paid in cocoins. The app's MenuShop
   on the site's shared popup: a list per kind, and a sheet per item (the boule turning in 3D). */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GameModal from '../../components/GameModal';
import Cocoin from '../../components/Cocoin';
import { balance, WALLET_EVENT } from '../../lib/wallet';
import { trackEvent } from '../../lib/analytics';
import { CATALOG, buyItem, equip, ownsItem, traits, type Equipped, type ItemKind, type ShopItem } from './shop';
import { previewUrl } from './bouleLook';
import { makeBouleMesh } from './render3d';
import type { Strings } from './i18n';

const KINDS: ItemKind[] = ['boule', 'jack', 'decor'];

interface Props {
	t: Strings;
	equipped: Equipped;
	onEquip: (next: Equipped, it: ShopItem) => void;
	onClose: () => void;
	/** The daily is on: its board plays every boule as the standard one. */
	daily: boolean;
}

const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** The row's picture: the boule drawn by hand, the jack as a shaded disc, the decor's photo. */
function Thumb({ it, size }: { it: ShopItem; size: number }) {
	if (it.model) return <img className="ps-thumb" src={previewUrl(it.model, size * 2)} width={size} height={size} alt="" />;
	if (it.color !== undefined) {
		const c = hexOf(it.color);
		return <span className="ps-thumb ps-jack" style={{ width: size * 0.62, height: size * 0.62, background: `radial-gradient(circle at 34% 30%, #fff8 0, ${c} 32%, ${c} 58%, #0006 100%)` }} />;
	}
	return <DecorPic id={it.decor ?? 'jardin'} w={size * 1.6} h={size} />;
}

/** The decor's picture, or a plain tile while it is missing (offline before the cache has it). */
function DecorPic({ id, w, h }: { id: string; w: number; h: number }) {
	const [bad, setBad] = useState(false);
	if (bad) return <span className="ps-thumb ps-decorpic" style={{ width: w, height: h }} />;
	return <img className="ps-thumb ps-decorpic" src={`/assets/jeux/petanque/decor/preview-${id}.webp`} width={w} height={h} alt="" onError={() => setBad(true)} />;
}

/** The sheet's boule, turning on itself under a studio light. Its own small renderer, made when the
 *  sheet opens and dropped when it closes: the game's canvas stays untouched. */
function BouleSpin({ it }: { it: ShopItem }) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	useEffect(() => {
		const cv = ref.current;
		if (!cv || !it.model) return;
		let renderer: THREE.WebGLRenderer;
		try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { return; }
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.setSize(cv.clientWidth, cv.clientHeight, false);
		const scene = new THREE.Scene();
		const pm = new THREE.PMREMGenerator(renderer);
		const env = pm.fromScene(new RoomEnvironment(), 0.04);
		pm.dispose();
		const mesh = makeBouleMesh(0, it.model, 0.0375);
		const mat = mesh.material as THREE.MeshStandardMaterial;
		mat.envMap = env.texture;
		mat.envMapIntensity = 1;
		scene.add(mesh);
		const key = new THREE.DirectionalLight(0xffffff, 2.2);
		key.position.set(-1, 1.2, 1.4);
		scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));
		const cam = new THREE.PerspectiveCamera(30, cv.clientWidth / Math.max(1, cv.clientHeight), 0.01, 10);
		cam.position.set(0, 0.06, 0.16);
		cam.lookAt(0, 0, 0);
		mesh.rotation.x = 0.5;
		let raf = 0;
		const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const draw = (ms: number): void => {
			mesh.rotation.y = still ? 0.6 : ms * 0.0007;
			renderer.render(scene, cam);
			if (!still) raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => {
			cancelAnimationFrame(raf);
			mesh.geometry.dispose();
			mat.dispose(); // the look's textures are shared with the game: never disposed here
			env.dispose();
			renderer.dispose();
		};
	}, [it]);
	return <canvas ref={ref} className="ps-spin" aria-hidden="true" />;
}

export default function ShopPanel({ t, equipped, onEquip, onClose, daily }: Props) {
	const s = t.shop;
	const [kind, setKind] = useState<ItemKind>('boule');
	const [sheet, setSheet] = useState<ShopItem | null>(null);
	const [coins, setCoins] = useState(balance);
	const [bought, setBought] = useState<string | null>(null);
	const bodyRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const on = (): void => setCoins(balance());
		window.addEventListener(WALLET_EVENT, on);
		window.addEventListener('storage', on);
		return () => { window.removeEventListener(WALLET_EVENT, on); window.removeEventListener('storage', on); };
	}, []);

	useEffect(() => {
		if (!bought) return undefined;
		const id = setTimeout(() => setBought(null), 1800);
		return () => clearTimeout(id);
	}, [bought]);

	// A new tab or a sheet starts at the top of the list, not wherever the last one was scrolled.
	useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [kind, sheet]);

	const wear = useCallback((it: ShopItem) => {
		const next = equip(equipped, it);
		if (!next) return;
		trackEvent('petanque:equip', { item: it.id });
		onEquip(next, it);
	}, [equipped, onEquip]);

	const buy = useCallback((it: ShopItem) => {
		if (!buyItem(it)) return;
		trackEvent('cocottes:buy_petanque', { item: it.id, price: it.price });
		setCoins(balance());
		setBought(it.id);
		wear(it); // as in the app: a purchase is worn at once
	}, [wear]);

	const name = (it: ShopItem): string => s.items[it.id] ?? it.id;

	/** Buy, wear, or say it is worn: one button per item, the same on the row and on the sheet. */
	const action = (it: ShopItem, big = false) => {
		const has = ownsItem(it);
		const on = equipped[it.kind] === it.id;
		if (has) {
			return (
				<button type="button" className={`ps-act ${on ? 'on' : ''}${big ? ' big' : ''}`} disabled={on}
					onClick={(e) => { e.stopPropagation(); wear(it); }}>
					{bought === it.id ? s.bought : on ? s.equipped : s.equip}
				</button>
			);
		}
		const short = it.price - coins;
		return (
			<span className="ps-buywrap">
				<button type="button" className={`ps-act buy${big ? ' big' : ''}`} disabled={short > 0}
					aria-label={s.buyAria(name(it), it.price)}
					onClick={(e) => { e.stopPropagation(); buy(it); }}>
					{s.buy} {it.price} <Cocoin size={14} />
				</button>
				{short > 0 && <em className="ps-short">{s.short(short)}</em>}
			</span>
		);
	};

	const makeLine = (it: ShopItem): string | null =>
		it.model ? s.make(it.model.grams, it.model.mm, s.hardness[it.model.hardness]) : null;

	const items = CATALOG.filter((it) => it.kind === kind);
	const note = kind === 'boule' ? s.note : kind === 'jack' ? s.jackNote : s.decorNote;

	return (
		<GameModal title={s.title} onClose={onClose} closeLabel={t.close} width={560} bodyRef={bodyRef}>
			<style>{CSS}</style>
			<div className="ps-wallet"><Cocoin size={18} /> <strong>{coins}</strong> <span>{s.balance}</span></div>
			{sheet ? (
				<div className="ps-sheet">
					<button type="button" className="ps-back" onClick={() => setSheet(null)}>‹ {t.back}</button>
					<h4>{name(sheet)}</h4>
					{sheet.model ? <BouleSpin it={sheet} /> : <span className="ps-sheetpic"><Thumb it={sheet} size={sheet.decor ? 180 : 120} /></span>}
					{sheet.model && <p className="ps-make">{makeLine(sheet)}</p>}
					{sheet.model && (traits(sheet.model).length
						? traits(sheet.model).map((k) => <p key={k} className="ps-text">{s.text[k]}</p>)
						: <p className="ps-text">{s.balancedText}</p>)}
					{sheet.decor && <p className="ps-text">{s.decorText[sheet.id]}</p>}
					<p className="ps-text dim">{sheet.model ? (daily ? s.fairDaily : s.nextMatch) : note}</p>
					<div className="ps-sheetact">{action(sheet, true)}</div>
				</div>
			) : (
				<>
					<div className="ps-tabs" role="tablist" aria-label={s.title}>
						{KINDS.map((k) => (
							<button key={k} type="button" role="tab" aria-selected={kind === k} className={`ps-tab ${kind === k ? 'on' : ''}`}
								onClick={() => setKind(k)}>{s.tabs[k]}</button>
						))}
					</div>
					<p className="ps-note">{note}</p>
					<ul className="ps-list">
						{items.map((it) => {
							const tr = it.model ? traits(it.model) : [];
							return (
								<li key={it.id} className={`${equipped[it.kind] === it.id ? 'on' : ''}${bought === it.id ? ' just' : ''}`}>
									<button type="button" className="ps-row" onClick={() => setSheet(it)}>
										<Thumb it={it} size={it.decor ? 52 : 48} />
										<span className="ps-body">
											<strong>{name(it)}</strong>
											{it.model && <span className="ps-make">{makeLine(it)}</span>}
											{it.model && (tr.length
												? <>
													<span className="ps-pro">+ {tr.map((k) => s.pro[k]).join(', ')}</span>
													<span className="ps-con">– {tr.map((k) => s.con[k]).join(', ')}</span>
												</>
												: <span className="ps-pro">{s.balanced}</span>)}
											{it.decor && <span className="ps-make">{s.decorText[it.id]}</span>}
											{it.price === 0 && <span className="ps-free">{s.free}</span>}
										</span>
									</button>
									<span className="ps-side">{action(it)}</span>
								</li>
							);
						})}
					</ul>
					{daily && kind === 'boule' && <p className="ps-note">{s.fairDaily}</p>}
					<p className="ps-earn">{s.earn}</p>
				</>
			)}
		</GameModal>
	);
}

const CSS = `
.ps-wallet { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 10px; font-size: 15px; color: var(--gray-200); }
.ps-wallet strong { font-size: 19px; color: var(--gray-0); }
.ps-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.ps-tab { flex: 1; border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-100); border-radius: 999px; padding: 8px 6px; font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; }
.ps-tab.on { background: var(--accent-regular); border-color: var(--accent-regular); color: var(--accent-text-over, #fff); }
.ps-note { margin: 2px 2px 10px; font-size: 14px; color: var(--gray-300); text-align: center; }
.ps-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ps-list li { display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--gray-800); border-radius: 12px; padding: 6px 8px 6px 4px; }
.ps-list li.on { border-color: var(--accent-regular); }
.ps-list li.just { animation: ps-just 0.9s ease-out; }
@keyframes ps-just { 0% { box-shadow: 0 0 0 0 rgba(255, 201, 63, 0.9); } 100% { box-shadow: 0 0 0 14px rgba(255, 201, 63, 0); } }
.ps-row { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; background: none; border: none; padding: 2px; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ps-thumb { flex: none; display: inline-block; border-radius: 50%; }
.ps-jack { box-shadow: 0 2px 4px #0004; margin: 0 9px; }
.ps-decorpic { border-radius: 8px; object-fit: cover; background: var(--gray-800); }
.ps-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ps-body strong { font-size: 16px; color: var(--gray-0); }
.ps-make { font-size: 14px; color: var(--gray-200); }
.ps-pro { font-size: 13.5px; color: #2f9e57; }
.ps-con { font-size: 13.5px; color: #d0503f; }
.ps-free { font-size: 13px; color: var(--gray-300); }
.ps-side { flex: none; display: flex; }
.ps-buywrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ps-act { border: 1.5px solid var(--gray-600); background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 8px 12px; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; min-height: 40px; }
.ps-act.buy { background: #ffc93f; border-color: #c9820d; color: #3d2600; }
.ps-act.on { background: transparent; border-color: var(--accent-regular); color: var(--accent-regular); cursor: default; }
.ps-act:disabled:not(.on) { opacity: 0.5; cursor: default; }
.ps-act.big { font-size: 16px; padding: 11px 22px; }
.ps-short { font-size: 12px; font-style: normal; color: var(--gray-300); }
.ps-earn { margin: 12px 0 0; font-size: 13px; color: var(--gray-300); text-align: center; }
.ps-sheet { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.ps-sheet h4 { margin: 0; font-size: 20px; color: var(--gray-0); }
.ps-back { align-self: flex-start; border: none; background: none; color: var(--accent-regular); font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; padding: 4px 2px; }
.ps-spin { width: 180px; height: 180px; }
.ps-sheetpic { display: flex; justify-content: center; padding: 8px 0; }
.ps-sheetpic .ps-decorpic { width: min(100%, 320px); height: auto; aspect-ratio: 16 / 10; }
.ps-text { margin: 0; font-size: 15px; line-height: 1.4; color: var(--gray-100); max-width: 44ch; }
.ps-text.dim { color: var(--gray-300); font-size: 14px; }
.ps-sheetact { margin-top: 8px; }
`;
