import { useTranslation } from 'react-i18next';

import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { queryKeys } from '@/app/core/query/queryKeys';

import { listConsumers, listRoutes, listServices } from '../api/adminApiClient';
import type { Consumer, Route, Service, ServiceInstance } from '../api/adminApiTypes';
import { isEntityChange, type BroadcastEntity, type RealtimeEvent } from '../api/realtimeEvents';
import { useAsyncResource, type UseAsyncResourceOptions, type UseAsyncResourceResult } from './useAsyncResource';

export type ConfigListData = {
	readonly services: readonly Service[];
	readonly routes: readonly Route[];
	readonly consumers: readonly Consumer[];
};

export type ConfigListKind = keyof ConfigListData;

// The first page of consumers only: the Consumers page pages through the
// rest itself.
async function loadConsumers(): Promise<readonly Consumer[]> {
	const page = await listConsumers();

	return page.items;
}

const LOADERS: { readonly [Kind in ConfigListKind]: () => Promise<ConfigListData[Kind]> } = {
	services: listServices,
	routes: listRoutes,
	consumers: loadConsumers,
};

// Which writes change each list: a service lists its instances, a route
// names its service, a consumer lists its keys and routes.
const ENTITIES_BY_KIND: Readonly<Record<ConfigListKind, readonly BroadcastEntity[]>> = {
	services: ['Service', 'ServiceInstance', 'Route'],
	routes: ['Route', 'Service'],
	consumers: ['Consumer', 'ApiKey', 'Route'],
};

const REFETCH_ON: Readonly<Record<ConfigListKind, (event: RealtimeEvent) => boolean>> = {
	services: (event) => isEntityChange(event, ENTITIES_BY_KIND.services) || event.type === 'instance.state.changed' || event.type === 'chaos.changed',
	routes: (event) => isEntityChange(event, ENTITIES_BY_KIND.routes),
	consumers: (event) => isEntityChange(event, ENTITIES_BY_KIND.consumers),
};

// Coming up from "unknown" is not an event (a gateway boot would notify once per
// instance), so a fresh instance is only seen as healthy on a refetch: poll until then.
const SETTLING_POLL_INTERVAL_MS = 3_000;

const SHOULD_POLL: { readonly [Kind in ConfigListKind]: ((data: ConfigListData[Kind]) => boolean) | undefined } = {
	services: hasSettlingInstance,
	routes: undefined,
	consumers: undefined,
};

export function configListQuery<Kind extends ConfigListKind>(kind: Kind): PrefetchableQuery<ConfigListData[Kind]> {
	return { queryKey: queryKeys.configList(kind), queryFn: LOADERS[kind] };
}

export function useConfigList<Kind extends ConfigListKind>(kind: Kind): UseAsyncResourceResult<ConfigListData[Kind]> {
	const { t } = useTranslation();

	const options: UseAsyncResourceOptions<ConfigListData[Kind]> = {
		queryKey: queryKeys.configList(kind),
		fallbackErrorMessage: t('common.unexpectedError'),
		refetchOn: REFETCH_ON[kind],
		// No predicate means no polling: useAsyncResource would poll unconditionally.
		pollIntervalMs: SHOULD_POLL[kind] === undefined ? undefined : SETTLING_POLL_INTERVAL_MS,
		shouldPoll: SHOULD_POLL[kind],
	};

	return useAsyncResource(LOADERS[kind], options);
}

export function hasSettlingInstance(services: readonly Service[]): boolean {
	return services.some((service) => service.instances.some(isSettling));
}

// A paused or failed instance is never checked, so it would keep the poll running.
function isSettling(instance: ServiceInstance): boolean {
	const isChecked = instance.isEnabled && instance.scalingState !== 'failed';
	const hasNoHealthYet = instance.live === null || instance.live.health === 'unknown';

	return isChecked && hasNoHealthYet;
}
