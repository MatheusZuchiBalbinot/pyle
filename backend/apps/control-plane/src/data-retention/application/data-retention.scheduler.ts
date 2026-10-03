import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { DataRetentionService } from './data-retention.service.js';

const RETENTION_PASS_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Delayed after boot so a restart loop cannot become a purge loop.
const FIRST_PASS_DELAY_MS = 5 * 60 * 1000;

@Injectable()
export class DataRetentionScheduler implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(DataRetentionScheduler.name);
	private intervalHandle: NodeJS.Timeout | undefined;
	private firstPassHandle: NodeJS.Timeout | undefined;

	constructor(private readonly retentionService: DataRetentionService) {}

	onModuleInit(): void {
		this.firstPassHandle = setTimeout(() => void this.runPass(), FIRST_PASS_DELAY_MS);
		this.intervalHandle = setInterval(() => void this.runPass(), RETENTION_PASS_INTERVAL_MS);
	}

	onModuleDestroy(): void {
		if (this.firstPassHandle) {
			clearTimeout(this.firstPassHandle);
		}

		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
		}
	}

	private async runPass(): Promise<void> {
		try {
			await this.retentionService.runPass();
		} catch (error) {
			this.logger.error(`Retention pass failed: ${toErrorMessage(error)}`);
		}
	}
}
