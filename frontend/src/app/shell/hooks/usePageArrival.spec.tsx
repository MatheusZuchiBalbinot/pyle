import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageId } from '../Sidebar/navItems';
import { usePageArrival } from './usePageArrival';

function Shell({ page }: { readonly page: PageId }) {
	usePageArrival(page);

	return (
		<>
			<div data-page-frame="routes">
				<h1>Rotas</h1>
			</div>
			<div data-page-frame="services">
				<h1>Serviços</h1>
			</div>
		</>
	);
}

function scrollTo(y: number): void {
	Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
	window.dispatchEvent(new Event('scroll'));
}

describe('usePageArrival', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('focuses the new page heading and brings back where each page was left', () => {
		const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
		const { getByRole, rerender } = render(<Shell page="routes" />);

		expect(scroll).not.toHaveBeenCalled();
		scrollTo(420);
		rerender(<Shell page="services" />);

		expect(document.activeElement).toBe(getByRole('heading', { name: 'Serviços' }));
		expect(scroll).toHaveBeenLastCalledWith(0, 0);

		scrollTo(80);
		rerender(<Shell page="routes" />);

		expect(document.activeElement).toBe(getByRole('heading', { name: 'Rotas' }));
		expect(scroll).toHaveBeenLastCalledWith(0, 420);
	});
});
