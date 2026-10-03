import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getAlertEvaluationIntervalMs } from '../../../config/traffic.js';
import { GatewayAlertService } from './gateway-alert.service.js';

// A pass still running when the next tick comes skips that tick.
@Injectable()
export class AlertEvaluatorScheduler implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(AlertEvaluatorScheduler.name);
	private timer: NodeJS.Timeout | null = null;
	private isEvaluating = false;

	constructor(private readonly alerts: GatewayAlertService) {}

	onModuleInit(): void {
		this.timer = setInterval(() => void this.tick(), getAlertEvaluationIntervalMs());
		// Never what keeps the process alive.
		this.timer.unref();
	}

	onModuleDestroy(): void {
		if (this.timer) {
			clearInterval(this.timer);
		}

		this.timer = null;
	}

	async tick(): Promise<void> {
		if (this.isEvaluating) {
			return;
		}

		this.isEvaluating = true;

		try {
			await this.alerts.evaluate();
		} catch (error) {
			this.logger.error(`Alert evaluation failed: ${toErrorMessage(error)}`);
		} finally {
			this.isEvaluating = false;
		}
	}
}
