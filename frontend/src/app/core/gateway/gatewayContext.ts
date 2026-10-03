import { createContext } from 'react';

import type { PageId } from '@/app/shell/Sidebar/navItems';

export type ToastTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

// One button next to the message, such as "Desfazer"; using it also dismisses the toast.
export type ToastAction = {
	readonly label: string;
	readonly onAct: () => void;
};

export type Toast = {
	readonly id: number;
	readonly message: string;
	readonly tone: ToastTone;
	readonly action: ToastAction | null;
};

// Each variant belongs to one page, which reads it to expand and scroll to the entity. It is
// part of the URL (consoleLocation.ts), so an opened entity can be linked to and reloaded.
export type ConsoleSelection =
	| { readonly type: 'route'; readonly routeId: string }
	| { readonly type: 'route-traffic'; readonly routeId: string }
	| { readonly type: 'service'; readonly serviceSlug: string; readonly instanceId: string | null }
	| { readonly type: 'consumer'; readonly consumerSlug: string }
	| { readonly type: 'analysis'; readonly analysisId: string };

export type GatewayContextValue = {
	readonly isNavOpen: boolean;
	readonly setIsNavOpen: (isOpen: boolean) => void;
	readonly toasts: readonly Toast[];
	readonly toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
	readonly dismissToast: (id: number) => void;
	readonly activePage: PageId;
	readonly navigate: (page: PageId) => void;
	readonly selection: ConsoleSelection | null;
	readonly openSelection: (selection: ConsoleSelection) => void;
	readonly clearSelection: () => void;
	readonly openAnalysis: (id: string) => void;
};

export const GatewayContext = createContext<GatewayContextValue | null>(null);
