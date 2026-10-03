import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getPlatformSettings, getServiceTraffic } from '@/app/api/adminApiClient';
import type { Service, ServiceTraffic } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useLiveTraffic } from '@/app/features/traffic/hooks/useLiveTraffic';
import { useAsyncResource, type AsyncResourceState } from '@/app/hooks/useAsyncResource';
import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import { useServiceLiveState, type TimelineEntry } from './useServiceLiveState';

const CARD_TRAFFIC_WINDOW = '15m';
const SLUG_SEPARATOR = ',';
const SERVICES_CAPABILITIES_QUERY: PrefetchableQuery<ServiceCapabilities> = { queryKey: queryKeys.servicesCapabilities(), queryFn: loadCapabilities };

export type ServiceCardData = {
	readonly service: Service;
	// Null while loading or when it failed.
	readonly traffic: ServiceTraffic | null;
};

export type ServicesPageState = {
	readonly cards: AsyncResourceState<readonly ServiceCardData[]>;
	readonly expandedInstanceId: string | null;
	readonly toggleInstance: (instanceId: string) => void;
	readonly isChaosAllowed: boolean;
	// Null where managed replicas are off.
	readonly maxManagedReplicas: number | null;
	readonly timelineOf: (instanceId: string) => readonly TimelineEntry[];
};

export type ServiceCapabilities = { readonly isChaosAllowed: boolean; readonly maxManagedReplicas: number | null };

// Each service's traffic card, for the services listed: one request each, in parallel.
export function servicesTrafficQuery(services: readonly Service[]): PrefetchableQuery<ReadonlyMap<string, ServiceTraffic>> {
	const slugKey = services.map((service) => service.slug).join(SLUG_SEPARATOR);

	return { queryKey: queryKeys.servicesTraffic(slugKey), queryFn: () => loadAllTraffic(slugKey) };
}

export function servicesCapabilitiesQuery(): PrefetchableQuery<ServiceCapabilities> {
	return SERVICES_CAPABILITIES_QUERY;
}

export function useServicesPage(): ServicesPageState {
	const { t } = useTranslation();
	const { selection, openSelection, clearSelection } = useGateway();
	const servicesState = useConfigList('services').loadState;
	const rawServices = servicesState.status === LOAD_STATUS.loaded ? servicesState.data : null;
	const live = useServiceLiveState(rawServices);
	const trafficQuery = useMemo(() => servicesTrafficQuery(rawServices ?? []), [rawServices]);
	const traffic = useLiveTraffic(trafficQuery.queryFn, {
		queryKey: trafficQuery.queryKey,
		fallbackErrorMessage: t('services.trafficError'),
	}).loadState;
	const capabilities = useAsyncResource(loadCapabilities, {
		queryKey: SERVICES_CAPABILITIES_QUERY.queryKey,
		fallbackErrorMessage: t('services.settingsError'),
	}).loadState;
	// The open instance is part of the URL (/services/:slug/instances/:id), so it can be
	// linked to.
	const expandedInstanceId = selection?.type === 'service' ? selection.instanceId : null;

	const toggleInstance = useCallback(
		(instanceId: string) => {
			if (instanceId === expandedInstanceId) {
				return clearSelection();
			}

			const serviceSlug = serviceSlugOf(rawServices ?? [], instanceId);

			if (serviceSlug === null) {
				return;
			}

			openSelection({ type: 'service', serviceSlug, instanceId });
		},
		[expandedInstanceId, rawServices, openSelection, clearSelection],
	);

	const cards = useMemo((): AsyncResourceState<readonly ServiceCardData[]> => {
		if (servicesState.status === LOAD_STATUS.error) {
			return servicesState;
		}

		if (live.services === null) {
			return { status: LOAD_STATUS.loading };
		}

		const trafficBySlug = traffic.status === LOAD_STATUS.loaded ? traffic.data : new Map<string, ServiceTraffic>();

		return { status: LOAD_STATUS.loaded, data: live.services.map((service) => ({ service, traffic: trafficBySlug.get(service.slug) ?? null })) };
	}, [servicesState, live.services, traffic]);

	const loaded = capabilities.status === LOAD_STATUS.loaded ? capabilities.data : null;
	const isChaosAllowed = loaded?.isChaosAllowed ?? false;
	const maxManagedReplicas = loaded?.maxManagedReplicas ?? null;

	return { cards, expandedInstanceId, toggleInstance, isChaosAllowed, maxManagedReplicas, timelineOf: live.timelineOf };
}

function serviceSlugOf(services: readonly Service[], instanceId: string): string | null {
	const owner = services.find((service) => service.instances.some((instance) => instance.id === instanceId));

	return owner?.slug ?? null;
}

async function loadAllTraffic(slugKey: string): Promise<ReadonlyMap<string, ServiceTraffic>> {
	const slugs = slugKey === '' ? [] : slugKey.split(SLUG_SEPARATOR);
	const traffic = await Promise.all(slugs.map((slug) => getServiceTraffic(slug, { window: CARD_TRAFFIC_WINDOW })));

	return new Map(traffic.map((entry) => [entry.service.slug, entry]));
}

async function loadCapabilities(): Promise<ServiceCapabilities> {
	const settings = await getPlatformSettings();
	const maxManagedReplicas = settings.scaling.isAllowed ? settings.scaling.maxManagedReplicas : null;

	return { isChaosAllowed: settings.traffic.isChaosAllowed, maxManagedReplicas };
}
