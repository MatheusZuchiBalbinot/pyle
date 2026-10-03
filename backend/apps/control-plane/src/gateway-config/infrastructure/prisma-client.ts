import type { Prisma } from '@prisma/control-plane-client';

import type { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

// The shared client, or a transaction the service opened.
export type PrismaExecutor = ControlPlanePrismaService | Prisma.TransactionClient;

export const ACTIVE = { deletedAt: null } as const;
