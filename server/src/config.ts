import { isAbsolute, resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_PORT } from '@flowforge/shared';
import type { LogLevel } from './logger.js';
import { detectLanAddress } from './net.js';
import { ROOT_DIR, WEB_DIST_DIR } from './paths.js';

export interface AppConfig {
  port: number;
  host: string;
  /** Base URL for webhooks, forms and QR codes (LAN address unless PUBLIC_URL is set). */
  publicUrl: string;
  localUrl: string;
  dataDir: string;
  webDistDir: string;
  sessionTtlMs: number;
  logLevel: LogLevel;
}

export class ConfigError extends Error {}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  HOST: z.string().min(1).default('0.0.0.0'),
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  FLOWFORGE_DATA_DIR: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().positive().max(365).default(7),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/** Loads `.env` from the repo root (never overriding real environment variables). */
export function loadDotEnv(): void {
  dotenv.config({ path: resolve(ROOT_DIR, '.env'), quiet: true });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Blank values copied from .env.example mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid configuration in .env / environment:\n${problems}`);
  }
  const e = parsed.data;
  const dataDir = e.FLOWFORGE_DATA_DIR
    ? isAbsolute(e.FLOWFORGE_DATA_DIR)
      ? e.FLOWFORGE_DATA_DIR
      : resolve(ROOT_DIR, e.FLOWFORGE_DATA_DIR)
    : resolve(ROOT_DIR, 'data');
  const localUrl = `http://localhost:${e.PORT}`;
  const lanHost = e.HOST === '0.0.0.0' || e.HOST === '::' ? detectLanAddress() : undefined;
  const publicUrl = (e.PUBLIC_URL ?? (lanHost ? `http://${lanHost}:${e.PORT}` : localUrl)).replace(/\/+$/, '');

  return {
    port: e.PORT,
    host: e.HOST,
    publicUrl,
    localUrl,
    dataDir,
    webDistDir: WEB_DIST_DIR,
    sessionTtlMs: e.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    logLevel: e.LOG_LEVEL,
  };
}
