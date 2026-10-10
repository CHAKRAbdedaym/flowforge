import { Router } from 'express';
import type { AppServices } from '../app.js';
import { notFound } from '../http/errors.js';

export function executionsRouter(s: AppServices): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
    res.json(s.executionsRepo.list({ limit: Number.isFinite(limit) ? limit : 50, workflowId }));
  });

  router.get('/:id', (req, res) => {
    const execution = s.executionsRepo.get(req.params.id);
    if (!execution) throw notFound(`Execution ${req.params.id} not found`);
    res.json(execution);
  });

  router.post('/:id/stop', (req, res) => {
    if (!s.executionsRepo.get(req.params.id)) throw notFound(`Execution ${req.params.id} not found`);
    res.json({ stopped: s.executions.stop(req.params.id) });
  });

  return router;
}
