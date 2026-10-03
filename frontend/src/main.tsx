import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

import './i18n/index';
// Loaded here, not by the lazy dashboard, so the login screen is styled too.
import './app/theme.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
	throw new Error('Root element not found');
}

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
