import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';

export const REQUEST_ID_CLS_KEY = 'requestId';
const REQUEST_ID_HEADER_NAME = 'x-request-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
	constructor(private readonly cls: ClsService) {}

	use(req: Request, res: Response, next: NextFunction): void {
		const requestId = randomUUID();

		this.cls.set(REQUEST_ID_CLS_KEY, requestId);
		res.setHeader(REQUEST_ID_HEADER_NAME, requestId);
		next();
	}
}
