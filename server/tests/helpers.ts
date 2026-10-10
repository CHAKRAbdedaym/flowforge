import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, type FlowForgeApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createContext, type AppContext } from '../src/context.js';
import { openDatabase } from '../src/db/index.js';
import { silentLogger } from '../src/logger.js';
import { getTestRegistry } from './engine-helpers.js';

export const OWNER = {
  email: 'owner@flowforge.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'Forge2026',
};

/** A fake built frontend so SPA fallback can be tested without running Vite. */
export function fakeWebDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ff-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>FlowForge test</title><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("hi")');
  return dir;
}

export interface TestApp extends FlowForgeApp {
  ctx: AppContext;
}

export async function makeTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config: AppConfig = {
    ...loadConfig({ HOST: '127.0.0.1' }),
    dataDir: mkdtempSync(join(tmpdir(), 'ff-data-')),
    webDistDir: fakeWebDist(),
    ...overrides,
  };
  const ctx = createContext(config, openDatabase(':memory:'), silentLogger, await getTestRegistry());
  return { ...createApp(ctx), ctx };
}

/** Starts the server on a random port and returns its base URL. */
export async function listen(app: TestApp): Promise<string> {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}
