import type Docker from 'dockerode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DockerContainerDriver, MANAGED_LABEL } from './docker-container-driver.js';

const SPEC = {
	containerName: 'pyle-managed-orders-ab12cd',
	hostPort: 48200,
	demoServiceName: 'orders',
	instanceName: 'orders-m-ab12cd',
	serviceSlug: 'orders',
	instanceId: 'i1',
};

function buildDocker(overrides: Record<string, unknown> = {}) {
	const container = { start: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
	const docker = {
		ping: vi.fn().mockResolvedValue('OK'),
		listImages: vi.fn().mockResolvedValue([{ Id: 'img' }]),
		pull: vi.fn().mockResolvedValue('stream'),
		modem: { followProgress: vi.fn((_stream: unknown, done: (error: unknown) => void) => done(null)) },
		createContainer: vi.fn().mockResolvedValue(container),
		getContainer: vi.fn().mockReturnValue(container),
		listContainers: vi.fn().mockResolvedValue([]),
		...overrides,
	};

	return { docker, container, driver: new DockerContainerDriver(docker as unknown as Docker) };
}

beforeEach(() => {
	vi.stubEnv('SCALING_ALLOWED', 'true');
	vi.stubEnv('DEMO_SERVICE_SOURCE_DIR', '/repo/infra/demo-service');
	vi.stubEnv('DEMO_CHAOS_TOKEN', 'a-chaos-token-long-enough');
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('DockerContainerDriver', () => {
	it('says whether the daemon answers', async () => {
		await expect(buildDocker().driver.isReachable()).resolves.toBe(true);
		await expect(buildDocker({ ping: vi.fn().mockRejectedValue(new Error('ENOENT')) }).driver.isReachable()).resolves.toBe(false);
	});

	it('starts a labelled demo-service container on its host port', async () => {
		const { docker, driver, container } = buildDocker();

		await driver.start(SPEC);

		const options = vi.mocked(docker.createContainer).mock.calls[0]?.[0];

		expect(options).toMatchObject({
			Image: 'node:22-alpine',
			name: SPEC.containerName,
			Labels: { [MANAGED_LABEL]: 'true', 'pyle.service': 'orders', 'pyle.instance': 'i1' },
			HostConfig: { Binds: ['/repo/infra/demo-service:/app:ro'], PortBindings: { '8080/tcp': [{ HostPort: '48200' }] } },
		});
		expect(options.Env).toEqual(['PORT=8080', 'SERVICE_NAME=orders', 'INSTANCE_ID=orders-m-ab12cd', 'CHAOS_TOKEN=a-chaos-token-long-enough']);
		expect(container.start).toHaveBeenCalled();
		expect(docker.pull).not.toHaveBeenCalled();
	});

	it('pulls the image the first time, and runs without a chaos token when there is none', async () => {
		vi.stubEnv('DEMO_CHAOS_TOKEN', '');
		const { docker, driver } = buildDocker({ listImages: vi.fn().mockResolvedValue([]) });

		await driver.start(SPEC);

		expect(docker.pull).toHaveBeenCalledWith('node:22-alpine');
		expect(vi.mocked(docker.createContainer).mock.calls[0]?.[0].Env).not.toContain(expect.stringMatching(/^CHAOS_TOKEN/));
	});

	it('reports a failed pull', async () => {
		const followProgress = vi.fn((_stream: unknown, done: (error: unknown) => void) => done(new Error('manifest unknown')));
		const { driver } = buildDocker({ listImages: vi.fn().mockResolvedValue([]), modem: { followProgress } });

		await expect(driver.start(SPEC)).rejects.toThrow('manifest unknown');
	});

	it('removes a container that was created but did not start', async () => {
		const { driver, container } = buildDocker();

		container.start.mockRejectedValue(new Error('port is already allocated'));

		await expect(driver.start(SPEC)).rejects.toThrow('port is already allocated');
		expect(container.remove).toHaveBeenCalledWith({ force: true, v: true });
	});

	it('refuses to start anything where scaling is off', async () => {
		vi.stubEnv('SCALING_ALLOWED', 'false');
		await expect(buildDocker().driver.start(SPEC)).rejects.toThrow('SCALING_ALLOWED');
	});

	it('treats an already removed container as removed, and reports other failures', async () => {
		const { driver, container } = buildDocker();

		container.remove.mockRejectedValueOnce({ statusCode: 404 }).mockRejectedValueOnce(new Error('daemon busy'));

		await expect(driver.remove('gone')).resolves.toBeUndefined();
		await expect(driver.remove('busy')).rejects.toThrow('Could not remove container busy: daemon busy');
	});

	it('lists only managed containers, with whether they run', async () => {
		const listContainers = vi.fn().mockResolvedValue([
			{ Names: ['/pyle-managed-orders-a'], State: 'running' },
			{ Names: ['/pyle-managed-orders-b'], State: 'exited' },
			{ Names: [], State: 'created' },
		]);
		const { driver } = buildDocker({ listContainers });

		await expect(driver.listManaged()).resolves.toEqual([
			{ name: 'pyle-managed-orders-a', isRunning: true },
			{ name: 'pyle-managed-orders-b', isRunning: false },
			{ name: '', isRunning: false },
		]);
		expect(listContainers).toHaveBeenCalledWith({ all: true, filters: { label: ['pyle.managed=true'] } });
	});
});
