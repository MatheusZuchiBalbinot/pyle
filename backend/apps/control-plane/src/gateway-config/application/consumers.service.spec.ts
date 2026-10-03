import { Prisma } from '@prisma/control-plane-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigConflictError, ConfigNotFoundError } from '../domain/config-errors.js';
import { KEY_RESTORE_WINDOW_MS, MAX_ACTIVE_KEYS_PER_CONSUMER } from '../domain/gateway-config-limits.js';
import type { ApiKeyRepository } from '../infrastructure/api-key.repository.js';
import type { ConsumerRepository } from '../infrastructure/consumer.repository.js';
import type { RouteRepository } from '../infrastructure/route.repository.js';
import { ConsumersService } from './consumers.service.js';
import { buildApiKeyRow, buildConsumerRow, buildFakePrisma, buildFakeRecorder, TRANSACTION } from './gateway-config-test-kit.fake.js';

const ACTOR = { email: 'ops@pyle.local' };
const PAGE = { cursor: null, limit: 50 };

function buildFakes() {
	const consumers = {
		listPage: vi.fn().mockResolvedValue({ items: [buildConsumerRow()], nextCursor: null }),
		findActiveBySlug: vi.fn().mockResolvedValue(buildConsumerRow()),
		create: vi.fn().mockResolvedValue(buildConsumerRow()),
		update: vi.fn().mockResolvedValue(buildConsumerRow({ rateLimitPerMinute: 120 })),
		softDelete: vi.fn().mockResolvedValue(undefined),
		replaceRouteAccess: vi.fn().mockResolvedValue(undefined),
	};
	const apiKeys = {
		create: vi.fn().mockResolvedValue(buildApiKeyRow({ id: 'k2' })),
		countActive: vi.fn().mockResolvedValue(1),
		find: vi.fn().mockResolvedValue(buildApiKeyRow()),
		listActive: vi.fn().mockResolvedValue([buildApiKeyRow(), buildApiKeyRow({ id: 'k2', keyPrefix: 'pyle_live_Cd' })]),
		revoke: vi.fn().mockResolvedValue(undefined),
		restore: vi.fn().mockResolvedValue(true),
	};
	const routes = { countActiveIn: vi.fn().mockResolvedValue(1) };
	const recorder = buildFakeRecorder();
	const service = new ConsumersService(
		buildFakePrisma(),
		consumers as unknown as ConsumerRepository,
		apiKeys as unknown as ApiKeyRepository,
		routes as unknown as RouteRepository,
		recorder,
	);

	return { service, consumers, apiKeys, routes, recorder };
}

describe('ConsumersService', () => {
	let fakes: ReturnType<typeof buildFakes>;

	beforeEach(() => {
		fakes = buildFakes();
	});

	it('lists a page of consumers without key hashes', async () => {
		const page = await fakes.service.list(PAGE);

		expect(page.items[0].apiKeys[0]).not.toHaveProperty('keyHash');
	});

	it('creates a consumer with its first key and grants in one transaction, returning the key once', async () => {
		fakes.consumers.findActiveBySlug.mockResolvedValueOnce(null);

		const created = await fakes.service.create({ slug: 'web-app', name: 'Web app', routeIds: ['r1'] }, ACTOR);

		expect(created.key).toMatch(/^pyle_live_/);
		expect(fakes.apiKeys.create).toHaveBeenCalledWith(
			expect.objectContaining({ consumerId: 'c1', keyPrefix: created.key.slice(0, 12) }),
			TRANSACTION,
		);
		expect(fakes.consumers.replaceRouteAccess).toHaveBeenCalledWith('c1', ['r1'], TRANSACTION);
		expect(fakes.recorder.record).toHaveBeenCalledTimes(2);
		expect(fakes.recorder.announce).toHaveBeenCalledWith([
			expect.objectContaining({ entityType: 'consumer', action: 'created' }),
			expect.objectContaining({ entityType: 'api_key', detail: { kind: 'key_issued', keyPrefix: 'pyle_live_Ab' } }),
		]);
	});

	it('opens every route when no grant is given, without asking about routes', async () => {
		fakes.consumers.findActiveBySlug.mockResolvedValueOnce(null);

		await fakes.service.create({ slug: 'web-app', name: 'Web app' }, ACTOR);

		expect(fakes.routes.countActiveIn).not.toHaveBeenCalled();
		expect(fakes.consumers.replaceRouteAccess).toHaveBeenCalledWith('c1', [], TRANSACTION);
	});

	it('refuses a slug in use and a grant to a route that does not exist', async () => {
		await expect(fakes.service.create({ slug: 'web-app', name: 'x' }, ACTOR)).rejects.toThrow(ConfigConflictError);

		fakes.consumers.findActiveBySlug.mockResolvedValueOnce(null);
		fakes.routes.countActiveIn.mockResolvedValue(0);
		await expect(fakes.service.create({ slug: 'new', name: 'x', routeIds: ['ghost'] }, ACTOR)).rejects.toThrow(ConfigNotFoundError);
	});

	it('turns a lost race at the unique index into a conflict, and lets anything else through', async () => {
		fakes.consumers.findActiveBySlug.mockResolvedValue(null);
		fakes.consumers.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }));
		await expect(fakes.service.create({ slug: 'web-app', name: 'x' }, ACTOR)).rejects.toThrow(ConfigConflictError);

		fakes.consumers.create.mockRejectedValueOnce(new Error('db down'));
		await expect(fakes.service.create({ slug: 'web-app', name: 'x' }, ACTOR)).rejects.toThrow('db down');
	});

	it('updates a consumer and records what changed', async () => {
		await fakes.service.update('web-app', { rateLimitPerMinute: 120 }, ACTOR);

		expect(fakes.recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ detail: { kind: 'fields', changes: [{ field: 'rateLimitPerMinute', before: 600, after: 120 }] } }),
			ACTOR,
			TRANSACTION,
		);
	});

	it('soft-deletes a consumer and revokes each active key, one audit row per key', async () => {
		await fakes.service.delete('web-app', ACTOR);

		expect(fakes.apiKeys.revoke).toHaveBeenCalledWith(['k1', 'k2'], expect.any(Date), TRANSACTION);
		expect(fakes.consumers.softDelete).toHaveBeenCalledWith('c1', expect.any(Date), TRANSACTION);
		expect(fakes.recorder.record).toHaveBeenCalledTimes(3);
	});

	it('issues another key, up to the limit', async () => {
		const issued = await fakes.service.issueKey('web-app', 'ci', ACTOR);

		expect(issued.key).toMatch(/^pyle_live_/);
		expect(fakes.apiKeys.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'ci' }), TRANSACTION);

		fakes.apiKeys.countActive.mockResolvedValue(MAX_ACTIVE_KEYS_PER_CONSUMER);
		await expect(fakes.service.issueKey('web-app', undefined, ACTOR)).rejects.toThrow(/revoke one first/);
	});

	it('revokes a key once, and treats a second revoke as done', async () => {
		await fakes.service.revokeKey('web-app', 'k1', ACTOR);
		expect(fakes.apiKeys.revoke).toHaveBeenCalledWith(['k1'], expect.any(Date), TRANSACTION);

		fakes.apiKeys.find.mockResolvedValue(buildApiKeyRow({ revokedAt: new Date() }));
		await fakes.service.revokeKey('web-app', 'k1', ACTOR);
		expect(fakes.apiKeys.revoke).toHaveBeenCalledTimes(1);
	});

	describe('restoring a revoked key', () => {
		function revokedAgo(ms: number): Date {
			return new Date(Date.now() - ms);
		}

		it('undoes a revocation made moments ago, exactly that one, and records it', async () => {
			const revokedAt = revokedAgo(5000);

			fakes.apiKeys.find.mockResolvedValue(buildApiKeyRow({ revokedAt }));
			await fakes.service.restoreKey('web-app', 'k1', ACTOR);

			expect(fakes.apiKeys.restore).toHaveBeenCalledWith('k1', revokedAt, TRANSACTION);
			expect(fakes.recorder.record).toHaveBeenCalledWith(
				expect.objectContaining({ detail: { kind: 'key_restored', keyPrefix: 'pyle_live_Ab' } }),
				ACTOR,
				TRANSACTION,
			);
			expect(fakes.recorder.announce).toHaveBeenCalledTimes(1);
		});

		it('treats an active key as already restored', async () => {
			await fakes.service.restoreKey('web-app', 'k1', ACTOR);

			expect(fakes.apiKeys.restore).not.toHaveBeenCalled();
			expect(fakes.recorder.record).not.toHaveBeenCalled();
		});

		it('refuses once the window has passed: the key is gone for good', async () => {
			fakes.apiKeys.find.mockResolvedValue(buildApiKeyRow({ revokedAt: revokedAgo(KEY_RESTORE_WINDOW_MS + 1000) }));

			await expect(fakes.service.restoreKey('web-app', 'k1', ACTOR)).rejects.toThrow(/issue a new one/);
			expect(fakes.apiKeys.restore).not.toHaveBeenCalled();
		});

		it('refuses past the active key limit, and when the key changed in the meantime', async () => {
			fakes.apiKeys.find.mockResolvedValue(buildApiKeyRow({ revokedAt: revokedAgo(1000) }));
			fakes.apiKeys.countActive.mockResolvedValue(MAX_ACTIVE_KEYS_PER_CONSUMER);
			await expect(fakes.service.restoreKey('web-app', 'k1', ACTOR)).rejects.toThrow(/revoke one first/);

			fakes.apiKeys.countActive.mockResolvedValue(1);
			fakes.apiKeys.restore.mockResolvedValue(false);
			await expect(fakes.service.restoreKey('web-app', 'k1', ACTOR)).rejects.toThrow(ConfigConflictError);
			expect(fakes.recorder.announce).not.toHaveBeenCalled();
		});

		it('answers not found for a key of another consumer', async () => {
			fakes.apiKeys.find.mockResolvedValue(null);

			await expect(fakes.service.restoreKey('web-app', 'k9', ACTOR)).rejects.toThrow(ConfigNotFoundError);
		});
	});

	it('answers not found for a key of another consumer', async () => {
		fakes.apiKeys.find.mockResolvedValue(null);

		await expect(fakes.service.revokeKey('web-app', 'k9', ACTOR)).rejects.toThrow(ConfigNotFoundError);
	});

	it('replaces the route grants with each route once', async () => {
		fakes.routes.countActiveIn.mockResolvedValue(2);

		await fakes.service.setRoutes('web-app', ['r1', 'r2', 'r1'], ACTOR);

		expect(fakes.consumers.replaceRouteAccess).toHaveBeenCalledWith('c1', ['r1', 'r2'], TRANSACTION);
		expect(fakes.recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ detail: { kind: 'route_scope', allowedRouteCount: 2 } }),
			ACTOR,
			TRANSACTION,
		);
	});

	it('answers not found for an unknown consumer', async () => {
		fakes.consumers.findActiveBySlug.mockResolvedValue(null);

		await expect(fakes.service.get('ghost')).rejects.toThrow(ConfigNotFoundError);
	});
});
