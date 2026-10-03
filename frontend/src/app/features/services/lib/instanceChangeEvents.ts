import type { RealtimeEvent } from '@/app/api/realtimeEvents';

// What adds a line to an instance's configuration history: chaos injected or
// cleared on it, or an edit to it.
export function isInstanceChangeEvent(event: RealtimeEvent, instanceId: string): boolean {
	if (event.type === 'chaos.changed') {
		return event.instanceId === instanceId;
	}

	if (event.type === 'config.changed') {
		return event.entityType === 'instance' && event.entityId === instanceId;
	}

	return false;
}
