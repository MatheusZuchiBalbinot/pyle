import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from './DataTable';

type Row = { readonly id: string; readonly name: string; readonly requests: number };

const ROWS: readonly Row[] = [
	{ id: 'a', name: 'Pedidos', requests: 30 },
	{ id: 'b', name: 'Catálogo', requests: 120 },
	{ id: 'c', name: 'Usuários', requests: 5 },
];

const COLUMNS: readonly DataTableColumn<Row>[] = [
	{ key: 'name', label: 'Rota', isSortable: true, sortValue: (row) => row.name, cell: (row) => row.name },
	{ key: 'requests', label: 'Requisições', isNumeric: true, isSortable: true, sortValue: (row) => row.requests, cell: (row) => String(row.requests) },
	{ key: 'note', label: 'Nota', cell: () => '-' },
];

function rowKey(row: Row): string {
	return row.id;
}

function firstColumn(): readonly string[] {
	const body = screen.getAllByRole('rowgroup')[1];

	return within(body)
		.getAllByRole('row')
		.map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
}

describe('DataTable', () => {
	it('renders rows in the order given until a column is sorted', () => {
		render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);

		expect(firstColumn()).toEqual(['Pedidos', 'Catálogo', 'Usuários']);
	});

	it('cycles a sortable column through ascending, descending and the original order', () => {
		render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);
		const heading = screen.getByRole('button', { name: 'Requisições' });

		fireEvent.click(heading);
		expect(firstColumn()).toEqual(['Usuários', 'Pedidos', 'Catálogo']);
		expect(heading.getAttribute('aria-pressed')).toBe('true');

		fireEvent.click(heading);
		expect(firstColumn()).toEqual(['Catálogo', 'Pedidos', 'Usuários']);

		fireEvent.click(heading);
		expect(firstColumn()).toEqual(['Pedidos', 'Catálogo', 'Usuários']);
		expect(heading.getAttribute('aria-pressed')).toBe('false');
	});

	it('sorts text with the locale, and restarts ascending on another column', () => {
		render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);

		fireEvent.click(screen.getByRole('button', { name: 'Requisições' }));
		fireEvent.click(screen.getByRole('button', { name: 'Rota' }));

		expect(firstColumn()).toEqual(['Catálogo', 'Pedidos', 'Usuários']);
	});

	it('reports row clicks and marks the selected row', () => {
		const onRowClick = vi.fn();

		render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={rowKey} onRowClick={onRowClick} selectedRowKey="b" />);

		fireEvent.click(screen.getByText('Usuários'));

		expect(onRowClick).toHaveBeenCalledWith(ROWS[2]);
		const selected = screen.getAllByRole('row').filter((row) => row.getAttribute('aria-selected') === 'true');

		expect(selected.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Catálogo']);
	});

	it('shows the empty message, its own or the default', () => {
		const { rerender } = render(<DataTable columns={COLUMNS} rows={[]} rowKey={rowKey} empty="Nenhuma rota" />);

		expect(screen.getByText('Nenhuma rota')).toBeTruthy();

		rerender(<DataTable columns={COLUMNS} rows={[]} rowKey={rowKey} />);
		expect(screen.getByText('dataTable.empty')).toBeTruthy();
	});

	it('resizes a column by dragging its edge, never below the minimum', () => {
		const frames: FrameRequestCallback[] = [];

		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));

		function drag(clientX: number): void {
			act(() => {
				document.dispatchEvent(new MouseEvent('mousemove', { clientX }));
				frames.splice(0).forEach((frame) => frame(0));
			});
		}

		// jsdom has no layout: the heading starts 80 px wide.
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 80, 30));
		render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);
		const [firstEdge] = screen.getAllByRole('separator');
		const firstHeading = firstEdge.closest('th') as HTMLElement;

		fireEvent.mouseDown(firstEdge, { clientX: 100 });
		drag(160);
		expect(firstHeading.style.width).toBe('140px');

		drag(-500);
		expect(firstHeading.style.width).toBe('80px');

		drag(130);
		expect(firstHeading.style.width).toBe('110px');

		act(() => {
			document.dispatchEvent(new MouseEvent('mouseup'));
		});
		drag(400);
		expect(firstHeading.style.width).toBe('110px');
		vi.restoreAllMocks();
	});

	it('resizes a column from the keyboard too, never below the minimum', () => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 30));
		render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);
		const [firstEdge] = screen.getAllByRole('separator', { name: 'dataTable.resizeColumnOf' });
		const firstHeading = firstEdge.closest('th') as HTMLElement;

		fireEvent.keyDown(firstEdge, { key: 'ArrowRight' });
		expect(firstHeading.style.width).toBe('116px');

		fireEvent.keyDown(firstEdge, { key: 'ArrowLeft' });
		fireEvent.keyDown(firstEdge, { key: 'ArrowLeft' });
		fireEvent.keyDown(firstEdge, { key: 'ArrowLeft' });
		expect(firstHeading.style.width).toBe('80px');

		fireEvent.keyDown(firstEdge, { key: 'Enter' });
		expect(firstHeading.style.width).toBe('80px');
		vi.restoreAllMocks();
	});
});
