import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/control-plane-client';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { EntityChange, EntityChangeListener } from './entity-change.js';

// Caches subscribe to drop what changed; RealtimeModule forwards changes to the console.
// Listeners are isolated: one throwing never stops the others or the write.
@Injectable()
export class EntityChangeBus {
	private readonly logger = new Logger(EntityChangeBus.name);
	private readonly listeners = new Set<EntityChangeListener>();
	private readonly pendingByTransaction = new AsyncLocalStorage<EntityChange[]>();

	onChange(listener: EntityChangeListener): () => void {
		this.listeners.add(listener);

		return () => {
			this.listeners.delete(listener);
		};
	}

	onModelChange(models: ReadonlyArray<Prisma.ModelName>, listener: EntityChangeListener): () => void {
		const watched: ReadonlySet<Prisma.ModelName> = new Set(models);

		return this.onChange((change) => {
			if (watched.has(change.model)) {
				listener(change);
			}
		});
	}

	emit(change: EntityChange): void {
		const pending = this.pendingByTransaction.getStore();

		if (pending) {
			pending.push(change);

			return;
		}

		this.dispatch(change);
	}

	async runAfterCommit<R>(work: () => Promise<R>): Promise<R> {
		const pending: EntityChange[] = [];
		const result = await this.pendingByTransaction.run(pending, work);

		for (const change of pending) {
			this.dispatch(change);
		}

		return result;
	}

	private dispatch(change: EntityChange): void {
		for (const listener of this.listeners) {
			try {
				listener(change);
			} catch (error) {
				this.logger.warn(`Entity change listener failed for ${change.model} ${change.action}: ${toErrorMessage(error)}`);
			}
		}
	}
}
