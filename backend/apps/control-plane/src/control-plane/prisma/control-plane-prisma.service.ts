import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/control-plane-client';

import { EntityChangeBus } from '../entity-changes/entity-change-bus.service.js';
import { createEntityChangeMiddleware } from '../entity-changes/entity-change.middleware.js';

type InteractiveTransaction<R> = (transaction: Prisma.TransactionClient) => Promise<R>;

type TransactionOptions = { readonly maxWait?: number; readonly timeout?: number; readonly isolationLevel?: Prisma.TransactionIsolationLevel };

// Every write through it is announced on EntityChangeBus.
@Injectable()
export class ControlPlanePrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	constructor(private readonly entityChanges: EntityChangeBus) {
		super();
		this.$use(createEntityChangeMiddleware(entityChanges));
	}

	async onModuleInit(): Promise<void> {
		await this.$connect();
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
	}

	// Instead of $transaction: changes made inside are announced only after commit, and
	// dropped on rollback.
	transaction<R>(work: InteractiveTransaction<R>, options?: TransactionOptions): Promise<R> {
		return this.entityChanges.runAfterCommit(() => this.$transaction(work, options));
	}
}
