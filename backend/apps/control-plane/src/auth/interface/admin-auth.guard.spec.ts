import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdminTokenService } from '../application/admin-token.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { getAdminCaller } from './admin-caller.js';

const SERVICE_TOKEN = 'service-token-for-scripts';
const SECRET = 'a-secret-long-enough-for-the-config-check';

function buildContext(authorization: string | undefined) {
	const request = { header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
	const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

	return { request, context };
}

describe('AdminAuthGuard', () => {
	const guard = new AdminAuthGuard(new AdminTokenService());

	beforeEach(() => {
		process.env.ADMIN_JWT_SECRET = SECRET;
		process.env.ADMIN_API_TOKEN = SERVICE_TOKEN;
	});
	afterEach(() => {
		delete process.env.ADMIN_JWT_SECRET;
		delete process.env.ADMIN_API_TOKEN;
	});

	it('admits an operator session and records who it is', async () => {
		const { token } = await new AdminTokenService().mintAccessToken({ userId: 'user-1', email: 'ops@example.com' });
		const { request, context } = buildContext(`Bearer ${token}`);

		await expect(guard.canActivate(context)).resolves.toBe(true);
		expect(getAdminCaller(request)).toEqual({ kind: 'user', userId: 'user-1', email: 'ops@example.com' });
	});

	it('admits the service token and marks the caller as a machine', async () => {
		const { request, context } = buildContext(`Bearer ${SERVICE_TOKEN}`);

		await expect(guard.canActivate(context)).resolves.toBe(true);
		expect(getAdminCaller(request)).toEqual({ kind: 'service' });
	});

	it.each([
		['no header', undefined],
		['empty bearer', 'Bearer '],
		['wrong scheme', `Basic ${SERVICE_TOKEN}`],
		['a token that is neither', 'Bearer nonsense'],
	])('rejects %s', async (_label, authorization) => {
		const { context } = buildContext(authorization);

		await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
	});

	it('rejects a session signed with another secret', async () => {
		process.env.ADMIN_JWT_SECRET = `${SECRET}-elsewhere`;
		const { token } = await new AdminTokenService().mintAccessToken({ userId: 'user-1', email: 'ops@example.com' });

		process.env.ADMIN_JWT_SECRET = SECRET;
		const { context } = buildContext(`Bearer ${token}`);

		await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
	});

	// These assert the outcome; the constant-time property itself is timingSafeEqual's.
	it('rejects a token that shares a long prefix with the service token', async () => {
		const { context } = buildContext(`Bearer ${SERVICE_TOKEN.slice(0, -1)}X`);

		await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
	});

	it('rejects a token that is a prefix of the service token', async () => {
		const { context } = buildContext(`Bearer ${SERVICE_TOKEN.slice(0, 5)}`);

		await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
	});

	it('rejects a token longer than the service token without throwing on the length', async () => {
		const { context } = buildContext(`Bearer ${SERVICE_TOKEN}-and-then-some`);

		await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
	});
});
