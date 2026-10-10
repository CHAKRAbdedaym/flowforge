import { createServer, type Server } from 'node:http';
import express, { type Express } from 'express';
import { apiRouter } from './api/index.js';
import type { AppContext } from './context.js';
import { ExecutionService } from './engine/execution-service.js';
import { getExpressionEngine } from './engine/expressions/engine.js';
import { WorkflowRunner } from './engine/runner.js';
import { errorHandler } from './http/errors.js';
import { staticFrontend } from './http/static.js';
import { WsHub } from './ws/hub.js';

export interface FlowForgeApp {
  app: Express;
  server: Server;
  ws: WsHub;
  executions: ExecutionService;
  close(): Promise<void>;
}

/** Services shared by the API routes. */
export interface AppServices extends AppContext {
  ws: WsHub;
  executions: ExecutionService;
}

/** Builds the HTTP + WebSocket server without listening (tests call this directly). */
export function createApp(ctx: AppContext): FlowForgeApp {
  const ws = new WsHub(ctx);
  const runner = new WorkflowRunner({
    registry: ctx.registry,
    expressions: getExpressionEngine(),
    binaryStore: ctx.binaryStore,
    logger: ctx.logger,
    defaults: { timeoutMs: ctx.config.executionTimeoutMs, maxNodeRuns: ctx.config.maxNodeRuns, timezone: ctx.config.timezone },
  });
  const executions = new ExecutionService({
    repo: ctx.executionsRepo,
    runner,
    logger: ctx.logger,
    publisher: ws,
    maxConcurrent: ctx.config.maxConcurrentExecutions,
    timeoutMs: ctx.config.executionTimeoutMs,
    timezone: ctx.config.timezone,
    allowEnvAccess: ctx.config.allowEnvAccess,
  });
  const services: AppServices = { ...ctx, ws, executions };

  const app = express();
  app.disable('x-powered-by');
  // Trust X-Forwarded-* only from local proxies (Vite dev proxy, cloudflared).
  app.set('trust proxy', 'loopback');

  app.use('/api', apiRouter(services));
  app.use(staticFrontend(ctx.config.webDistDir));
  app.use((req, res) => {
    res.status(404).json({ error: { message: `Not found: ${req.method} ${req.path}`, code: 'not_found' } });
  });
  app.use(errorHandler(ctx.logger));

  const server = createServer(app);
  ws.attach(server);

  return {
    app,
    server,
    ws,
    executions,
    close: () =>
      new Promise<void>((resolve) => {
        executions.shutdown();
        ws.close();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
