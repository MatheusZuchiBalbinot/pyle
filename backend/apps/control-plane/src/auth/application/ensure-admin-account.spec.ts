import type { AdminUser } from '@prisma/control-plane-client';
import { describe, expect, it, vi } from 'vitest';

import type { AdminUserRepository } from '../infrastructure/admin-user.repository.js';
import { ensureAdminAccount, type AdminAccountDependencies, type AdminAccountInput } from './ensure-admin-account.js';
import type { PasswordHasher } from './password-hasher.js';

const INPUT: AdminAccountInput = { email: 'admin@pyle.local', name: 'Dev Admin', password: 'pyle-admin-dev' };
const HASH = 'scrypt$hashed';
const EXISTING_USER = { id: 'user-1', email: 'admin@pyle.local' } as AdminUser;

function buildDependencies(existing: AdminUser | null): AdminAccountDependencies {
	const repository = {
		findActiveByEmail: vi.fn().mockResolvedValue(existing),
		updatePassword: vi.fn().mockResolvedValue(existing),
		create: vi.fn().mockResolvedValue({ id: 'user-2', email: INPUT.email }),
	} as unknown as AdminUserRepository;
	const hasher = { hash: vi.fn().mockResolvedValue(HASH) } as unknown as PasswordHasher;

	return { repository, hasher };
}

describe('ensureAdminAccount', () => {
	it('creates the operator with the hashed password when the address is free', async () => {
		const dependencies = buildDependencies(null);

		const result = await ensureAdminAccount(dependencies, INPUT);

		expect(result).toEqual({ outcome: 'created', id: 'user-2', email: INPUT.email });
		expect(dependencies.repository.create).toHaveBeenCalledWith({ email: INPUT.email, name: INPUT.name, passwordHash: HASH });
		expect(dependencies.repository.updatePassword).not.toHaveBeenCalled();
	});

	it('resets the password of an existing operator instead of creating a second one', async () => {
		const dependencies = buildDependencies(EXISTING_USER);

		const result = await ensureAdminAccount(dependencies, INPUT);

		expect(result).toEqual({ outcome: 'password-reset', id: 'user-1', email: 'admin@pyle.local' });
		expect(dependencies.repository.updatePassword).toHaveBeenCalledWith('user-1', HASH);
		expect(dependencies.repository.create).not.toHaveBeenCalled();
	});
});
