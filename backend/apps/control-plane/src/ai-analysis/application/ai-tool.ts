// Provider agnostic: adapters translate it to their provider's tool format.
export type JsonSchemaProperty = {
	readonly type: 'string' | 'number' | 'integer' | 'boolean';
	readonly description?: string;
	readonly enum?: readonly string[];
	readonly minimum?: number;
	readonly maximum?: number;
};

export type JsonObjectSchema = {
	readonly type: 'object';
	readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
	readonly required: readonly string[];
	readonly additionalProperties: false;
};

export type AiTool = {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: JsonObjectSchema;
	// Must validate its input: models send unexpected shapes. A thrown error goes back to
	// the model as a tool error.
	readonly run: (input: Readonly<Record<string, unknown>>) => Promise<string>;
};

export const NO_INPUT_SCHEMA: JsonObjectSchema = { type: 'object', properties: {}, required: [], additionalProperties: false };

export function readStringInput(input: Readonly<Record<string, unknown>>, key: string): string | undefined {
	const value = input[key];

	return typeof value === 'string' ? value : undefined;
}

export function readNumberInput(input: Readonly<Record<string, unknown>>, key: string): number | undefined {
	const value = input[key];

	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readBooleanInput(input: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
	const value = input[key];

	return typeof value === 'boolean' ? value : undefined;
}
