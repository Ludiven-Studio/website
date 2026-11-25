// The admin pages' small visual pieces: key-figure tiles, labelled bars, a stacked bar per day, state pills.
import type { CSSProperties, ReactNode } from 'react';
import { appColor } from '../../lib/appColors';

/** The style that gives an element its app's colour as --app. */
export const appStyle = (...names: (string | null | undefined)[]) => ({ '--app': appColor(...names) }) as CSSProperties;

export function AppName({ name, of }: { name: string; of?: string }) {
	return <span className="ak-app" style={appStyle(of ?? name, name)}><i aria-hidden="true" />{name}</span>;
}

export function Help({ children, label = 'Comment lire' }: { children: ReactNode; label?: string }) {
	return (
		<details className="ak-help">
			<summary>{label}</summary>
			<div>{children}</div>
		</details>
	);
}

export type Tone = 'ok' | 'warn' | 'bad' | 'plain';
const ICON: Record<Tone, string> = { ok: '✓', warn: '!', bad: '✕', plain: '·' };

export function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
	return (
		<span className={`ak-pill ak-${tone}`} title={title}>
			<i aria-hidden="true">{ICON[tone]}</i>
			{children}
		</span>
	);
}

export function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
	return (
		<div className="ak-tile">
			<span>{label}</span>
			<strong>{value}</strong>
			{sub && <small>{sub}</small>}
		</div>
	);
}

/** A share of a bar: ok keeps the bar's colour, fail is red, cancel orange, muted grey. */
export interface BarPart { value: number; tone: 'ok' | 'fail' | 'cancel' | 'muted' }
export interface Bar { key: string; label: string; value: number; color: string; parts?: BarPart[]; note?: string }

/** One labelled horizontal bar per row, longest first, the value written at the end. */
export function Bars({ rows, format, empty = 'rien' }: { rows: Bar[]; format: (n: number) => string; empty?: string }) {
	const shown = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
	if (!shown.length) return <p className="as-muted">{empty}</p>;
	const max = shown[0].value;
	return (
		<ul className="ak-bars">
			{shown.map((r) => (
				<li key={r.key} title={`${r.label} : ${format(r.value)}${r.note ? ` (${r.note})` : ''}`}>
					<span className="ak-bar-label">{r.label}</span>
					<span className="ak-bar-track">
						{r.parts ? (
							<span className="ak-bar ak-bar--parts" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}>
								{r.parts.filter((x) => x.value > 0).map((x) => (
									<span key={x.tone} className={`ak-part ak-part--${x.tone}`} style={{ flexGrow: x.value, background: x.tone === 'ok' ? r.color : undefined }} />
								))}
							</span>
						) : <span className="ak-bar" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color }} />}
					</span>
					<strong>{format(r.value)}</strong>
					{r.note && <small className="ak-bar-note">{r.note}</small>}
				</li>
			))}
		</ul>
	);
}

export interface DaySeries { key: string; label: string; color: string; byDay: Map<string, number> }

/** A bar per day, stacked by series, with its legend. Days are YYYY-MM-DD, oldest first; partial lightens the
 *  last day, still running. */
export function DayStack({ days, series, unit, partial = false }: { days: string[]; series: DaySeries[]; unit: (n: number) => string; partial?: boolean }) {
	const totals = days.map((d) => series.reduce((s, x) => s + (x.byDay.get(d) ?? 0), 0));
	const top = Math.max(0, ...totals);
	const max = top || 1;
	const last = days.length - 1;
	const W = 6, GAP = 5, H = 48;
	const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
	return (
		<figure className="ak-days">
			<svg viewBox={`0 0 ${days.length * (W + GAP)} ${H}`} preserveAspectRatio="none" role="img" aria-label="Par jour">
				<line x1="0" x2={days.length * (W + GAP)} y1={H - 0.5} y2={H - 0.5} className="ak-base" />
				{days.map((d, i) => {
					let y = H;
					return (
						<g key={d} className={partial && i === last ? 'ak-partial' : undefined}>
							<title>{`${day(d)} : ${unit(totals[i])}${partial && i === last ? ' (journée en cours)' : ''}${series.filter((s) => s.byDay.get(d)).map((s) => `\n${s.label} : ${unit(s.byDay.get(d) ?? 0)}`).join('')}`}</title>
							<rect x={i * (W + GAP)} y="0" width={W + GAP} height={H} fill="transparent" />
							{series.map((s) => {
								const v = s.byDay.get(d) ?? 0;
								if (!v) return null;
								const h = (v / max) * (H - 4);
								y -= h;
								return <rect key={s.key} x={i * (W + GAP)} y={y} width={W} height={Math.max(0, h - 1)} rx="1.5" fill={s.color} />;
							})}
						</g>
					);
				})}
			</svg>
			<figcaption>
				<span>{day(days[0])}</span>
				{series.length > 1 ? (
					<span className="ak-legend">
						{series.map((s) => (
							<span key={s.key}><i style={{ background: s.color } as CSSProperties} />{s.label}</span>
						))}
					</span>
				) : <span>au plus {unit(top)} / jour</span>}
				<span>{day(days[last])}</span>
			</figcaption>
		</figure>
	);
}

/** A rate from 0 to 1 as a short filled track. */
export function Meter({ label, rate, text }: { label: string; rate: number | null | undefined; text: string }) {
	return (
		<div className="ak-meter" title={`${label} : ${text}`}>
			<span>{label}</span>
			<span className="ak-bar-track"><span className="ak-bar" style={{ width: `${Math.min(100, (rate ?? 0) * 100 * 2)}%` }} /></span>
			<strong>{text}</strong>
		</div>
	);
}
