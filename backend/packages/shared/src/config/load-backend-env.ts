// Import first, for its side effect: loads backend/.env into process.env, whatever the
// process's cwd. A missing file is fine: in Docker the environment comes from Compose.
import { config } from 'dotenv';

import { backendPath } from './backend-root.js';

config({ path: backendPath('.env'), quiet: true });
