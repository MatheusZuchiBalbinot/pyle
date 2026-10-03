import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

// Keep-alive per instance: without it every proxied request opens a new
// TCP connection, and a load test exhausts ephemeral ports in seconds.
const UPSTREAM_MAX_SOCKETS_PER_INSTANCE = 256;
const HTTPS_PROTOCOL = 'https:';

export type UpstreamAgent = HttpAgent | HttpsAgent;

export class UpstreamAgents {
	private readonly agents = new Map<string, UpstreamAgent>();

	forInstance(instanceId: string, url: URL): UpstreamAgent {
		const existing = this.agents.get(instanceId);

		if (existing) {
			return existing;
		}

		const options = { keepAlive: true, maxSockets: UPSTREAM_MAX_SOCKETS_PER_INSTANCE };
		const agent = url.protocol === HTTPS_PROTOCOL ? new HttpsAgent(options) : new HttpAgent(options);

		this.agents.set(instanceId, agent);

		return agent;
	}

	retainOnly(instanceIds: ReadonlySet<string>): void {
		for (const [instanceId, agent] of this.agents) {
			if (instanceIds.has(instanceId)) {
				continue;
			}

			agent.destroy();
			this.agents.delete(instanceId);
		}
	}

	destroyAll(): void {
		this.retainOnly(new Set());
	}

	get size(): number {
		return this.agents.size;
	}
}
