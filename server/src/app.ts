import { createServer, type Server } from 'node:http';
import express, { type Express } from 'express';
import { apiRouter } from './api/index.js';
import type { AppContext } from './context.js';
import { errorHandler } from './http/errors.js';
import { staticFrontend } from './http/static.js';
import { WsHub } from './ws/hub.js';

export interface FlowForgeApp {
  app: Express;
  server: Server;
  ws: WsHub;
  close(): Promise<void>;
}

/** Builds the HTTP + WebSocket server without listening (tests call this directly). */
export function createApp(ctx: AppContext): FlowForgeApp {
  const app = express();
  app.disable('x-powered-by');
  // Trust X-Forwarded-* only from local proxies (Vite dev proxy, cloudflared).
  app.set('trust proxy', 'loopback');

  app.use('/api', apiRouter(ctx));
  app.use(staticFrontend(ctx.config.webDistDir));
  app.use((req, res) => {
    res.status(404).json({ error: { message: `Not found: ${req.method} ${req.path}`, code: 'not_found' } });
  });
  app.use(errorHandler(ctx.logger));

  const server = createServer(app);
  const ws = new WsHub(ctx);
  ws.attach(server);

  return {
    app,
    server,
    ws,
    close: () =>
      new Promise<void>((resolve) => {
        ws.close();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
