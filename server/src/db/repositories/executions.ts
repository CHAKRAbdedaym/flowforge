import type {
  ExecutionDetail,
  ExecutionEvent,
  ExecutionMode,
  ExecutionStatus,
  ExecutionSummary,
  RunData,
  SerializedError,
  WorkflowData,
} from '@flowforge/shared';
import type { DB } from '../index.js';

interface Row {
  id: number;
  workflow_id: string | null;
  workflow_name: string;
  mode: ExecutionMode;
  status: ExecutionStatus;
  started_at: string | null;
  stopped_at: string | null;
  last_node: string | null;
  error_message: string | null;
  parent_execution_id: number | null;
  wait_till: string | null;
  waiting_node: string | null;
  depth: number;
}

/** How an execution was started — needed to resume it after a Wait. */
export interface RunOptions {
  startNode?: string;
  destinationNode?: string;
  depth?: number;
}

function summary(row: Row): ExecutionSummary {
  return {
    id: String(row.id),
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    mode: row.mode,
    status: row.status,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    lastNodeExecuted: row.last_node,
    errorMessage: row.error_message,
    parentExecutionId: row.parent_execution_id === null ? null : String(row.parent_execution_id),
    waitTill: row.wait_till,
    waitingNode: row.waiting_node,
  };
}

export class ExecutionsRepo {
  constructor(private readonly db: DB) {}

  create(input: { workflow: WorkflowData; mode: ExecutionMode; parentExecutionId?: string; options?: RunOptions }): string {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO executions (workflow_id, workflow_name, mode, status, created_at, parent_execution_id, depth)
           VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
        )
        .run(
          input.workflow.id ?? null,
          input.workflow.name || 'Untitled workflow',
          input.mode,
          new Date().toISOString(),
          input.parentExecutionId ? Number(input.parentExecutionId) : null,
          input.options?.depth ?? 0,
        );
      const id = Number(result.lastInsertRowid);
      this.db
        .prepare('INSERT INTO execution_data (execution_id, workflow, run_options) VALUES (?, ?, ?)')
        .run(id, JSON.stringify(input.workflow), JSON.stringify(input.options ?? {}));
      return String(id);
    })();
  }

  /** The execution pauses (Wait node): keep its engine state until it is resumed. */
  markWaiting(
    id: string,
    input: { waitTill: Date | null; node: string; kind: string; state: unknown; runData: RunData; events: ExecutionEvent[] },
  ): void {
    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE executions SET status = 'waiting', wait_till = ?, waiting_node = ?, wait_kind = ?, last_node = ? WHERE id = ?`)
        .run(input.waitTill?.toISOString() ?? null, input.node, input.kind, input.node, Number(id));
      this.db
        .prepare('UPDATE execution_data SET state = ?, run_data = ?, events = ? WHERE execution_id = ?')
        .run(JSON.stringify(input.state), JSON.stringify(input.runData), JSON.stringify(input.events), Number(id));
    })();
  }

  /**
   * Atomically switches a waiting execution to "running" (so it can only be resumed once).
   * Returns what is needed to resume it, or undefined if it is not waiting.
   */
  claimWaiting(id: string): { detail: ExecutionDetail; state: unknown; options: RunOptions; kind: string | null } | undefined {
    return this.db.transaction(() => {
      const changed = this.db
        .prepare(`UPDATE executions SET status = 'running', wait_till = NULL WHERE id = ? AND status = 'waiting'`)
        .run(Number(id)).changes;
      if (!changed) return undefined;
      const extra = this.db.prepare('SELECT state, run_options FROM execution_data WHERE execution_id = ?').get(Number(id)) as {
        state: string | null;
        run_options: string | null;
      };
      const kind = (this.db.prepare('SELECT wait_kind FROM executions WHERE id = ?').get(Number(id)) as { wait_kind: string | null }).wait_kind;
      return {
        detail: this.get(id)!,
        state: extra.state ? JSON.parse(extra.state) : null,
        options: extra.run_options ? (JSON.parse(extra.run_options) as RunOptions) : {},
        kind,
      };
    })();
  }

  /** Waiting executions and when they should resume (null = webhook / form, no time limit). */
  listWaiting(): Array<{ id: string; waitTill: string | null; kind: string | null }> {
    return (
      this.db.prepare(`SELECT id, wait_till, wait_kind FROM executions WHERE status = 'waiting'`).all() as Array<{
        id: number;
        wait_till: string | null;
        wait_kind: string | null;
      }>
    ).map((r) => ({ id: String(r.id), waitTill: r.wait_till, kind: r.wait_kind }));
  }

  /** Info about a waiting execution (for the resume routes). */
  getWaiting(id: string): { workflow: WorkflowData; node: string; kind: string | null } | undefined {
    const row = this.db.prepare(`SELECT waiting_node, wait_kind FROM executions WHERE id = ? AND status = 'waiting'`).get(Number(id)) as
      | { waiting_node: string; wait_kind: string | null }
      | undefined;
    if (!row) return undefined;
    const data = this.db.prepare('SELECT workflow FROM execution_data WHERE execution_id = ?').get(Number(id)) as { workflow: string };
    return { workflow: JSON.parse(data.workflow) as WorkflowData, node: row.waiting_node, kind: row.wait_kind };
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM executions WHERE id = ?').run(Number(id));
  }

  childrenOf(id: string): ExecutionSummary[] {
    return (this.db.prepare('SELECT * FROM executions WHERE parent_execution_id = ? ORDER BY id').all(Number(id)) as Row[]).map(summary);
  }

  markRunning(id: string, startedAt: Date): void {
    this.db.prepare(`UPDATE executions SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt.toISOString(), Number(id));
  }

  finish(
    id: string,
    result: { status: ExecutionStatus; stoppedAt: Date; lastNode: string | null; error?: SerializedError; runData: RunData; events: ExecutionEvent[] },
  ): void {
    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE executions SET status = ?, stopped_at = ?, last_node = ?, error_message = ?, wait_till = NULL WHERE id = ?`)
        .run(result.status, result.stoppedAt.toISOString(), result.lastNode, result.error?.message ?? null, Number(id));
      this.db
        .prepare('UPDATE execution_data SET run_data = ?, error = ?, events = ?, state = NULL WHERE execution_id = ?')
        .run(JSON.stringify(result.runData), result.error ? JSON.stringify(result.error) : null, JSON.stringify(result.events), Number(id));
    })();
  }

  get(id: string): ExecutionDetail | undefined {
    const row = this.db.prepare('SELECT * FROM executions WHERE id = ?').get(Number(id)) as Row | undefined;
    if (!row) return undefined;
    const data = this.db.prepare('SELECT * FROM execution_data WHERE execution_id = ?').get(row.id) as
      | { workflow: string; run_data: string; error: string | null; events: string }
      | undefined;
    return {
      ...summary(row),
      workflow: data ? (JSON.parse(data.workflow) as WorkflowData) : { name: row.workflow_name, nodes: [], connections: {} },
      runData: data ? (JSON.parse(data.run_data) as RunData) : {},
      error: data?.error ? (JSON.parse(data.error) as SerializedError) : null,
      events: data ? (JSON.parse(data.events) as ExecutionEvent[]) : [],
    };
  }

  list(options: { limit?: number; workflowId?: string } = {}): ExecutionSummary[] {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const rows = (
      options.workflowId
        ? this.db.prepare('SELECT * FROM executions WHERE workflow_id = ? ORDER BY id DESC LIMIT ?').all(options.workflowId, limit)
        : this.db.prepare('SELECT * FROM executions ORDER BY id DESC LIMIT ?').all(limit)
    ) as Row[];
    return rows.map(summary);
  }

  /** On startup: executions that were queued or running when the server stopped can never finish. */
  markUnfinishedAsCrashed(): number {
    return this.db
      .prepare(`UPDATE executions SET status = 'crashed', stopped_at = ?, error_message = COALESCE(error_message, 'The server stopped while this execution was running') WHERE status IN ('queued', 'running')`)
      .run(new Date().toISOString()).changes;
  }
}
