import { useState } from 'react';

import { AdminApiError, clearInstanceChaos, setInstanceChaos } from '@/app/api/adminApiClient';
import type { ChaosState } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';

export type ChaosPreset = 'slow' | 'flaky' | 'down';

// What the instance runs now: nothing, one of the presets, or values set by hand.
export type ChaosMode = { readonly kind: 'off' } | { readonly kind: 'preset'; readonly preset: ChaosPreset } | { readonly kind: 'custom' };

export type InstanceTarget = { readonly serviceSlug: string; readonly instanceId: string; readonly instanceName: string };

export type InstanceChaos = {
	readonly apply: (chaos: ChaosState) => Promise<void>;
	readonly applyPreset: (preset: ChaosPreset) => Promise<void>;
	readonly normalize: () => Promise<void>;
	readonly isApplying: boolean;
	// i18n key of the last failure, cleared by the next attempt.
	readonly errorKey: string | null;
};

export const NO_CHAOS: ChaosState = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false };

export const CHAOS_PRESETS: Readonly<Record<ChaosPreset, ChaosState>> = {
	slow: { ...NO_CHAOS, latencyMs: 800 },
	flaky: { ...NO_CHAOS, errorRate: 0.3 },
	down: { ...NO_CHAOS, isDown: true },
};

export const CHAOS_PRESET_NAMES: readonly ChaosPreset[] = ['slow', 'flaky', 'down'];

const HTTP_FORBIDDEN = 403;
const HTTP_BAD_GATEWAY = 502;

export function isChaosActive(chaos: ChaosState | null): boolean {
	if (chaos === null) {
		return false;
	}

	return chaos.latencyMs > 0 || chaos.jitterMs > 0 || chaos.errorRate > 0 || chaos.isDown;
}

export function chaosModeOf(chaos: ChaosState | null): ChaosMode {
	if (!isChaosActive(chaos) || chaos === null) {
		return { kind: 'off' };
	}

	const preset = CHAOS_PRESET_NAMES.find((name) => isSameChaos(CHAOS_PRESETS[name], chaos));

	if (preset === undefined) {
		return { kind: 'custom' };
	}

	return { kind: 'preset', preset };
}

export function useInstanceChaos(target: InstanceTarget): InstanceChaos {
	const emitLocalEvent = useEmitLocalEvent();
	const [isApplying, setIsApplying] = useState(false);
	const [errorKey, setErrorKey] = useState<string | null>(null);

	async function run(action: () => Promise<ChaosState>): Promise<void> {
		setIsApplying(true);
		setErrorKey(null);

		try {
			const chaos = await action();
			const body = {
				type: 'chaos.changed',
				instanceId: target.instanceId,
				instanceName: target.instanceName,
				serviceSlug: target.serviceSlug,
				chaos,
			} as const;

			emitLocalEvent(stampLocalEvent(body));
		} catch (error) {
			setErrorKey(errorKeyFor(error));
		} finally {
			setIsApplying(false);
		}
	}

	const apply = (chaos: ChaosState): Promise<void> => run(() => setInstanceChaos(target.serviceSlug, target.instanceId, chaos));

	return {
		apply,
		applyPreset: (preset) => apply(CHAOS_PRESETS[preset]),
		normalize: () => run(() => clearInstanceChaos(target.serviceSlug, target.instanceId)),
		isApplying,
		errorKey,
	};
}

function errorKeyFor(error: unknown): string {
	if (!(error instanceof AdminApiError)) {
		return 'common.unexpectedError';
	}

	if (error.statusCode === HTTP_FORBIDDEN) {
		return 'chaos.errors.disabled';
	}

	if (error.statusCode === HTTP_BAD_GATEWAY) {
		return 'chaos.errors.unreachable';
	}

	return 'common.unexpectedError';
}

function isSameChaos(left: ChaosState, right: ChaosState): boolean {
	const isSameDelay = left.latencyMs === right.latencyMs && left.jitterMs === right.jitterMs;

	return isSameDelay && left.errorRate === right.errorRate && left.isDown === right.isDown;
}
