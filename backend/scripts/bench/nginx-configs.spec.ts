import { describe, expect, it } from 'vitest';

import { renderProxyConfig, renderUpstreamConfig } from './nginx-configs.js';

const PATHS = { directory: '/tmp/bench', name: 'proxy' };

describe('nginx configs', () => {
	it('runs unprivileged in the foreground, writing only under its scratch directory', () => {
		const config = renderUpstreamConfig(PATHS, 48_400);

		expect(config).toContain('daemon off;');
		expect(config).toContain('pid /tmp/bench/proxy.pid;');
		expect(config).toContain('proxy_temp_path /tmp/bench/proxy-proxy;');
		expect(config).toContain('listen 127.0.0.1:48400');
		expect(config).toContain(`return 200 '{"ok":true}';`);
	});

	it('proxies with a keep-alive pool like the gateway, with the workers asked for', () => {
		const config = renderProxyConfig({ paths: PATHS, port: 48_401, upstreamPort: 48_400, workers: 1 });

		expect(config).toContain('worker_processes 1;');
		expect(config).toContain('server 127.0.0.1:48400;');
		expect(config).toContain('keepalive 256;');
		expect(config).toContain('proxy_set_header Connection "";');
	});
});
