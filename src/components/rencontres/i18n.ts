// The map in French (/petanque-meet/) or English (/en/petanque-meet/). The page
// passes its language once; the components read it from the context.
import { createContext, useContext } from 'react';
import { DATE_LABEL, DATE_LABEL_EN } from '../../lib/meetupFilters';
import {
	FORMAT_LABEL, FORMAT_LABEL_EN, REPORT_LABEL, REPORT_LABEL_EN, ROLE_LABEL, ROLE_LABEL_EN,
} from '../../lib/meetupRules';

export type Lang = 'fr' | 'en';

export const LangContext = createContext<Lang>('fr');
export const useLang = (): Lang => useContext(LangContext);

/** Both versions side by side where the text is used: two languages don't earn a key file. */
export const pick = (lang: Lang) => <T>(fr: T, en: T): T => (lang === 'en' ? en : fr);
export const useT = () => pick(useLang());

const LABELS = {
	fr: { format: FORMAT_LABEL, role: ROLE_LABEL, report: REPORT_LABEL, date: DATE_LABEL },
	en: { format: FORMAT_LABEL_EN, role: ROLE_LABEL_EN, report: REPORT_LABEL_EN, date: DATE_LABEL_EN },
};
export const labels = (lang: Lang) => LABELS[lang];
export const useLabels = () => labels(useLang());

export const PATHS = {
	fr: { map: '/petanque-meet/', app: '/petanque-meet/telecharger/', scanner: '/petanque-scanner/' },
	en: { map: '/en/petanque-meet/', app: '/en/petanque-meet/download/', scanner: '/en/petanque-scanner/' },
} as const;
