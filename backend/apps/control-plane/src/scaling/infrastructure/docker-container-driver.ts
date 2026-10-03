import Docker from 'dockerode';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getScalingConfig } from '../../config/scaling.js';
import { ContainerDriver, type ManagedContainer, type ManagedContainerSpec } from '../application/scaling-ports.js';

export const MANAGED_LABEL = 'pyle.managed';
const IMAGE = 'node:22-alpine';
const CONTAINER_PORT = '8080/tcp';
const DOCKER_STATUS_NOT_FOUND = 404;
const RUNNING_STATE = 'running';
// Comes back after a host or daemon restart, unless stopped on purpose.
const RESTART_POLICY: Docker.HostRestartPolicy = { Name: 'unless-stopped' };

// Containers are labelled so the reconciler can tell them from everything else.
export class DockerContainerDriver extends ContainerDriver {
	private readonly docker: Docker;

	constructor(docker?: Docker) {
		super();
		this.docker = docker ?? new Docker();
	}

	async isReachable(): Promise<boolean> {
		try {
			await this.docker.ping();

			return true;
		} catch {
			// Unreachable is an answer, not an error: the reconciler skips a round.
			return false;
		}
	}

	async start(spec: ManagedContainerSpec): Promise<void> {
		const config = getScalingConfig();

		if (!config.isAllowed) {
			throw new Error('Scaling is not enabled (SCALING_ALLOWED)');
		}

		await this.pullImageIfMissing();
		const container = await this.docker.createContainer(toCreateOptions(spec, config.demoServiceSourceDir, config.chaosToken));

		try {
			await container.start();
		} catch (error) {
			// Created but never started (host port taken, say): nobody else
			// would ever remove it.
			await this.remove(spec.containerName);
			throw error;
		}
	}

	async remove(containerName: string): Promise<void> {
		try {
			await this.docker.getContainer(containerName).remove({ force: true, v: true });
		} catch (error) {
			if (hasStatusCode(error, DOCKER_STATUS_NOT_FOUND)) {
				return;
			}

			throw new Error(`Could not remove container ${containerName}: ${toErrorMessage(error)}`);
		}
	}

	async listManaged(): Promise<readonly ManagedContainer[]> {
		const containers = await this.docker.listContainers({ all: true, filters: { label: [`${MANAGED_LABEL}=true`] } });

		return containers.map((container) => ({ name: (container.Names[0] ?? '').replace(/^\//, ''), isRunning: container.State === RUNNING_STATE }));
	}

	private async pullImageIfMissing(): Promise<void> {
		const images = await this.docker.listImages({ filters: { reference: [IMAGE] } });

		if (images.length > 0) {
			return;
		}

		const stream = await this.docker.pull(IMAGE);

		await new Promise<void>((resolve, reject) => {
			this.docker.modem.followProgress(stream, (error: unknown) => (error ? reject(new Error(toErrorMessage(error))) : resolve()));
		});
	}
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
	return typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === statusCode;
}

function toCreateOptions(spec: ManagedContainerSpec, sourceDir: string, chaosToken: string | null): Docker.ContainerCreateOptions {
	const env = [
		`PORT=8080`,
		`SERVICE_NAME=${spec.demoServiceName}`,
		`INSTANCE_ID=${spec.instanceName}`,
		...(chaosToken ? [`CHAOS_TOKEN=${chaosToken}`] : []),
	];
	const labels = { [MANAGED_LABEL]: 'true', 'pyle.service': spec.serviceSlug, 'pyle.instance': spec.instanceId };
	const hostConfig: Docker.HostConfig = {
		Binds: [`${sourceDir}:/app:ro`],
		PortBindings: { [CONTAINER_PORT]: [{ HostPort: String(spec.hostPort) }] },
		RestartPolicy: RESTART_POLICY,
	};

	return {
		Image: IMAGE,
		name: spec.containerName,
		Cmd: ['node', '/app/server.mjs'],
		Env: env,
		Labels: labels,
		ExposedPorts: { [CONTAINER_PORT]: {} },
		HostConfig: hostConfig,
	};
}
