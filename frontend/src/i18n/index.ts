import i18n, { type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { PT_BR_TRANSLATION } from './loadLocale';

const DEFAULT_LOCALE = 'pt-BR';

// A second locale is another folder with the same files.
const i18nOptions: InitOptions = {
	resources: { 'pt-BR': { translation: PT_BR_TRANSLATION } },
	lng: DEFAULT_LOCALE,
	fallbackLng: DEFAULT_LOCALE,
	interpolation: { escapeValue: false },
};

void i18n.use(initReactI18next).init(i18nOptions);
