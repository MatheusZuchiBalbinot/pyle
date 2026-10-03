export interface InstanceAvailability {
	isAvailable(instanceId: string): boolean;
}

export class AlwaysAvailable implements InstanceAvailability {
	isAvailable(): boolean {
		return true;
	}
}
