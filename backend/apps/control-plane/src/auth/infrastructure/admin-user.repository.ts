import { Injectable } from '@nestjs/common';
import type { AdminUser } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

type CreateAdminUserInput = {
	readonly email: string;
	readonly name: string;
	readonly passwordHash: string;
};

// Every read excludes soft-deleted rows, so a removed operator cannot log in.
@Injectable()
export class AdminUserRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	findActiveByEmail(email: string): Promise<AdminUser | null> {
		return this.prisma.adminUser.findFirst({ where: { email: email.toLowerCase(), deletedAt: null } });
	}

	findActiveById(id: string): Promise<AdminUser | null> {
		return this.prisma.adminUser.findFirst({ where: { id, deletedAt: null } });
	}

	countActive(): Promise<number> {
		return this.prisma.adminUser.count({ where: { deletedAt: null } });
	}

	create(input: CreateAdminUserInput): Promise<AdminUser> {
		return this.prisma.adminUser.create({ data: { ...input, email: input.email.toLowerCase() } });
	}

	updatePassword(id: string, passwordHash: string): Promise<AdminUser> {
		return this.prisma.adminUser.update({ where: { id }, data: { passwordHash } });
	}

	recordLogin(id: string): Promise<AdminUser> {
		return this.prisma.adminUser.update({ where: { id }, data: { lastLoginAt: new Date() } });
	}
}
