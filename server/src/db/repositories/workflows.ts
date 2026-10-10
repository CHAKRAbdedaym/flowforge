import { randomUUID } from 'node:crypto';
import type { Connections, Item, WorkflowData, WorkflowNode, WorkflowRecord, WorkflowSettings, WorkflowSummary } from '@flowforge/shared';
import type { DB } from '../index.js';

interface Row {
  id: string;
  name: string;
  active: number;
  nodes: string;
  connections: string;
  settings: string;
  pin_data: string;
  version_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowInput {
  name: string;
  nodes?: WorkflowNode[];
  connections?: Connections;
  settings?: WorkflowSettings;
  pinData?: Record<string, Item[]>;
}

function toRecord(row: Row): WorkflowRecord {
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
    nodes: JSON.parse(row.nodes) as WorkflowNode[],
    connections: JSON.parse(row.connections) as Connections,
    settings: JSON.parse(row.settings) as WorkflowSettings,
    pinData: JSON.parse(row.pin_data) as Record<string, Item[]>,
    versionId: row.version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WorkflowsRepo {
  constructor(private readonly db: DB) {}

  list(): WorkflowSummary[] {
    const rows = this.db.prepare('SELECT id, name, active, nodes, created_at, updated_at FROM workflows ORDER BY updated_at DESC').all() as Row[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active === 1,
      nodeCount: (JSON.parse(r.nodes) as WorkflowNode[]).filter((n) => n.type !== 'flowforge.stickyNote').length,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  get(id: string): WorkflowRecord | undefined {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Row | undefined;
    return row && toRecord(row);
  }

  /** "My workflow", "My workflow 2", … */
  uniqueName(base: string): string {
    const names = new Set((this.db.prepare('SELECT name FROM workflows').all() as { name: string }[]).map((r) => r.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }

  create(input: WorkflowInput): WorkflowRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workflows (id, name, nodes, connections, settings, pin_data, version_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        JSON.stringify(input.nodes ?? []),
        JSON.stringify(input.connections ?? {}),
        JSON.stringify(input.settings ?? {}),
        JSON.stringify(input.pinData ?? {}),
        randomUUID(),
        now,
        now,
      );
    return this.get(id)!;
  }

  /** Full replace. Returns undefined if the workflow does not exist. */
  update(id: string, input: WorkflowInput): WorkflowRecord | undefined {
    const result = this.db
      .prepare(
        `UPDATE workflows SET name = ?, nodes = ?, connections = ?, settings = ?, pin_data = ?, version_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        JSON.stringify(input.nodes ?? []),
        JSON.stringify(input.connections ?? {}),
        JSON.stringify(input.settings ?? {}),
        JSON.stringify(input.pinData ?? {}),
        randomUUID(),
        new Date().toISOString(),
        id,
      );
    return result.changes ? this.get(id) : undefined;
  }

  rename(id: string, name: string): WorkflowRecord | undefined {
    const result = this.db
      .prepare('UPDATE workflows SET name = ?, version_id = ?, updated_at = ? WHERE id = ?')
      .run(name, randomUUID(), new Date().toISOString(), id);
    return result.changes ? this.get(id) : undefined;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id).changes > 0;
  }

  /** For runs: the stored workflow as plain WorkflowData. */
  toWorkflowData(record: WorkflowRecord): WorkflowData {
    const { versionId: _v, createdAt: _c, updatedAt: _u, ...data } = record;
    return data;
  }
}
