// Template library: examples/*.json + templates/*.json + the built-in templates of the AI builder.
// Contract: docs/phase7-contracts.md (W5)
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Connections, TemplateCategory, TemplateDetail, WorkflowNode, WorkflowRecord, WorkflowSettings } from '@flowforge/shared';
import { WorkflowBodySchema } from '../api/schemas.js';
import type { AppServices } from '../app.js';
import { buildCatalog } from '../ai/builder/catalog.js';
import { layoutNodes } from '../ai/builder/layout.js';
import { BUILT_IN_TEMPLATES } from '../ai/builder/templates.js';
import { validateWorkflow } from '../ai/builder/validate.js';
import type { NodeRegistry } from '../nodes/registry.js';
import { ROOT_DIR } from '../paths.js';

export const EXAMPLES_DIR = join(ROOT_DIR, 'examples');
export const TEMPLATES_DIR = join(ROOT_DIR, 'templates');

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['AI', 'Forms', 'Email', 'Messaging', 'Data', 'Scheduling', 'Webhooks', 'Utilities'];

interface TemplateFile {
  name?: string;
  nodes?: WorkflowNode[];
  connections?: Connections;
  settings?: WorkflowSettings;
  meta?: { description?: string; categories?: string[] };
}

const STICKY = 'flowforge.stickyNote';

/** Categories from the node types of a template. */
export function deriveCategories(types: string[]): TemplateCategory[] {
  const has = (...names: string[]) => types.some((t) => names.includes(t.replace('flowforge.', '')));
  const out = new Set<TemplateCategory>();
  if (has('googleGemini', 'aiAgent', 'geminiChatModel', 'chatTrigger')) out.add('AI');
  if (has('formTrigger')) out.add('Forms');
  if (has('sendEmail')) out.add('Email');
  if (has('telegram', 'telegramTrigger', 'discord')) out.add('Messaging');
  if (has('scheduleTrigger')) out.add('Scheduling');
  if (has('webhook', 'respondToWebhook')) out.add('Webhooks');
  if (has('httpRequest', 'graphql', 'set', 'code', 'filter', 'sort', 'limit', 'summarize', 'aggregate', 'splitOut', 'removeDuplicates', 'dateTime', 'openMeteo')) out.add('Data');
  if (out.size === 0) out.add('Utilities');
  return [...out];
}

function toDetail(id: string, source: 'example' | 'template', file: TemplateFile, registry: NodeRegistry): TemplateDetail | undefined {
  if (!Array.isArray(file.nodes) || file.nodes.length === 0) return undefined;
  const real = file.nodes.filter((n) => n.type !== STICKY);
  const nodeTypes = [...new Set(real.map((n) => n.type))];
  const credentialTypes = new Set<string>();
  for (const t of nodeTypes) for (const c of registry.get(t)?.description.credentials ?? []) if (c.required) credentialTypes.add(c.type);
  const wanted = (file.meta?.categories ?? []).filter((c): c is TemplateCategory => (TEMPLATE_CATEGORIES as string[]).includes(c));
  return {
    id: `${source}:${id}`,
    name: file.name ?? id,
    description: file.meta?.description ?? '',
    categories: wanted.length ? wanted : deriveCategories(nodeTypes),
    nodeCount: real.length,
    nodeTypes,
    credentialTypes: [...credentialTypes],
    source,
    nodes: file.nodes,
    connections: file.connections ?? {},
  };
}

function readDir(dir: string, source: 'example' | 'template', registry: NodeRegistry): TemplateDetail[] {
  if (!existsSync(dir)) return [];
  const out: TemplateDetail[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const detail = toDetail(f.slice(0, -5), source, JSON.parse(readFileSync(join(dir, f), 'utf8')) as TemplateFile, registry);
      if (detail) out.push(detail);
    } catch {
      // a broken file must never break the gallery
    }
  }
  return out;
}

function builtIns(registry: NodeRegistry): TemplateDetail[] {
  const catalog = buildCatalog(registry);
  const out: TemplateDetail[] = [];
  for (const t of BUILT_IN_TEMPLATES) {
    const result = validateWorkflow(t.workflow, { registry, catalog });
    if (!result.workflow) continue;
    const { nodes, connections } = result.workflow;
    layoutNodes(nodes, connections);
    const detail = toDetail(t.id, 'template', { name: t.name, nodes, connections, meta: { description: t.description } }, registry);
    if (detail) out.push(detail);
  }
  return out;
}

/** Every template (examples first, then templates/, then the built-in ones). */
export function loadAllTemplates(registry: NodeRegistry, dirs: { examples?: string; templates?: string } = {}): TemplateDetail[] {
  return [...readDir(dirs.examples ?? EXAMPLES_DIR, 'example', registry), ...readDir(dirs.templates ?? TEMPLATES_DIR, 'template', registry), ...builtIns(registry)];
}

export function matchesQuery(t: { name: string; description: string; nodeTypes: string[] }, q: string): boolean {
  const hay = `${t.name} ${t.description} ${t.nodeTypes.map((x) => x.replace('flowforge.', '')).join(' ')}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Validates a workflow file, gives it a unique name and fresh webhook ids, stores it and records the version. */
export function importWorkflowFile(s: AppServices, file: { name?: string; nodes?: unknown; connections?: unknown; settings?: unknown }): WorkflowRecord {
  const body = WorkflowBodySchema.parse({ name: file.name, nodes: file.nodes, connections: file.connections, settings: file.settings });
  const nodes = (body.nodes as unknown as WorkflowNode[]).map((n) => (n.webhookId ? { ...n, webhookId: randomUUID() } : n));
  const wf = s.workflowsRepo.create({
    name: s.workflowsRepo.uniqueName(body.name),
    nodes,
    connections: body.connections as Connections,
    settings: body.settings as WorkflowSettings,
    pinData: {},
  });
  s.versionsRepo.record(wf, { source: 'import' });
  return wf;
}

