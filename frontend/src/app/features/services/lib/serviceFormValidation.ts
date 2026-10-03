import type { CreateServiceInput, LoadBalancingStrategy, Service } from '@/app/api/adminApiTypes';
import { checkInteger, checkLength, type FieldErrors } from '@/app/lib/formValidation';
import { checkSlug } from '@/app/lib/slug';

export type ServiceFormValues = {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly lbStrategy: LoadBalancingStrategy;
} & { readonly [Field in NumericField]: string };

export type ServiceFormField = keyof ServiceFormValues | 'healthCheckPath';

export type ServiceFormState = ServiceFormValues & { readonly healthCheckPath: string };

type NumericField = keyof typeof SERVICE_RANGES;

// Mirror of the service DTO ranges.
const NAME_LENGTH = { min: 1, max: 100 };
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_HEALTH_PATH_LENGTH = 200;
const SERVICE_RANGES = {
	timeoutMs: { min: 100, max: 60_000 },
	retryMaxAttempts: { min: 1, max: 5 },
	healthCheckIntervalMs: { min: 1000, max: 60_000 },
	healthCheckTimeoutMs: { min: 100, max: 10_000 },
	healthyThreshold: { min: 1, max: 10 },
	unhealthyThreshold: { min: 1, max: 10 },
	circuitFailureThreshold: { min: 1, max: 100 },
	circuitCooldownMs: { min: 1000, max: 300_000 },
} as const;

// The backend's defaults, so a new service starts where it would anyway.
export const EMPTY_SERVICE_FORM: ServiceFormState = {
	slug: '',
	name: '',
	description: '',
	lbStrategy: 'round_robin',
	timeoutMs: '10000',
	retryMaxAttempts: '2',
	healthCheckPath: '/health',
	healthCheckIntervalMs: '5000',
	healthCheckTimeoutMs: '2000',
	healthyThreshold: '2',
	unhealthyThreshold: '3',
	circuitFailureThreshold: '5',
	circuitCooldownMs: '15000',
};

export function serviceToFormValues(service: Service): ServiceFormState {
	return {
		slug: service.slug,
		name: service.name,
		description: service.description ?? '',
		lbStrategy: service.lbStrategy,
		timeoutMs: String(service.timeoutMs),
		retryMaxAttempts: String(service.retryMaxAttempts),
		healthCheckPath: service.healthCheck.path,
		healthCheckIntervalMs: String(service.healthCheck.intervalMs),
		healthCheckTimeoutMs: String(service.healthCheck.timeoutMs),
		healthyThreshold: String(service.healthCheck.healthyThreshold),
		unhealthyThreshold: String(service.healthCheck.unhealthyThreshold),
		circuitFailureThreshold: String(service.circuit.failureThreshold),
		circuitCooldownMs: String(service.circuit.cooldownMs),
	};
}

export function validateServiceForm(values: ServiceFormState): FieldErrors<keyof ServiceFormState & string> {
	const numericErrors = Object.fromEntries(
		(Object.keys(SERVICE_RANGES) as NumericField[]).map((field) => [field, checkInteger(values[field], SERVICE_RANGES[field]) ?? undefined]),
	);

	return {
		...numericErrors,
		slug: checkSlug(values.slug) ?? undefined,
		name: checkLength(values.name, NAME_LENGTH) ?? undefined,
		description: values.description.length > MAX_DESCRIPTION_LENGTH ? 'common.validation.length' : undefined,
		healthCheckPath: checkHealthPath(values.healthCheckPath) ?? undefined,
		healthCheckTimeoutMs: checkHealthTimeout(values) ?? undefined,
	};
}

export function toServiceInput(values: ServiceFormState): Required<CreateServiceInput> {
	return {
		slug: values.slug.trim(),
		name: values.name.trim(),
		description: values.description.trim(),
		lbStrategy: values.lbStrategy,
		timeoutMs: Number(values.timeoutMs),
		retryMaxAttempts: Number(values.retryMaxAttempts),
		healthCheckPath: values.healthCheckPath.trim(),
		healthCheckIntervalMs: Number(values.healthCheckIntervalMs),
		healthCheckTimeoutMs: Number(values.healthCheckTimeoutMs),
		healthyThreshold: Number(values.healthyThreshold),
		unhealthyThreshold: Number(values.unhealthyThreshold),
		circuitFailureThreshold: Number(values.circuitFailureThreshold),
		circuitCooldownMs: Number(values.circuitCooldownMs),
	};
}

function checkHealthPath(path: string): string | null {
	const isValid = path.startsWith('/') && path.length <= MAX_HEALTH_PATH_LENGTH;

	return isValid ? null : 'services.form.errors.healthPath';
}

// A check that takes as long as the interval would overlap the next one.
function checkHealthTimeout(values: ServiceFormState): string | null {
	const rangeError = checkInteger(values.healthCheckTimeoutMs, SERVICE_RANGES.healthCheckTimeoutMs);

	if (rangeError !== null) {
		return rangeError;
	}

	const isShorter = Number(values.healthCheckTimeoutMs) < Number(values.healthCheckIntervalMs);

	return isShorter ? null : 'services.form.errors.timeoutBelowInterval';
}
