import { useEffect, type RefObject } from 'react';

import { ESCAPE_KEY } from '../lib/keyboardKeys';

export type DismissableMenuInput = {
	readonly containerRef: RefObject<HTMLElement | null>;
	readonly isOpen: boolean;
	readonly onDismiss: () => void;
};

export function useDismissableMenu({ containerRef, isOpen, onDismiss }: DismissableMenuInput): void {
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleOutsideMouseDown(event: MouseEvent): void {
			const isInside = containerRef.current?.contains(event.target as Node) ?? false;

			if (isInside) {
				return;
			}

			onDismiss();
		}

		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key !== ESCAPE_KEY) {
				return;
			}

			onDismiss();
		}

		document.addEventListener('mousedown', handleOutsideMouseDown);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('mousedown', handleOutsideMouseDown);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [containerRef, isOpen, onDismiss]);
}
