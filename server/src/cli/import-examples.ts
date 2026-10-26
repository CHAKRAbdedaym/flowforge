// `npm run examples:import` → imports every workflow of examples/ into your local FlowForge (Workflows page),
// tagged "teacher-demo". Workflows whose name already exists are skipped, so running it twice is harmless.
// Works while FlowForge is running (SQLite WAL); refresh the Workflows page afterwards.
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppServices } from '../app.js';
import { loadConfig, loadDotEnv } from '../config.js';
import { openDatabase } from '../db/index.js';
import { TagsRepo } from '../db/repositories/tags.js';
import { VersionsRepo } from '../db/repositories/versions.js';
import { WorkflowsRepo } from '../db/repositories/workflows.js';
import { EXAMPLES_DIR, importWorkflowBundle, type TemplateFile } from '../templates/index.js';

export const DEMO_TAG = 'teacher-demo';
/** Shown first in the list (most important for the demo). */
const FIRST = ['teacher-showcase.json'];

/** Names of the workflows a file creates (the main one first). */
export function workflowNames(file: TemplateFile): string[] {
  return Array.isArray(file.workflows) && file.workflows.length ? file.workflows.map((w) => w.name ?? file.name ?? 'Workflow') : [file.name ?? 'Workflow'];
}

export interface ImportReport {
  imported: Array<{ file: string; names: string[] }>;
  skipped: Array<{ file: string; name: string }>;
  failed: Array<{ file: string; reason: string }>;
}

/** Imports the example files into the database behind `repos` (pure enough to be tested on an in-memory DB). */
export function importExamples(repos: { workflows: WorkflowsRepo; versions: VersionsRepo; tags: TagsRepo }, dir = EXAMPLES_DIR): ImportReport {
  const services = { workflowsRepo: repos.workflows, versionsRepo: repos.versions } as unknown as AppServices;
  const existing = new Set(repos.workflows.list().map((w) => w.name));
  const tag = repos.tags.ensure(DEMO_TAG);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => (FIRST.includes(b) ? 1 : 0) - (FIRST.includes(a) ? 1 : 0) || a.localeCompare(b));
  const report: ImportReport = { imported: [], skipped: [], failed: [] };
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as TemplateFile;
      const names = workflowNames(data);
      const already = names.find((n) => existing.has(n));
      if (already) {
        report.skipped.push({ file: f, name: already });
        continue;
      }
      const created = importWorkflowBundle(services, data);
      for (const wf of created) {
        repos.tags.setForWorkflow(wf.id, [...new Set([...repos.tags.forWorkflow(wf.id).map((t) => t.id), tag.id])]);
        existing.add(wf.name);
      }
      report.imported.push({ file: f, names: created.map((w) => w.name) });
    } catch (err) {
      report.failed.push({ file: f, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}

// ── CLI ──
if (process.argv[1] && /import-examples\.(js|ts)$/.test(process.argv[1])) {
  loadDotEnv();
  const config = loadConfig();
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(join(config.dataDir, 'flowforge.db'));
  const report = importExamples({ workflows: new WorkflowsRepo(db), versions: new VersionsRepo(db), tags: new TagsRepo(db) });
  db.close();
  console.log('\nFlowForge: import the example workflows\n');
  for (const r of report.imported) for (const n of r.names) console.log(`  + ${n}`);
  for (const r of report.skipped) console.log(`  = ${r.name}  (already there, skipped)`);
  for (const r of report.failed) console.log(`  ! ${r.file}: ${r.reason}`);
  const count = report.imported.reduce((n, r) => n + r.names.length, 0);
  console.log(`\n${count} workflow(s) added, ${report.skipped.length} file(s) skipped, ${report.failed.length} failed. Tag: "${DEMO_TAG}".`);
  console.log('Refresh the Workflows page (no restart needed). Imported workflows start inactive: toggle Active where needed.\n');
  process.exit(report.failed.length ? 1 : 0);
}
