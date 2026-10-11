import { Router } from 'express';
import { z } from 'zod';
import type { CredentialInput, CredentialTestRequest } from '@flowforge/shared';
import type { AppServices } from '../app.js';
import { notFound } from '../http/errors.js';

const Value = z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]);
const CreateSchema = z.object({
  name: z.string().max(128).default(''),
  type: z.string().min(1, 'Choose a credential type'),
  data: z.record(z.string(), Value).default({}),
  isDefault: z.boolean().optional(),
});
const UpdateSchema = z.object({
  name: z.string().max(128).optional(),
  type: z.string().optional(),
  data: z.record(z.string(), Value).optional(),
  isDefault: z.boolean().optional(),
});
const TestSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), Value).default({}),
  id: z.string().optional(),
});

/** /api/credentials — secrets go in, never come out (summaries only list which secrets are set). */
export function credentialsRouter(s: AppServices): Router {
  const router = Router();
  const service = s.credentials;

  router.get('/', (req, res) => {
    res.json(service.list(typeof req.query.type === 'string' ? req.query.type : undefined));
  });

  router.post('/', (req, res) => {
    const body = CreateSchema.parse(req.body ?? {});
    res.status(201).json(service.create(body as CredentialInput));
  });

  // Declared before "/:id" routes.
  router.post('/test', async (req, res) => {
    const body = TestSchema.parse(req.body ?? {});
    res.json(await service.test(body as CredentialTestRequest));
  });

  router.get('/:id', (req, res) => {
    const credential = service.get(req.params.id);
    if (!credential) throw notFound('Credential not found. It may have been deleted.');
    res.json(credential);
  });

  router.patch('/:id', (req, res) => {
    const body = UpdateSchema.parse(req.body ?? {});
    res.json(service.update(req.params.id, body as Partial<CredentialInput>));
  });

  router.delete('/:id', (req, res) => {
    if (!service.delete(req.params.id)) throw notFound('Credential not found. It may have been deleted.');
    res.status(204).end();
  });

  /** Tests a saved credential; `/env/test?type=smtp` tests the .env fallback. */
  router.post('/:id/test', async (req, res) => {
    res.json(await service.testSaved(req.params.id, typeof req.query.type === 'string' ? req.query.type : undefined));
  });

  return router;
}

export function credentialTypesRouter(s: AppServices): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(s.credentials.types());
  });
  return router;
}
