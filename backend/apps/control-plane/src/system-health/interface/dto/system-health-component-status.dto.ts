import type { SystemHealthComponent, SystemHealthStatus } from '@prisma/control-plane-client';

export class SystemHealthComponentStatusDto {
	readonly component!: SystemHealthComponent;
	readonly status!: SystemHealthStatus;
	readonly detail!: string | null;
}
