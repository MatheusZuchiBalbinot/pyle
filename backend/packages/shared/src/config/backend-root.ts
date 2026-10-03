import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// backend/, found from this file rather than from process.cwd(): npm runs a workspace's
// scripts inside its own folder (apps/control-plane, apps/gateway), so the cwd depends on
// how a process was started. The source (packages/shared/src/config/) and the build
// (packages/shared/dist/config/) sit at the same depth, so one relative path serves both.
const BACKEND_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export function backendPath(...segments: readonly string[]): string {
	return join(BACKEND_ROOT, ...segments);
}
