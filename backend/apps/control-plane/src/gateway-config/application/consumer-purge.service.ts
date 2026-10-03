import { Injectable, Logger } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { ConsumerRepository } from '../infrastructure/consumer.repository.js';

// Traffic samples stay after the purge: the history keeps adding up.
@Injectable()
export class ConsumerPurgeService {
	private readonly logger = new Logger(ConsumerPurgeService.name);

	constructor(private readonly consumers: ConsumerRepository) {}

	async purgeDeletedBefore(cutoff: Date): Promise<readonly string[]> {
		const expired = await this.consumers.listDeletedBefore(cutoff);
		const purged: string[] = [];

		for (const consumer of expired) {
			const wasPurged = await this.purgeOne(consumer.id, consumer.slug);

			if (wasPurged) {
				purged.push(consumer.slug);
			}
		}

		return purged;
	}

	// One failing purge must not stop the rest; it is retried next pass.
	private async purgeOne(id: string, slug: string): Promise<boolean> {
		try {
			await this.consumers.purge(id);

			return true;
		} catch (error) {
			this.logger.error(`Could not purge consumer "${slug}": ${toErrorMessage(error)}`);

			return false;
		}
	}
}
