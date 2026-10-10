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

export async function makeTestApp(overrides: Partial<AppConfig> = {}, options: { dbFile?: string } = {}): Promise<TestApp> {
  const dataDir = overrides.dataDir ?? mkdtempSync(join(tmpdir(), 'ff-data-'));
  const config: AppConfig = {
    ...loadConfig({ HOST: '127.0.0.1' }),
    dataDir,
    filesRoot: join(dataDir, 'files'),
    webDistDir: fakeWebDist(),
    publicUrl: 'http://ff.test',
    ...overrides,
  };
  const ctx = createContext(config, openDatabase(options.dbFile ?? ':memory:'), silentLogger, await getTestRegistry());
  return { ...createApp(ctx), ctx };
}

/** Polls `check` until it returns a truthy value (or fails after `timeoutMs`). */
export async function waitFor<T>(check: () => T | undefined | null | false | Promise<T | undefined | null | false>, timeoutMs = 5000, label = 'condition'): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/** Starts the server on a random port and returns its base URL. */
export async function listen(app: TestApp): Promise<string> {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}
