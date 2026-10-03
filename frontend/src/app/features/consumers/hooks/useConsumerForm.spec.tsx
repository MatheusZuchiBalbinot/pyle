import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, createConsumer, updateConsumer } from '@/app/api/adminApiClient';
import type { Consumer, ConsumerCreated } from '@/app/api/adminApiTypes';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { validateConsumerForm } from '../lib/consumerFormValidation';
import { useConsumerForm } from './useConsumerForm';

vi.mock('../../../api/adminApiClient', () => ({
	createConsumer: vi.fn(),
	updateConsumer: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const CONSUMER = {
	id: 'c1',
	slug: 'web-app',
	name: 'Web app',
	rateLimitPerMinute: 600,
	allowedRoutes: [],
	apiKeys: [],
	createdAt: '',
	updatedAt: '',
} as Consumer;

function render(mode: Parameters<typeof useConsumerForm>[0]) {
	return renderHook(() => useConsumerForm(mode), { wrapper: buildRealtimeHarness().wrapper });
}

describe('useConsumerForm', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('checks slug, name and the limit range', () => {
		expect(validateConsumerForm({ slug: 'Web App', name: '', rateLimitPerMinute: '1000001', routeIds: [] })).toEqual({
			slug: 'common.validation.slug',
			name: 'common.validation.required',
			rateLimitPerMinute: 'common.validation.range',
		});
	});

	it('creates with the chosen routes and hands back the key', async () => {
		vi.mocked(createConsumer).mockResolvedValue({ ...CONSUMER, key: 'pyle_live_x' } as ConsumerCreated);
		const { result } = render({ kind: 'create' });

		act(() => {
			result.current.setField('slug', 'web-app');
			result.current.setField('name', 'Web app');
			result.current.setField('routeIds', ['r1']);
		});

		let saved: unknown;

		await act(async () => {
			saved = await result.current.submit();
		});

		expect(createConsumer).toHaveBeenCalledWith({ slug: 'web-app', name: 'Web app', rateLimitPerMinute: 600, routeIds: ['r1'] });
		expect(saved).toMatchObject({ kind: 'created', consumer: { key: 'pyle_live_x' } });
	});

	it('edits name and limit, and puts a taken slug on its field', async () => {
		vi.mocked(updateConsumer).mockResolvedValue(CONSUMER);
		const edit = render({ kind: 'edit', consumer: CONSUMER });

		act(() => edit.result.current.setField('rateLimitPerMinute', '120'));
		await act(async () => {
			await edit.result.current.submit();
		});
		expect(updateConsumer).toHaveBeenCalledWith('web-app', { name: 'Web app', rateLimitPerMinute: 120 });

		vi.mocked(createConsumer).mockRejectedValue(new AdminApiError('taken', 409));
		const create = render({ kind: 'create' });

		act(() => {
			create.result.current.setField('slug', 'web-app');
			create.result.current.setField('name', 'x');
		});
		await act(async () => {
			await create.result.current.submit();
		});
		expect(create.result.current.errors.slug).toBe('consumers.form.errors.slugTaken');
	});
});
