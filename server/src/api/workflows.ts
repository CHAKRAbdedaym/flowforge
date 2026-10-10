import { Router } from 'express';
import { z } from 'zod';
import type { Connections, Item, WorkflowNode, WorkflowSettings } from '@flowforge/shared';
import type { AppServices } from '../app.js';
import { WorkflowsRepo, type WorkflowInput } from '../db/repositories/workflows.js';
import { notFound } from '../http/errors.js';
import { WorkflowBodySchema } from './schemas.js';

const CreateSchema = z.object({ name: z.string().trim().min(1).max(128).optional() }).passthrough();
const RenameSchema = z.object({ name: z.string().trim().min(1, 'The workflow needs a name').max(128) });

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
  const repo = new WorkflowsRepo(s.db);

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

  router.put('/:id', (req, res) => {
    const body = WorkflowBodySchema.parse(req.body ?? {});
    const wf = repo.update(req.params.id, toInput(body));
    if (!wf) throw notFound('Workflow not found. It may have been deleted.');
    res.json(wf);
  });

  router.patch('/:id', (req, res) => {
    const { name } = RenameSchema.parse(req.body ?? {});
    const wf = repo.rename(req.params.id, name);
    if (!wf) throw notFound('Workflow not found. It may have been deleted.');
    res.json(wf);
  });

  router.delete('/:id', (req, res) => {
    if (!repo.delete(req.params.id)) throw notFound('Workflow not found. It may have been deleted.');
    res.status(204).end();
  });

  return router;
}
