// Set by PATCH /admin/services/:slug/instances/:id when the change left the

import type {
	ChaosState,
	CreateInstanceInput,
	CreateServiceInput,
	InstanceWarning,
	Service,
	ServiceInstance,
	UpdateInstanceInput,
	UpdateInstanceResult,
	UpdateServiceInput,
} from '../adminApiTypes';
import { jsonBody, request, requestJson, requestNoContent } from './request';

// service with no enabled instance (allowed, but worth a warning).
const INSTANCE_WARNING_HEADER = 'x-pyle-warning';

const INSTANCE_WARNINGS: ReadonlySet<string> = new Set<InstanceWarning>(['service-has-no-enabled-instance']);

export function listServices(): Promise<readonly Service[]> {
	return requestJson('/admin/services');
}

export function createService(input: CreateServiceInput): Promise<Service> {
	return requestJson('/admin/services', jsonBody('POST', input));
}

export function updateService(slug: string, input: UpdateServiceInput): Promise<Service> {
	return requestJson(servicePath(slug), jsonBody('PATCH', input));
}

export function setServiceReplicas(slug: string, managedReplicas: number): Promise<Service> {
	return requestJson(`${servicePath(slug)}/replicas`, jsonBody('PUT', { managedReplicas }));
}

export function deleteService(slug: string): Promise<void> {
	return requestNoContent(servicePath(slug), { method: 'DELETE' });
}

export function createInstance(serviceSlug: string, input: CreateInstanceInput): Promise<ServiceInstance> {
	return requestJson(`${servicePath(serviceSlug)}/instances`, jsonBody('POST', input));
}

export async function updateInstance(serviceSlug: string, instanceId: string, input: UpdateInstanceInput): Promise<UpdateInstanceResult> {
	const response = await request(instancePath(serviceSlug, instanceId), jsonBody('PATCH', input));
	const instance = (await response.json()) as ServiceInstance;

	return { instance, warning: readInstanceWarning(response) };
}

export function deleteInstance(serviceSlug: string, instanceId: string): Promise<void> {
	return requestNoContent(instancePath(serviceSlug, instanceId), { method: 'DELETE' });
}

export function setInstanceChaos(serviceSlug: string, instanceId: string, chaos: ChaosState): Promise<ChaosState> {
	return requestJson(`${instancePath(serviceSlug, instanceId)}/chaos`, jsonBody('PUT', chaos));
}

export function clearInstanceChaos(serviceSlug: string, instanceId: string): Promise<ChaosState> {
	return requestJson(`${instancePath(serviceSlug, instanceId)}/chaos`, { method: 'DELETE' });
}

function servicePath(slug: string): string {
	return `/admin/services/${encodeURIComponent(slug)}`;
}

function instancePath(serviceSlug: string, instanceId: string): string {
	return `${servicePath(serviceSlug)}/instances/${encodeURIComponent(instanceId)}`;
}

function readInstanceWarning(response: Response): InstanceWarning | null {
	const header = response.headers.get(INSTANCE_WARNING_HEADER);

	if (header === null || !INSTANCE_WARNINGS.has(header)) {
		return null;
	}

	return header as InstanceWarning;
}
