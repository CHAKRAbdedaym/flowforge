import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { ExecutionsRepo } from '../db/repositories/executions.js';
import type { ExecutionService } from '../engine/execution-service.js';
import { withDefaults } from '../engine/params.js';
import type { Logger } from '../logger.js';
import type { NodeRegistry } from '../nodes/registry.js';
import type { WebhookService } from '../triggers/webhook-service.js';
import { renderForm, renderMessage, validateForm, type FormField } from './forms.js';

/** Fixed-window limiter per client IP for public endpoints. */
function rateLimit(perMinute: number): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + 60_000 };
      hits.set(key, entry);
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (++entry.count > perMinute) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ message: 'Too many requests. Slow down and try again in a minute.' });
      return;
    }
    next();
  };
}

/** Public handlers must never crash the server: errors become a JSON 500. */
const safe =
  (logger: Logger, fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, _next: NextFunction) => {
    fn(req, res).catch((err) => {
      logger.error(`Public route ${req.method} ${req.path} failed`, err);
      if (!res.headersSent) res.status(500).json({ message: 'Internal error while handling this request.' });
    });
  };

const joinPath = (p: unknown) => (Array.isArray(p) ? p.join('/') : String(p ?? ''));

export interface PublicRouterOptions {
  webhooks: WebhookService;
  executions: ExecutionService;
  executionsRepo: ExecutionsRepo;
  nodes: NodeRegistry;
  logger: Logger;
  ratePerMinute: number;
}

export function publicRouter(o: PublicRouterOptions): Router {
  const router = Router();
  router.use(['/webhook', '/webhook-test', '/webhook-waiting', '/form-waiting'], rateLimit(o.ratePerMinute));

  router.all('/webhook/*path', safe(o.logger, (req, res) => o.webhooks.handle('prod', req, res, joinPath(req.params.path))));
  router.all('/webhook-test/*path', safe(o.logger, (req, res) => o.webhooks.handle('test', req, res, joinPath(req.params.path))));
  router.all('/webhook-waiting/:executionId', safe(o.logger, (req, res) => o.webhooks.handleWaiting(req, res, String(req.params.executionId))));

  // ── Wait node "On Form Submitted" ──────────────────────────────────────────
  const waitingForm = (id: string) => {
    const waiting = o.executionsRepo.getWaiting(id);
    if (!waiting || waiting.kind !== 'form') return undefined;
    const node = waiting.workflow.nodes.find((n) => n.name === waiting.node);
    const type = node ? o.nodes.get(node.type) : undefined;
    if (!node || !type) return undefined;
    const p = withDefaults(type.properties, node.parameters ?? {});
    return {
      title: String(p.formTitle || 'Form'),
      description: String(p.formDescription || ''),
      fields: ((p.formFields as { values?: FormField[] } | undefined)?.values ?? []).filter((f) => f?.fieldLabel),
      completion: String(p.formCompletionMessage || 'Thank you, your answer was submitted.'),
    };
  };
  const notWaiting = (res: Response) =>
    res.status(404).type('html').send(renderMessage('This form is closed', 'It was already submitted, or the workflow stopped waiting for it.', false));

  router.get('/form-waiting/:executionId', (req, res) => {
    const form = waitingForm(String(req.params.executionId));
    if (!form) return void notWaiting(res);
    res.type('html').send(renderForm({ ...form, action: req.originalUrl }));
  });

  router.post(
    '/form-waiting/:executionId',
    express.urlencoded({ extended: false, limit: '1mb' }),
    safe(o.logger, async (req, res) => {
      const id = String(req.params.executionId);
      const form = waitingForm(id);
      if (!form) return void notWaiting(res);
      const { values, errors, raw } = validateForm(form.fields, (req.body ?? {}) as Record<string, unknown>);
      if (Object.keys(errors).length) {
        res.status(400).type('html').send(renderForm({ ...form, action: req.originalUrl, values: raw, errors }));
        return;
      }
      const started = o.executions.resume(id, [{ json: { ...values, submittedAt: new Date().toISOString() } }]);
      if (!started) return void notWaiting(res);
      res.type('html').send(renderMessage(form.title, form.completion));
    }),
  );

  return router;
}
