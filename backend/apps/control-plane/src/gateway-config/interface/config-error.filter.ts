import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import {
	ChaosDisabledError,
	ChaosInstanceUnreachableError,
	ConfigConflictError,
	ConfigNotFoundError,
	ConfigValidationError,
} from '../domain/config-errors.js';

type ConfigDomainError = ConfigNotFoundError | ConfigConflictError | ConfigValidationError | ChaosDisabledError | ChaosInstanceUnreachableError;

const HTTP_ERROR_LABEL: Readonly<Record<number, string>> = {
	[HttpStatus.NOT_FOUND]: 'Not Found',
	[HttpStatus.CONFLICT]: 'Conflict',
	[HttpStatus.BAD_REQUEST]: 'Bad Request',
	[HttpStatus.FORBIDDEN]: 'Forbidden',
	[HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
};

// Messages are written for operators and carry no internals.
@Catch(ConfigNotFoundError, ConfigConflictError, ConfigValidationError, ChaosDisabledError, ChaosInstanceUnreachableError)
export class ConfigErrorFilter implements ExceptionFilter<ConfigDomainError> {
	catch(error: ConfigDomainError, host: ArgumentsHost): void {
		const response = host.switchToHttp().getResponse<Response>();
		const statusCode = toStatus(error);

		response.status(statusCode).json({ statusCode, message: error.message, error: HTTP_ERROR_LABEL[statusCode] });
	}
}

function toStatus(error: ConfigDomainError): HttpStatus {
	if (error instanceof ConfigNotFoundError) {
		return HttpStatus.NOT_FOUND;
	}

	if (error instanceof ConfigConflictError) {
		return HttpStatus.CONFLICT;
	}

	if (error instanceof ConfigValidationError) {
		return HttpStatus.BAD_REQUEST;
	}

	if (error instanceof ChaosDisabledError) {
		return HttpStatus.FORBIDDEN;
	}

	return HttpStatus.BAD_GATEWAY;
}
