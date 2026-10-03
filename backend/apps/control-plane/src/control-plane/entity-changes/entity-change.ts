import type { Prisma } from '@prisma/control-plane-client';

export type EntityChangeAction = 'created' | 'updated' | 'deleted';

// Emitted by the Prisma middleware for every mutating query, so no service has to announce
// its writes. The id is best effort.
export type EntityChange = {
	readonly model: Prisma.ModelName;
	readonly action: EntityChangeAction;
	readonly id: string | null;
};

export type EntityChangeListener = (change: EntityChange) => void;

const ACTION_BY_PRISMA_ACTION: Readonly<Partial<Record<Prisma.PrismaAction, EntityChangeAction>>> = {
	create: 'created',
	createMany: 'created',
	createManyAndReturn: 'created',
	update: 'updated',
	updateMany: 'updated',
	updateManyAndReturn: 'updated',
	// An upsert can't tell us which one it did without a second query;
	// `updated` is the safe reading for every cache that invalidates on it.
	upsert: 'updated',
	delete: 'deleted',
	deleteMany: 'deleted',
};

export function toEntityChangeAction(prismaAction: Prisma.PrismaAction): EntityChangeAction | null {
	return ACTION_BY_PRISMA_ACTION[prismaAction] ?? null;
}

// Prefers the returned row (single-row queries hand it back), then falls
// back to the query's own `where`.
export function extractEntityId(args: unknown, result: unknown): string | null {
	const where = typeof args === 'object' && args !== null ? (args as { where?: unknown }).where : undefined;

	return readString(result, 'id') ?? readString(where, 'id');
}

function readString(source: unknown, key: string): string | null {
	if (typeof source !== 'object' || source === null) {
		return null;
	}

	const value = (source as Record<string, unknown>)[key];

	return typeof value === 'string' ? value : null;
}
