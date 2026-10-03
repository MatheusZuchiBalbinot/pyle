import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// Stands in for a service instance in specs.
const HEALTH_PATH = '/health';

export type FakeUpstreamBehavior =
	| { readonly kind: 'echo' }
	| { readonly kind: 'status'; readonly status: number }
	| { readonly kind: 'delay'; readonly delayMs: number }
	// Sends the status line and a first chunk, then drops the connection.
	| { readonly kind: 'cut' }
	// Sends a large body in chunks, pausing between them.
	| { readonly kind: 'stream'; readonly chunkCount: number; readonly chunkBytes: number; readonly pauseMs: number };

export type ReceivedRequest = {
	readonly method: string;
	readonly url: string;
	readonly headers: IncomingMessage['headers'];
	readonly body: string;
};

export type FakeUpstream = {
	readonly name: string;
	readonly url: string;
	readonly received: ReceivedRequest[];
	setBehavior(behavior: FakeUpstreamBehavior): void;
	// Answers GET /health with this status whatever the behavior; null
	// hands /health to the behavior like any other path.
	setHealthStatus(status: number | null): void;
	close(): Promise<void>;
};

export async function startFakeUpstream(name: string): Promise<FakeUpstream> {
	let behavior: FakeUpstreamBehavior = { kind: 'echo' };
	let healthStatus: number | null = null;
	const received: ReceivedRequest[] = [];
	const server: Server = createServer((request, response) => {
		void (async () => {
			const body = await readBody(request);
			const entry: ReceivedRequest = { method: request.method ?? '', url: request.url ?? '', headers: request.headers, body };

			received.push(entry);

			if (healthStatus !== null && request.url === HEALTH_PATH) {
				return void response.writeHead(healthStatus).end();
			}

			const current = behavior;

			if (current.kind === 'stream') {
				return stream(response, current);
			}

			if (current.kind === 'cut') {
				return cut(response);
			}

			if (current.kind === 'delay') {
				await new Promise((resolve) => setTimeout(resolve, current.delayMs));
			}

			const status = current.kind === 'status' ? current.status : 200;

			response.writeHead(status, { 'content-type': 'application/json', 'x-upstream': name });
			response.end(JSON.stringify({ name, ...entry }));
		})();
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;

	return {
		name,
		url: `http://127.0.0.1:${port}`,
		received,
		setBehavior: (next) => {
			behavior = next;
		},
		setHealthStatus: (status) => {
			healthStatus = status;
		},
		close: () =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];

		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	});
}

async function stream(response: ServerResponse, behavior: Extract<FakeUpstreamBehavior, { kind: 'stream' }>): Promise<void> {
	response.writeHead(200, { 'content-type': 'application/octet-stream' });

	for (let index = 0; index < behavior.chunkCount; index++) {
		response.write(Buffer.alloc(behavior.chunkBytes, index % 256));
		await new Promise((resolve) => setTimeout(resolve, behavior.pauseMs));
	}

	response.end();
}

function cut(response: ServerResponse): void {
	response.writeHead(200, { 'content-type': 'text/plain' });
	response.write('partial', () => response.destroy());
}
