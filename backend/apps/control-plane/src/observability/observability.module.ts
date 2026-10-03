import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { CorrelationIdMiddleware } from './interface/correlation-id.middleware.js';
import { RequestLoggingInterceptor } from './interface/request-logging.interceptor.js';

@Module({
	providers: [CorrelationIdMiddleware, { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }],
	exports: [CorrelationIdMiddleware],
})
export class ObservabilityModule {}
