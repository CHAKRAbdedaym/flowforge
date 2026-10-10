import { mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import express, { type Express } from 'express';
import { apiRouter } from './api/index.js';
import type { AppContext } from './context.js';
import { ExecutionService } from './engine/execution-service.js';
import { getExpressionEngine } from './engine/expressions/engine.js';
import { WorkflowRunner } from './engine/runner.js';
import { errorHandler } from './http/errors.js';
import { staticFrontend } from './http/static.js';
import { publicRouter } from './public/router.js';
import { ActiveWorkflowManager } from './triggers/active-workflows.js';
import { TestListeners } from './triggers/test-listeners.js';
import { WaitTracker } from './triggers/wait-tracker.js';
import { WebhookRegistry } from './triggers/webhook-registry.js';
import { WebhookService } from './triggers/webhook-service.js';
import { WsHub } from './ws/hub.js';

export interface FlowForgeApp {
  app: Express;
  server: Server;
  ws: WsHub;
  executions: ExecutionService;
  activeWorkflows: ActiveWorkflowManager;
  testListeners: TestListeners;
  waitTracker: WaitTracker;
  webhookRegistry: WebhookRegistry;
  /** Startup work: crash recovery, re-activate active workflows, resume waiting executions. */
  boot(): Promise<void>;
  close(): Promise<void>;
}

/** Services shared by the API routes. */
export interface AppServices extends AppContext {
  ws: WsHub;
  executions: ExecutionService;
  activeWorkflows: ActiveWorkflowManager;
  testListeners: TestListeners;
}

/** Builds the HTTP + WebSocket server without listening (tests call this directly). */
export function createApp(ctx: AppContext): FlowForgeApp {
  const { config, logger } = ctx;
  mkdirSync(config.filesRoot, { recursive: true });
  const ws = new WsHub(ctx);
  const runner = new WorkflowRunner({
    registry: ctx.registry,
    expressions: getExpressionEngine(),
    binaryStore: ctx.binaryStore,
    logger,
    defaults: { timeoutMs: config.executionTimeoutMs, maxNodeRuns: config.maxNodeRuns, timezone: config.timezone },
  });
  const executions = new ExecutionService({
    repo: ctx.executionsRepo,
    workflows: ctx.workflowsRepo,
    runner,
    logger,
    binaryStore: ctx.binaryStore,
    publisher: ws,
    maxConcurrent: config.maxConcurrentExecutions,
    timeoutMs: config.executionTimeoutMs,
    timezone: config.timezone,
    allowEnvAccess: config.allowEnvAccess,
    publicUrl: config.publicUrl,
  });
  const webhookRegistry = new WebhookRegistry();
  const testListeners = new TestListeners({
    nodes: ctx.registry,
    webhooks: webhookRegistry,
    executions,
    logger,
    ws,
    publicUrl: config.publicUrl,
    timezone: config.timezone,
    filesRoot: config.filesRoot,
  });
  const webhooks = new WebhookService({
    registry: webhookRegistry,
    nodes: ctx.registry,
    executions,
    executionsRepo: ctx.executionsRepo,
    binaryStore: ctx.binaryStore,
    logger,
    publicUrl: config.publicUrl,
    maxBodyBytes: config.webhookMaxBodyBytes,
    timezone: config.timezone,
    onTestReceived: (reg, executionId) => testListeners.received(reg.workflowId, reg.nodeName, executionId),
  });
  const activeWorkflows = new ActiveWorkflowManager({
    workflows: ctx.workflowsRepo,
    nodes: ctx.registry,
    executions,
    webhooks: webhookRegistry,
    logger,
    ws,
    timezone: config.timezone,
    filesRoot: config.filesRoot,
  });
  const waitTracker = new WaitTracker({ repo: ctx.executionsRepo, executions, logger });
  executions.onWaiting = (id, till) => waitTracker.schedule(id, till);
  const services: AppServices = { ...ctx, ws, executions, activeWorkflows, testListeners };

  const app = express();
  app.disable('x-powered-by');
  // Trust X-Forwarded-* only from local proxies (Vite dev proxy, cloudflared).
  app.set('trust proxy', 'loopback');

  app.use('/api', apiRouter(services));
  app.use(
    publicRouter({
      webhooks,
      executions,
      executionsRepo: ctx.executionsRepo,
      nodes: ctx.registry,
      logger,
      ratePerMinute: config.webhookRatePerMinute,
    }),
  );
  app.use(staticFrontend(config.webDistDir));
  app.use((req, res) => {
    res.status(404).json({ error: { message: `Not found: ${req.method} ${req.path}`, code: 'not_found' } });
  });
  app.use(errorHandler(logger));

  const server = createServer(app);
  ws.attach(server);

  return {
    app,
    server,
    ws,
    executions,
    activeWorkflows,
    testListeners,
    waitTracker,
    webhookRegistry,
    async boot() {
      const crashed = ctx.executionsRepo.markUnfinishedAsCrashed();
      if (crashed) logger.warn(`${crashed} execution(s) were interrupted by the last shutdown and are marked as crashed`);
      await activeWorkflows.init();
      waitTracker.init();
    },
    async close() {
      testListeners.shutdown();
      waitTracker.shutdown();
      await activeWorkflows.shutdown();
      executions.shutdown();
      ws.close();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
