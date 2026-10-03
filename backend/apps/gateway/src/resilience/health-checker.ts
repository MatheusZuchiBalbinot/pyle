import type { GatewayConfigSnapshot, HealthCheckConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { ProbeInstance, ProbeTarget } from './probe-instance.js';
import type { ProbeResult } from './probe-result.js';

type HealthCheckerOptions = {
	readonly probe: ProbeInstance;
	readonly onResult: (instanceId: string, result: ProbeResult) => void;
	// A number in [0, 1): spreads the first checks over one interval.
	readonly random: () => number;
};

type Entry = {
	target: ProbeTarget;
	timer: ReturnType<typeof setTimeout> | null;
};

// Drained instances are checked too, so their state is known when they come back. Each
// instance has a chained timeout, so a slow check delays the next one instead of piling up.
export class HealthChecker {
	private readonly entries = new Map<string, Entry>();
	private isRunning = false;

	constructor(private readonly options: HealthCheckerOptions) {}

	// Instances synced before the start (the first configuration is applied
	// before the gateway's hooks run) get their first check scheduled here.
	start(snapshot: GatewayConfigSnapshot): void {
		this.isRunning = true;
		this.syncInstances(snapshot);

		for (const entry of this.entries.values()) {
			if (entry.timer === null) {
				this.schedule(entry, this.initialDelay(entry.target.healthCheck));
			}
		}
	}

	// New instances get scheduled, removed ones stop being checked, changed
	// settings apply from the next check.
	syncInstances(snapshot: GatewayConfigSnapshot): void {
		const current = new Set<string>();

		for (const service of snapshot.services) {
			for (const instance of service.instances) {
				current.add(instance.id);
				this.upsert({ instance, healthCheck: service.healthCheck });
			}
		}

		for (const [instanceId, entry] of this.entries) {
			if (current.has(instanceId)) {
				continue;
			}

			if (entry.timer) {
				clearTimeout(entry.timer);
			}

			this.entries.delete(instanceId);
		}
	}

	stop(): void {
		this.isRunning = false;

		for (const entry of this.entries.values()) {
			if (entry.timer) {
				clearTimeout(entry.timer);
			}
		}

		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	private upsert(target: ProbeTarget): void {
		const existing = this.entries.get(target.instance.id);

		if (existing) {
			existing.target = target;

			return;
		}

		const entry: Entry = { target, timer: null };

		this.entries.set(target.instance.id, entry);

		if (this.isRunning) {
			this.schedule(entry, this.initialDelay(target.healthCheck));
		}
	}

	private initialDelay(healthCheck: HealthCheckConfig): number {
		return Math.floor(this.options.random() * healthCheck.intervalMs);
	}

	private schedule(entry: Entry, delayMs: number): void {
		entry.timer = setTimeout(() => void this.check(entry), delayMs);
	}

	private async check(entry: Entry): Promise<void> {
		entry.timer = null;
		const result = await this.options.probe(entry.target);
		// Removed (or stopped) while the check was out: nothing to record,
		// nothing to schedule.
		const isStillTracked = this.isRunning && this.entries.get(entry.target.instance.id) === entry;

		if (!isStillTracked) {
			return;
		}

		this.options.onResult(entry.target.instance.id, result);
		this.schedule(entry, entry.target.healthCheck.intervalMs);
	}
}
