import { Injectable } from '@nestjs/common';
import type { ApiKey, Consumer, Prisma } from '@prisma/control-plane-client';

import { mapPage, type Page, type PageRequest } from '../../common/pagination.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { CREATED, DELETED, diffFields, type ConfigChangeDetail } from '../domain/config-change-detail.js';
import { ConfigConflictError, ConfigNotFoundError } from '../domain/config-errors.js';
import { KEY_RESTORE_WINDOW_MS, MAX_ACTIVE_KEYS_PER_CONSUMER } from '../domain/gateway-config-limits.js';
import { generateApiKey } from '../domain/generate-api-key.js';
import { isUniqueViolation } from '../domain/unique-violation.js';
import { ApiKeyRepository } from '../infrastructure/api-key.repository.js';
import { ConsumerRepository, type ConsumerWithKeysAndRoutes } from '../infrastructure/consumer.repository.js';
import type { PrismaExecutor } from '../infrastructure/prisma-client.js';
import { RouteRepository } from '../infrastructure/route.repository.js';
import {
	toApiKeyDto,
	toConsumerDto,
	type ApiKeyCreatedDto,
	type ConsumerCreatedDto,
	type ConsumerDto,
} from '../interface/dto/gateway-config-responses.js';
import { ConfigChangeRecorder, type ConfigActor, type ConfigChange } from './config-change-recorder.js';

type CreateConsumerInput = {
	readonly slug: string;
	readonly name: string;
	readonly rateLimitPerMinute?: number;
	// Empty or absent = every route.
	readonly routeIds?: readonly string[];
};

type UpdateConsumerInput = {
	readonly name?: string;
	readonly rateLimitPerMinute?: number;
};

const MS_PER_SECOND = 1000;
const AUDITED_FIELDS = ['name', 'rateLimitPerMinute'] as const satisfies readonly (keyof Consumer)[];

type NamedConsumer = { readonly id: string; readonly name: string };

@Injectable()
export class ConsumersService {
	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly consumers: ConsumerRepository,
		private readonly apiKeys: ApiKeyRepository,
		private readonly routes: RouteRepository,
		private readonly recorder: ConfigChangeRecorder,
	) {}

	async list(page: PageRequest): Promise<Page<ConsumerDto>> {
		const consumers = await this.consumers.listPage(page);

		return mapPage(consumers, toConsumerDto);
	}

	async get(slug: string): Promise<ConsumerDto> {
		return toConsumerDto(await this.findOrThrow(slug));
	}

	// One transaction: a consumer without its key would be unusable.
	async create(input: CreateConsumerInput, actor: ConfigActor): Promise<ConsumerCreatedDto> {
		const existing = await this.consumers.findActiveBySlug(input.slug);

		if (existing) {
			throw new ConfigConflictError(`A consumer with slug "${input.slug}" already exists`);
		}

		const routeIds = input.routeIds ?? [];

		await this.assertRoutesExist(routeIds, this.prisma);
		const generated = generateApiKey();
		const data: Prisma.ConsumerCreateInput = { slug: input.slug, name: input.name, rateLimitPerMinute: input.rateLimitPerMinute };
		const created = await this.writeUnique(input.slug, async (transaction) => {
			const consumer = await this.consumers.create(data, transaction);
			const keyData: Prisma.ApiKeyUncheckedCreateInput = { consumerId: consumer.id, keyHash: generated.keyHash, keyPrefix: generated.keyPrefix };
			const apiKey = await this.apiKeys.create(keyData, transaction);

			await this.consumers.replaceRouteAccess(consumer.id, routeIds, transaction);
			const changes = [toConsumerChange(consumer, 'created', CREATED), toIssuedKeyChange(apiKey, consumer)];

			for (const change of changes) {
				await this.recorder.record(change, actor, transaction);
			}

			return { consumer, changes };
		});

		await this.recorder.announce(created.changes);
		const consumer = await this.findOrThrow(created.consumer.slug);

		return { ...toConsumerDto(consumer), key: generated.key };
	}

	async update(slug: string, input: UpdateConsumerInput, actor: ConfigActor): Promise<ConsumerDto> {
		const current = await this.findOrThrow(slug);
		const change = await this.prisma.transaction(async (transaction) => {
			const consumer = await this.consumers.update(current.id, { ...input }, transaction);
			const updateChange = toConsumerChange(consumer, 'updated', diffFields<Consumer>(current, consumer, AUDITED_FIELDS));

			await this.recorder.record(updateChange, actor, transaction);

			return updateChange;
		});

		await this.recorder.announce([change]);

		return toConsumerDto(await this.findOrThrow(slug));
	}

	// Keys are revoked with it, so they stop working now, not at purge time.
	async delete(slug: string, actor: ConfigActor): Promise<void> {
		const consumer = await this.findOrThrow(slug);
		const changes = await this.prisma.transaction(async (transaction) => {
			const now = new Date();
			const activeKeys = await this.apiKeys.listActive(consumer.id, transaction);
			const activeKeyIds = activeKeys.map((apiKey) => apiKey.id);

			await this.apiKeys.revoke(activeKeyIds, now, transaction);
			await this.consumers.softDelete(consumer.id, now, transaction);
			const keyChanges = activeKeys.map((apiKey) => toRevokedKeyChange(apiKey, consumer));
			const allChanges = [...keyChanges, toConsumerChange(consumer, 'deleted', DELETED)];

			for (const change of allChanges) {
				await this.recorder.record(change, actor, transaction);
			}

			return allChanges;
		});

		await this.recorder.announce(changes);
	}

	async issueKey(slug: string, label: string | undefined, actor: ConfigActor): Promise<ApiKeyCreatedDto> {
		const consumer = await this.findOrThrow(slug);
		const generated = generateApiKey();
		const issued = await this.prisma.transaction(async (transaction) => {
			await this.assertBelowActiveKeyLimit(consumer.id, slug, transaction);

			const data: Prisma.ApiKeyUncheckedCreateInput = { consumerId: consumer.id, keyHash: generated.keyHash, keyPrefix: generated.keyPrefix, label };
			const apiKey = await this.apiKeys.create(data, transaction);
			const change = toIssuedKeyChange(apiKey, consumer);

			await this.recorder.record(change, actor, transaction);

			return { apiKey, change };
		});

		await this.recorder.announce([issued.change]);

		return { ...toApiKeyDto(issued.apiKey), key: generated.key };
	}

	// Idempotent: revoking an already revoked key changes nothing and
	// records nothing.
	async revokeKey(slug: string, keyId: string, actor: ConfigActor): Promise<void> {
		const consumer = await this.findOrThrow(slug);
		const apiKey = await this.apiKeys.find(consumer.id, keyId);

		if (!apiKey) {
			throw new ConfigNotFoundError(`No key "${keyId}" for consumer "${slug}"`);
		}

		if (apiKey.revokedAt !== null) {
			return;
		}

		const change = toRevokedKeyChange(apiKey, consumer);

		await this.prisma.transaction(async (transaction) => {
			await this.apiKeys.revoke([apiKey.id], new Date(), transaction);
			await this.recorder.record(change, actor, transaction);
		});
		await this.recorder.announce([change]);
	}

	// Undoes a revocation made moments ago. Idempotent on an active key; refused once the
	// window has passed or when the consumer already has the maximum of active keys.
	async restoreKey(slug: string, keyId: string, actor: ConfigActor): Promise<void> {
		const consumer = await this.findOrThrow(slug);
		const apiKey = await this.apiKeys.find(consumer.id, keyId);

		if (!apiKey) {
			throw new ConfigNotFoundError(`No key "${keyId}" for consumer "${slug}"`);
		}

		const { revokedAt } = apiKey;

		if (revokedAt === null) {
			return;
		}

		const isWithinWindow = Date.now() - revokedAt.getTime() <= KEY_RESTORE_WINDOW_MS;

		if (!isWithinWindow) {
			throw new ConfigConflictError(`Key ${apiKey.keyPrefix} was revoked more than ${KEY_RESTORE_WINDOW_MS / MS_PER_SECOND} s ago; issue a new one`);
		}

		const change = toRestoredKeyChange(apiKey, consumer);

		await this.prisma.transaction(async (transaction) => {
			await this.assertBelowActiveKeyLimit(consumer.id, slug, transaction);
			const isRestored = await this.apiKeys.restore(apiKey.id, revokedAt, transaction);

			if (!isRestored) {
				throw new ConfigConflictError(`Key ${apiKey.keyPrefix} changed in the meantime; reload and try again`);
			}

			await this.recorder.record(change, actor, transaction);
		});
		await this.recorder.announce([change]);
	}

	async setRoutes(slug: string, routeIds: readonly string[], actor: ConfigActor): Promise<ConsumerDto> {
		const consumer = await this.findOrThrow(slug);
		const uniqueRouteIds = [...new Set(routeIds)];
		const change = toConsumerChange(consumer, 'updated', { kind: 'route_scope', allowedRouteCount: uniqueRouteIds.length });

		await this.prisma.transaction(async (transaction) => {
			await this.assertRoutesExist(uniqueRouteIds, transaction);
			await this.consumers.replaceRouteAccess(consumer.id, uniqueRouteIds, transaction);
			await this.recorder.record(change, actor, transaction);
		});
		await this.recorder.announce([change]);

		return toConsumerDto(await this.findOrThrow(slug));
	}

	private async findOrThrow(slug: string): Promise<ConsumerWithKeysAndRoutes> {
		const consumer = await this.consumers.findActiveBySlug(slug);

		if (!consumer) {
			throw new ConfigNotFoundError(`No consumer with slug "${slug}"`);
		}

		return consumer;
	}

	private async assertBelowActiveKeyLimit(consumerId: string, slug: string, executor: PrismaExecutor): Promise<void> {
		const activeCount = await this.apiKeys.countActive(consumerId, executor);

		if (activeCount >= MAX_ACTIVE_KEYS_PER_CONSUMER) {
			throw new ConfigConflictError(`"${slug}" already has ${MAX_ACTIVE_KEYS_PER_CONSUMER} active keys; revoke one first`);
		}
	}

	private async assertRoutesExist(routeIds: readonly string[], executor: PrismaExecutor): Promise<void> {
		if (routeIds.length === 0) {
			return;
		}

		const existingCount = await this.routes.countActiveIn(routeIds, executor);

		if (existingCount !== routeIds.length) {
			throw new ConfigNotFoundError('One or more of the given routes do not exist');
		}
	}

	private async writeUnique<R>(slug: string, work: (transaction: Prisma.TransactionClient) => Promise<R>): Promise<R> {
		try {
			return await this.prisma.transaction(work);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConfigConflictError(`A consumer with slug "${slug}" already exists`);
			}

			throw error;
		}
	}
}

function toConsumerChange(consumer: NamedConsumer, action: ConfigChange['action'], detail: ConfigChangeDetail): ConfigChange {
	return { entityType: 'consumer', entityId: consumer.id, entityName: consumer.name, action, detail };
}

// A key is named after its consumer; the prefix in the detail tells keys apart.
function toIssuedKeyChange(apiKey: ApiKey, consumer: NamedConsumer): ConfigChange {
	const detail: ConfigChangeDetail = { kind: 'key_issued', keyPrefix: apiKey.keyPrefix };

	return { entityType: 'api_key', entityId: apiKey.id, entityName: consumer.name, action: 'created', detail };
}

function toRevokedKeyChange(apiKey: ApiKey, consumer: NamedConsumer): ConfigChange {
	const detail: ConfigChangeDetail = { kind: 'key_revoked', keyPrefix: apiKey.keyPrefix };

	return { entityType: 'api_key', entityId: apiKey.id, entityName: consumer.name, action: 'deleted', detail };
}

function toRestoredKeyChange(apiKey: ApiKey, consumer: NamedConsumer): ConfigChange {
	const detail: ConfigChangeDetail = { kind: 'key_restored', keyPrefix: apiKey.keyPrefix };

	return { entityType: 'api_key', entityId: apiKey.id, entityName: consumer.name, action: 'updated', detail };
}
