import type { TFunction } from 'i18next';

// The gateway writes reasons in English (the AI and logs read them); these patterns match
// the ones it writes.

export type ReasonMessage = { readonly key: string; readonly values: Readonly<Record<string, string>> };

type ReasonPattern = { readonly pattern: RegExp; readonly key: string; readonly names: readonly string[] };

const PATTERNS: readonly ReasonPattern[] = [
	{ pattern: /^(\d+) consecutive failed health checks \((.+)\)$/, key: 'gateway.reason.failedChecks', names: ['count', 'detail'] },
	{ pattern: /^(\d+) consecutive successful health checks$/, key: 'gateway.reason.passedChecks', names: ['count'] },
	{ pattern: /^(\d+) consecutive request failures \((.+)\)$/, key: 'gateway.reason.failedRequests', names: ['count', 'detail'] },
	{ pattern: /^probe request failed \((.+)\)$/, key: 'gateway.reason.probeFailed', names: ['detail'] },
	{ pattern: /^cooldown elapsed, probing$/, key: 'gateway.reason.probing', names: [] },
	{ pattern: /^probe request succeeded$/, key: 'gateway.reason.probeSucceeded', names: [] },
];

// Null for a reason it does not know: shown as written.
export function toReasonMessage(reason: string): ReasonMessage | null {
	for (const { pattern, key, names } of PATTERNS) {
		const match = pattern.exec(reason);

		if (match) {
			return { key, values: Object.fromEntries(names.map((name, index) => [name, match[index + 1]])) };
		}
	}

	return null;
}

export function describeReason(reason: string, t: TFunction): string {
	const message = toReasonMessage(reason);

	return message === null ? reason : t(message.key, message.values);
}
