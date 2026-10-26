import { describe, expect, it } from 'vitest';
import { DEMO_TAG, importExamples } from '../src/cli/import-examples.js';
import { openDatabase } from '../src/db/index.js';
import { TagsRepo } from '../src/db/repositories/tags.js';
import { VersionsRepo } from '../src/db/repositories/versions.js';
import { WorkflowsRepo } from '../src/db/repositories/workflows.js';

function repos() {
  const db = openDatabase(':memory:');
  return { workflows: new WorkflowsRepo(db), versions: new VersionsRepo(db), tags: new TagsRepo(db) };
}

describe('npm run examples:import', () => {
  it('imports every example once, tagged teacher-demo, with bundles linked; a second run adds nothing', () => {
    const r = repos();
    const first = importExamples(r);
    expect(first.failed).toEqual([]);
    expect(first.imported[0]!.names[0]).toMatch(/^Teacher showcase/); // most important first
    const names = r.workflows.list().map((w) => w.name);
    expect(names).toContain('Webhook: respond immediately');
    expect(names).toContain('Wait for approval (webhook resume)');
    expect(names).toContain('Resilience: error handler');
    expect(new Set(names).size).toBe(names.length);
    for (const w of r.workflows.list()) expect(r.tags.forWorkflow(w.id).map((t) => t.name)).toContain(DEMO_TAG);

    // The resilience bundle points at the ids of its own sub-workflow and error workflow.
    const main = r.workflows.list().find((w) => w.name === 'Resilience demo')!;
    const record = r.workflows.get(main.id)!;
    const handler = r.workflows.list().find((w) => w.name === 'Resilience: error handler')!;
    expect(record.settings?.errorWorkflow).toBe(handler.id);

    const count = names.length;
    const second = importExamples(r);
    expect(second.imported).toEqual([]);
    expect(second.skipped.length).toBe(first.imported.length);
    expect(r.workflows.list()).toHaveLength(count);
  });

  it('keeps workflows the user already has and only adds the missing ones', () => {
    const r = repos();
    r.workflows.create({ name: 'Contact form → emails', nodes: [], connections: {} });
    const report = importExamples(r);
    expect(report.skipped.map((s) => s.name)).toEqual(['Contact form → emails']);
    expect(r.workflows.list().filter((w) => w.name === 'Contact form → emails')).toHaveLength(1);
  });
});
