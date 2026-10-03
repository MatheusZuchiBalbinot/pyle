import { X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Toast, ToastAction } from '@/app/core/gateway/gatewayContext';
import { useGateway } from '@/app/core/gateway/useGateway';
import { Button } from '@/app/ui/Button/Button';

// Polite: a toast never interrupts what a screen reader is saying.
export function Toasts(): ReactElement {
	const { toasts } = useGateway();

	return (
		<div className="toast-stack" aria-live="polite">
			{toasts.map((item) => (
				<ToastItem key={item.id} item={item} />
			))}
		</div>
	);
}

function ToastItem({ item }: { readonly item: Toast }): ReactElement {
	const { t } = useTranslation();
	const { dismissToast } = useGateway();

	function handleDismissClick(): void {
		dismissToast(item.id);
	}

	const dismissButton = (
		<Button
			variant="toast"
			className={item.tone}
			onClick={handleDismissClick}
			aria-label={t('toasts.dismiss', { message: item.message })}
			data-tooltip={t('toasts.dismissTooltip')}
			data-tooltip-side="top"
		>
			<span>{item.message}</span>
			<X size={14} aria-hidden="true" />
		</Button>
	);

	if (item.action === null) {
		return dismissButton;
	}

	return (
		<div className={`toast-with-action ${item.tone}`}>
			{dismissButton}
			<ToastActionButton toastId={item.id} action={item.action} />
		</div>
	);
}

function ToastActionButton({ toastId, action }: { readonly toastId: number; readonly action: ToastAction }): ReactElement {
	const { dismissToast } = useGateway();

	function handleActionClick(): void {
		action.onAct();
		dismissToast(toastId);
	}

	return (
		<Button className="toast-action" onClick={handleActionClick}>
			{action.label}
		</Button>
	);
}
