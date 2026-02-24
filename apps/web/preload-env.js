// Preloaded via `node --import ./preload-env.js build` before the SvelteKit
// server initialises. This ensures process.env is populated from the monorepo
// root .env before adapter-node's server.init() snapshots it into
// $env/dynamic/private. In Docker, env vars are injected directly by
// docker-compose so dotenv is a safe no-op (it won't override existing vars).
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '../../.env') });
