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
  };
}

export class ExecutionsRepo {
  constructor(private readonly db: DB) {}

  create(input: { workflow: WorkflowData; mode: ExecutionMode }): string {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(`INSERT INTO executions (workflow_id, workflow_name, mode, status, created_at) VALUES (?, ?, ?, 'queued', ?)`)
        .run(input.workflow.id ?? null, input.workflow.name || 'Untitled workflow', input.mode, new Date().toISOString());
      const id = Number(result.lastInsertRowid);
      this.db.prepare('INSERT INTO execution_data (execution_id, workflow) VALUES (?, ?)').run(id, JSON.stringify(input.workflow));
      return String(id);
    })();
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
        .prepare(`UPDATE executions SET status = ?, stopped_at = ?, last_node = ?, error_message = ? WHERE id = ?`)
        .run(result.status, result.stoppedAt.toISOString(), result.lastNode, result.error?.message ?? null, Number(id));
      this.db
        .prepare('UPDATE execution_data SET run_data = ?, error = ?, events = ? WHERE execution_id = ?')
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
