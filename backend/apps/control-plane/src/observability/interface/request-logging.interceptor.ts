import { HttpException, Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { REQUEST_ID_CLS_KEY } from './correlation-id.middleware.js';

const UNKNOWN_ERROR_STATUS = 500;
const MISSING_REQUEST_ID_LABEL = '-';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger('HTTP');

	constructor(private readonly cls: ClsService) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const request = context.switchToHttp().getRequest<Request>();
		const response = context.switchToHttp().getResponse<Response>();
		const startedAt = Date.now();

		return next.handle().pipe(
			tap({
				next: () => this.logRequest(request, response.statusCode, startedAt),
				error: (error: unknown) => this.logRequest(request, resolveErrorStatus(error), startedAt),
			}),
		);
	}

	private logRequest(request: Request, statusCode: number, startedAt: number): void {
		const durationMs = Date.now() - startedAt;
		const requestId = this.cls.get<string>(REQUEST_ID_CLS_KEY) ?? MISSING_REQUEST_ID_LABEL;

		this.logger.log(`${request.method} ${request.originalUrl} ${statusCode} ${durationMs}ms requestId=${requestId}`);
	}
}

function resolveErrorStatus(error: unknown): number {
	return error instanceof HttpException ? error.getStatus() : UNKNOWN_ERROR_STATUS;
}
