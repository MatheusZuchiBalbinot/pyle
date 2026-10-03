import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyReveal } from './ApiKeyReveal';

const KEY = 'pyle_live_AbCdEf123';

function renderReveal(): () => void {
	const onAcknowledge = vi.fn();

	render(<ApiKeyReveal consumerName="Web app" apiKey={KEY} onAcknowledge={onAcknowledge} />);

	return onAcknowledge;
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
	Reflect.deleteProperty(navigator, 'clipboard');
});

describe('ApiKeyReveal', () => {
	it('shows the key once, with the warning that it will not be shown again', () => {
		renderReveal();

		expect(screen.getByText(KEY)).toBeTruthy();
		expect(screen.getByText('consumers.keyReveal.warning')).toBeTruthy();
	});

	it('copies the key and says so', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);

		stubClipboard(writeText);
		renderReveal();

		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'consumers.keyReveal.copy' })));

		expect(writeText).toHaveBeenCalledWith(KEY);
		expect(screen.getByRole('button', { name: 'consumers.keyReveal.copied' })).toBeTruthy();
	});

	it('says when the browser refused the clipboard, leaving the key on screen', async () => {
		stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
		renderReveal();

		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'consumers.keyReveal.copy' })));

		expect(screen.getByRole('button', { name: 'consumers.keyReveal.copyFailed' })).toBeTruthy();
		expect(screen.getByText(KEY)).toBeTruthy();
	});

	it('hands back to the caller on acknowledge, so it can drop the key', () => {
		const onAcknowledge = renderReveal();

		fireEvent.click(screen.getByRole('button', { name: 'consumers.keyReveal.acknowledge' }));

		expect(onAcknowledge).toHaveBeenCalledOnce();
	});
});
