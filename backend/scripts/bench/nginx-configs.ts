// The two nginx roles in the benchmark, rendered into a scratch directory: an upstream that
// answers every request at once (it must never be the bottleneck), and a plain reverse
// proxy in front of it, pooled the way the gateway pools (keep-alive, 256 connections).

export type NginxPaths = { readonly directory: string; readonly name: string };

type ProxyConfigInput = {
	readonly paths: NginxPaths;
	readonly port: number;
	readonly upstreamPort: number;
	// 1 to compare with the gateway's single Node process; 'auto' for nginx at full width.
	readonly workers: number | 'auto';
};

const WORKER_CONNECTIONS = 8192;
const UPSTREAM_KEEPALIVE_CONNECTIONS = 256;
const KEEPALIVE_REQUESTS = 1_000_000;

export function renderUpstreamConfig(paths: NginxPaths, port: number): string {
	const server = `server {
		listen 127.0.0.1:${port} backlog=4096;
		keepalive_requests ${KEEPALIVE_REQUESTS};
		location / {
			default_type application/json;
			return 200 '{"ok":true}';
		}
	}`;

	return renderConfig(paths, 'auto', server);
}

export function renderProxyConfig(input: ProxyConfigInput): string {
	const servers = `upstream bench_upstream {
		server 127.0.0.1:${input.upstreamPort};
		keepalive ${UPSTREAM_KEEPALIVE_CONNECTIONS};
	}
	server {
		listen 127.0.0.1:${input.port} backlog=4096;
		keepalive_requests ${KEEPALIVE_REQUESTS};
		location / {
			proxy_pass http://bench_upstream;
			proxy_http_version 1.1;
			proxy_set_header Connection "";
		}
	}`;

	return renderConfig(input.paths, input.workers, servers);
}

// Everything nginx writes goes under the scratch directory: it runs unprivileged.
function renderConfig(paths: NginxPaths, workers: number | 'auto', servers: string): string {
	const prefix = `${paths.directory}/${paths.name}`;

	return `daemon off;
worker_processes ${workers};
pid ${prefix}.pid;
error_log ${prefix}-error.log warn;
events {
	worker_connections ${WORKER_CONNECTIONS};
}
http {
	access_log off;
	client_body_temp_path ${prefix}-body;
	proxy_temp_path ${prefix}-proxy;
	fastcgi_temp_path ${prefix}-fastcgi;
	uwsgi_temp_path ${prefix}-uwsgi;
	scgi_temp_path ${prefix}-scgi;
	${servers}
}
`;
}
