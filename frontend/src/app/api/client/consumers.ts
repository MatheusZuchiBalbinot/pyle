import type {
	ApiKeyCreated,
	Consumer,
	ConsumerCreated,
	CreateConsumerInput,
	IssueApiKeyInput,
	Page,
	PageQuery,
	UpdateConsumerInput,
} from '../adminApiTypes';
import { appendPageQuery, jsonBody, requestJson, requestNoContent, toQuery } from './request';

export function listConsumers(page: PageQuery = {}): Promise<Page<Consumer>> {
	const params = new URLSearchParams();

	appendPageQuery(params, page);

	return requestJson(`/admin/consumers${toQuery(params)}`);
}

export function createConsumer(input: CreateConsumerInput): Promise<ConsumerCreated> {
	return requestJson('/admin/consumers', jsonBody('POST', input));
}

export function updateConsumer(slug: string, input: UpdateConsumerInput): Promise<Consumer> {
	return requestJson(consumerPath(slug), jsonBody('PATCH', input));
}

export function deleteConsumer(slug: string): Promise<void> {
	return requestNoContent(consumerPath(slug), { method: 'DELETE' });
}

export function issueApiKey(consumerSlug: string, input: IssueApiKeyInput = {}): Promise<ApiKeyCreated> {
	return requestJson(`${consumerPath(consumerSlug)}/keys`, jsonBody('POST', input));
}

export function revokeApiKey(consumerSlug: string, keyId: string): Promise<void> {
	return requestNoContent(`${consumerPath(consumerSlug)}/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
}

// Undoes a revocation made within the last minute (409 past it).
export function restoreApiKey(consumerSlug: string, keyId: string): Promise<void> {
	return requestNoContent(`${consumerPath(consumerSlug)}/keys/${encodeURIComponent(keyId)}/restore`, { method: 'POST' });
}

// An empty list opens every route to the consumer.
export function setConsumerRoutes(consumerSlug: string, routeIds: readonly string[]): Promise<Consumer> {
	return requestJson(`${consumerPath(consumerSlug)}/routes`, jsonBody('PUT', { routeIds }));
}

function consumerPath(slug: string): string {
	return `/admin/consumers/${encodeURIComponent(slug)}`;
}
