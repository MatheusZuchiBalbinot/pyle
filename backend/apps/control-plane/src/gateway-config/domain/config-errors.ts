// Thrown by the services, mapped to HTTP by ConfigErrorFilter.
export class ConfigNotFoundError extends Error {
	override readonly name = 'ConfigNotFoundError';
}

export class ConfigConflictError extends Error {
	override readonly name = 'ConfigConflictError';
}

// A rule spanning fields or the current state (health check timeout above interval, say).
export class ConfigValidationError extends Error {
	override readonly name = 'ConfigValidationError';
}

export class ChaosDisabledError extends Error {
	override readonly name = 'ChaosDisabledError';
}

export class ChaosInstanceUnreachableError extends Error {
	override readonly name = 'ChaosInstanceUnreachableError';
}
