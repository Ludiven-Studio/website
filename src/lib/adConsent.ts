// The « Consentement pubs » card of /admin/stats/: each app's answers to its ad consent window over 28 days, per
// platform when Umami could split them, from stats-admin's consent figures.
import type { AppStats, ConsentPlatform, Count } from './statsAdmin';

/** Share of the launches still without an answer (app_open { ads: unasked }), or an estimate from visitors. */
export type NoAnswer =
	| { kind: 'exact'; rate: number; launches: number }
	| { kind: 'estimate'; rate: number; visitors: number };

export interface ConsentRow {
	key: string;
	app: string;
	domain: string;
	/** Null: both platforms together, Umami could not split them. */
	platform: ConsentPlatform | null;
	yes: number;
	no: number;
	accept: number | null;
	refuse: number | null;
	none: NoAnswer | null;
}

export interface ConsentTable {
	rows: ConsentRow[];
	/** Apps whose figures came back without either consent event. */
	silent: string[];
	/** Apps whose consent figures could not be read (or a cache from before them). */
	unread: string[];
}

const count = (rows: Count[] | null | undefined, key: string): number => rows?.find((r) => r.key === key)?.count ?? 0;
const sum = (rows: Count[] | null | undefined): number => (rows ?? []).reduce((s, r) => s + r.count, 0);

function row(app: AppStats, platform: ConsentPlatform | null, answers: Count[] | null, opens: Count[] | null, visitors: number): ConsentRow {
	const yes = count(answers, 'yes');
	const no = count(answers, 'no');
	const answered = yes + no;
	const launches = sum(opens);
	let none: NoAnswer | null = null;
	if (launches > 0) none = { kind: 'exact', rate: count(opens, 'unasked') / launches, launches };
	else if (visitors > 0) none = { kind: 'estimate', rate: Math.max(0, visitors - answered) / visitors, visitors };
	return {
		key: `${app.id}-${platform ?? 'all'}`, app: app.name, domain: app.domain, platform, yes, no,
		accept: answered ? yes / answered : null, refuse: answered ? no / answered : null, none,
	};
}

/** One row per app and platform, apps with the most answers first. */
export function consentTable(apps: AppStats[]): ConsentTable {
	const rows: ConsentRow[][] = [];
	const silent: string[] = [];
	const unread: string[] = [];
	for (const app of apps) {
		const c = app.consent;
		// Only the apps: the website's own Umami site has a domain, not an app id.
		const isApp = /^[a-z0-9]+(\.[a-z0-9_]+){2,}$/i.test(app.domain);
		if (!c) {
			if (isApp) unread.push(app.name);
			continue;
		}
		if (!sum(c.answers) && !sum(c.opens)) {
			if (isApp) silent.push(app.name);
			continue;
		}
		rows.push(c.platforms
			? c.platforms.map((p) => row(app, p.platform, p.answers, p.opens, p.visitors))
			: [row(app, null, c.answers, c.opens, app.periods.d28?.visitors ?? 0)]);
	}
	rows.sort((a, b) => b.reduce((s, r) => s + r.yes + r.no, 0) - a.reduce((s, r) => s + r.yes + r.no, 0));
	return { rows: rows.flat(), silent, unread };
}
