import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';

import type {
	ApiKeyCreatedDto,
	ConsumerCreatedDto,
	ConsumerDto,
	RouteDto,
	ServiceDto,
} from '../gateway-config/interface/dto/gateway-config-responses.js';

const NOT_FOUND = 404;
const JSON_CONTENT_TYPE = 'application/json';

export type FetchFunction = typeof fetch;

export type CreateServiceBody = {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly lbStrategy: string;
	// null: a service the console cannot scale (the benchmark's upstream).
	readonly scalingProfile: string | null;
};

export type CreateRouteBody = {
	readonly name: string;
	readonly pathPrefix: string;
	readonly serviceSlug: string;
	readonly isAuthRequired: boolean;
	readonly rateLimitPerMinute: number | null;
	readonly methods: readonly string[];
	readonly stripPrefix: boolean;
};
type SeedAdminApiOptions = {
	readonly baseUrl: string;
	readonly token: string;
	readonly fetch?: FetchFunction;
};
type CreateInstanceBody = { readonly name: string; readonly url: string; readonly weight: number };
type CreateConsumerBody = {
	readonly slug: string;
	readonly name: string;
	readonly rateLimitPerMinute: number;
	readonly routeIds: readonly string[];
};

export class SeedAdminApiError extends Error {
	override readonly name = 'SeedAdminApiError';
}

// Through the admin API, like an operator: validated, audited and announced. The seed and the
// benchmark (scripts/bench.ts) use it.
export class SeedAdminApiClient {
	private readonly fetch: FetchFunction;

	constructor(private readonly options: SeedAdminApiOptions) {
		this.fetch = options.fetch ?? fetch;
	}

	listServices(): Promise<readonly ServiceDto[]> {
		return this.request<readonly ServiceDto[]>('GET', '/admin/services');
	}

	getService(slug: string): Promise<ServiceDto | null> {
		return this.requestOrNull<ServiceDto>('GET', `/admin/services/${encodeURIComponent(slug)}`);
	}

	createService(body: CreateServiceBody): Promise<ServiceDto> {
		return this.request<ServiceDto>('POST', '/admin/services', body);
	}

	setScalingProfile(slug: string, scalingProfile: string): Promise<ServiceDto> {
		return this.request<ServiceDto>('PATCH', `/admin/services/${slug}`, { scalingProfile });
	}

	setInstanceUrl(serviceSlug: string, instanceId: string, url: string): Promise<unknown> {
		return this.request('PATCH', `/admin/services/${encodeURIComponent(serviceSlug)}/instances/${instanceId}`, { url });
	}

	addInstance(serviceSlug: string, body: CreateInstanceBody): Promise<unknown> {
		return this.request('POST', `/admin/services/${encodeURIComponent(serviceSlug)}/instances`, body);
	}

	listRoutes(): Promise<readonly RouteDto[]> {
		return this.request<readonly RouteDto[]>('GET', '/admin/routes');
	}

	createRoute(body: CreateRouteBody): Promise<RouteDto> {
		return this.request<RouteDto>('POST', '/admin/routes', body);
	}

	getConsumer(slug: string): Promise<ConsumerDto | null> {
		return this.requestOrNull<ConsumerDto>('GET', `/admin/consumers/${encodeURIComponent(slug)}`);
	}

	// The consumer comes back with its first key, in clear, this one time.
	createConsumer(body: CreateConsumerBody): Promise<ConsumerCreatedDto> {
		return this.request<ConsumerCreatedDto>('POST', '/admin/consumers', body);
	}

	issueKey(consumerSlug: string, label: string): Promise<ApiKeyCreatedDto> {
		return this.request<ApiKeyCreatedDto>('POST', `/admin/consumers/${encodeURIComponent(consumerSlug)}/keys`, { label });
	}

	async revokeKey(consumerSlug: string, keyId: string): Promise<void> {
		await this.request('DELETE', `/admin/consumers/${encodeURIComponent(consumerSlug)}/keys/${encodeURIComponent(keyId)}`);
	}

	async deleteRoute(routeId: string): Promise<void> {
		await this.request('DELETE', `/admin/routes/${encodeURIComponent(routeId)}`);
	}

	async deleteService(slug: string): Promise<void> {
		await this.request('DELETE', `/admin/services/${encodeURIComponent(slug)}`);
	}

	async deleteConsumer(slug: string): Promise<void> {
		await this.request('DELETE', `/admin/consumers/${encodeURIComponent(slug)}`);
	}

	async setChaos(serviceSlug: string, instanceId: string, chaos: ChaosState): Promise<void> {
		await this.request('PUT', `/admin/services/${encodeURIComponent(serviceSlug)}/instances/${encodeURIComponent(instanceId)}/chaos`, chaos);
	}

	async clearChaos(serviceSlug: string, instanceId: string): Promise<void> {
		await this.request('DELETE', `/admin/services/${encodeURIComponent(serviceSlug)}/instances/${encodeURIComponent(instanceId)}/chaos`);
	}

	private async requestOrNull<T>(method: string, path: string): Promise<T | null> {
		const response = await this.send(method, path, undefined);

		if (response.status === NOT_FOUND) {
			return null;
		}

		return this.parse<T>(method, path, response);
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const response = await this.send(method, path, body);

		return this.parse<T>(method, path, response);
	}

	private send(method: string, path: string, body: unknown): Promise<Response> {
		const headers: Record<string, string> = { authorization: `Bearer ${this.options.token}` };

		if (body !== undefined) {
			headers['content-type'] = JSON_CONTENT_TYPE;
		}

		const init: RequestInit = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };

		return this.fetch(`${this.options.baseUrl}${path}`, init);
	}

	private async parse<T>(method: string, path: string, response: Response): Promise<T> {
		const text = await response.text();

		if (!response.ok) {
			throw new SeedAdminApiError(`${method} ${path} answered ${response.status}: ${text}`);
		}

		return (text === '' ? undefined : JSON.parse(text)) as T;
	}
}
