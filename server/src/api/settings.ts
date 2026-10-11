import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../app.js';

const PatchSchema = z.strictObject({
  executeCommandEnabled: z.boolean().optional(),
});

/** /api/settings — instance switches (security toggles now; timezone, pruning… in Phase 7). */
export function settingsRouter(s: AppServices): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(s.settings.all());
  });

  router.patch('/', (req, res) => {
    const patch = PatchSchema.parse(req.body ?? {});
    const before = s.settings.all();
    const after = s.settings.update(patch);
    if (before.executeCommandEnabled !== after.executeCommandEnabled) {
      s.logger.warn(`Execute Command node ${after.executeCommandEnabled ? 'ENABLED' : 'disabled'} in Settings`);
    }
    res.json(after);
  });

  return router;
}
