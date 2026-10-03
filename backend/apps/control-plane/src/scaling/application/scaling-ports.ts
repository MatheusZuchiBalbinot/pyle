// Abstract classes so Nest can inject them and tests can pass fakes.

export type ManagedContainerSpec = {
	readonly containerName: string;
	readonly hostPort: number;
	// The demo-service's SERVICE_NAME and INSTANCE_ID.
	readonly demoServiceName: string;
	readonly instanceName: string;
	readonly serviceSlug: string;
	readonly instanceId: string;
};

export type ManagedContainer = {
	readonly name: string;
	readonly isRunning: boolean;
};

export abstract class ContainerDriver {
	abstract isReachable(): Promise<boolean>;
	abstract start(spec: ManagedContainerSpec): Promise<void>;
	// Gone already is fine.
	abstract remove(containerName: string): Promise<void>;
	// Every container scaling created, running or not.
	abstract listManaged(): Promise<readonly ManagedContainer[]>;
}

export abstract class InstanceHealthProbe {
	// True once `url` answers 2xx, false if it never does within the time.
	abstract waitUntilHealthy(url: string, timeoutMs: number): Promise<boolean>;
}
