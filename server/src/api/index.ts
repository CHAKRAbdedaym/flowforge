import express, { Router } from 'express';
import { APP_NAME, APP_VERSION, type HealthResponse, type SystemInfo } from '@flowforge/shared';
import { requireAuth, sessionMiddleware } from '../auth/session.js';
import type { AppContext } from '../context.js';
import { notFound } from '../http/errors.js';
import { authRouter } from './auth.js';

export function apiRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(express.json({ limit: '16mb' }));
  router.use(sessionMiddleware(ctx));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ── Public ──
  router.get('/health', (_req, res) => {
    ctx.db.prepare('SELECT 1').get();
    const body: HealthResponse = {
      status: 'ok',
      name: APP_NAME,
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.versions.node,
    };
    res.json(body);
  });
  router.use('/auth', authRouter(ctx));

  // ── Everything below needs a signed-in user ──
  router.use(requireAuth);

  router.get('/system/info', (_req, res) => {
    const body: SystemInfo = {
      version: APP_VERSION,
      nodeVersion: process.versions.node,
      publicUrl: ctx.config.publicUrl,
      localUrl: ctx.config.localUrl,
      dataDir: ctx.config.dataDir,
      startedAt: ctx.startedAt.toISOString(),
    };
    res.json(body);
  });

  router.use((req, _res, next) => next(notFound(`API route not found: ${req.method} ${req.originalUrl}`)));
  return router;
}
