import { Router } from 'express';
import { z } from 'zod';
import type { RunData, WorkflowData } from '@flowforge/shared';
import type { AppServices } from '../app.js';
import { notFound } from '../http/errors.js';
import { WorkflowBodySchema } from './schemas.js';

const RunSchema = z.object({
  workflow: WorkflowBodySchema,
  startNode: z.string().optional(),
  destinationNode: z.string().optional(),
  previousExecutionId: z.string().optional(),
});

export function executionsRouter(s: AppServices): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
    res.json(s.executionsRepo.list({ limit: Number.isFinite(limit) ? limit : 50, workflowId }));
  });

  /** Manual run from the editor: runs the posted (possibly unsaved) workflow. Progress arrives over WebSocket. */
  router.post('/run', (req, res) => {
    const body = RunSchema.parse(req.body ?? {});
    let previousRunData: RunData | undefined;
    if (body.previousExecutionId) previousRunData = s.executionsRepo.get(body.previousExecutionId)?.runData;
    const { executionId } = s.executions.start({
      workflow: body.workflow as unknown as WorkflowData,
      mode: 'manual',
      startNode: body.startNode,
      destinationNode: body.destinationNode,
      previousRunData,
    });
    res.status(202).json({ executionId });
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
