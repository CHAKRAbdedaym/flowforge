import { Router } from 'express';
import { z } from 'zod';
import type { Connections, Item, WorkflowData, WorkflowNode, WorkflowSettings } from '@flowforge/shared';
import type { AppServices } from '../app.js';
import type { WorkflowInput } from '../db/repositories/workflows.js';
import { HttpError, notFound } from '../http/errors.js';
import { ActivationError } from '../triggers/active-workflows.js';
import { TestListenError } from '../triggers/test-listeners.js';
import { WorkflowBodySchema } from './schemas.js';

const CreateSchema = z.object({ name: z.string().trim().min(1).max(128).optional() }).passthrough();
const RenameSchema = z.object({ name: z.string().trim().min(1, 'The workflow needs a name').max(128) });
const TestListenSchema = z.object({ workflow: WorkflowBodySchema, nodeName: z.string().min(1) });

function toInput(body: z.infer<typeof WorkflowBodySchema>): WorkflowInput {
  return {
    name: body.name,
    nodes: body.nodes as unknown as WorkflowNode[],
    connections: body.connections as Connections,
    settings: body.settings as WorkflowSettings,
    pinData: body.pinData as Record<string, Item[]>,
  };
}

export function workflowsRouter(s: AppServices): Router {
  const router = Router();
  const repo = s.workflowsRepo;

  router.get('/', (_req, res) => {
    res.json(repo.list());
  });

  router.post('/', (req, res) => {
    const create = CreateSchema.parse(req.body ?? {});
    const body = WorkflowBodySchema.parse({ ...req.body, name: create.name ?? repo.uniqueName('My workflow') });
    res.status(201).json(repo.create(toInput(body)));
  });

  router.get('/:id', (req, res) => {
    const wf = repo.get(req.params.id);
    if (!wf) throw notFound('Workflow not found. It may have been deleted.');
    res.json(wf);
  });

  router.put('/:id', async (req, res) => {
    const body = WorkflowBodySchema.parse(req.body ?? {});
    const wf = repo.update(req.params.id, toInput(body));
    if (!wf) throw notFound('Workflow not found. It may have been deleted.');
    // An active workflow restarts its triggers with the saved version.
    await s.activeWorkflows.reactivateIfActive(wf.id);
    res.json(repo.get(wf.id));
  });

  router.post('/:id/activate', async (req, res) => {
    const id = req.params.id;
    if (!repo.get(id)) throw notFound('Workflow not found. It may have been deleted.');
    try {
      await s.activeWorkflows.activate(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      repo.setActive(id, false);
      repo.setActivationError(id, message);
      s.ws.broadcast('workflow.activationError', { workflowId: id, message, runtime: false });
      throw new HttpError(400, message, 'activation_failed', err instanceof ActivationError ? err.hint : undefined);
    }
    res.json(repo.get(id));
  });

  router.post('/:id/deactivate', async (req, res) => {
    const id = req.params.id;
    if (!repo.get(id)) throw notFound('Workflow not found. It may have been deleted.');
    await s.activeWorkflows.deactivate(id);
    res.json(repo.get(id));
  });

  /** "Listen for test event" on a trigger node of the (possibly unsaved) workflow in the editor. */
  router.post('/:id/test-listen', async (req, res) => {
    const id = req.params.id;
    const { workflow, nodeName } = TestListenSchema.parse(req.body ?? {});
    try {
      res.json(await s.testListeners.listen({ ...(workflow as unknown as WorkflowData), id }, nodeName));
    } catch (err) {
      if (err instanceof TestListenError) throw new HttpError(400, err.message, 'test_listen_failed', err.hint);
      throw err;
    }
  });

  router.delete('/:id/test-listen', (req, res) => {
    res.json({ stopped: s.testListeners.cancel(req.params.id) });
  });

  router.patch('/:id', (req, res) => {
    const { name } = RenameSchema.parse(req.body ?? {});
    const wf = repo.rename(req.params.id, name);
    if (!wf) throw notFound('Workflow not found. It may have been deleted.');
    res.json(wf);
  });

  router.delete('/:id', async (req, res) => {
    await s.activeWorkflows.remove(req.params.id);
    s.testListeners.cancel(req.params.id);
    if (!repo.delete(req.params.id)) throw notFound('Workflow not found. It may have been deleted.');
    res.status(204).end();
  });

  return router;
}
