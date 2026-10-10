import type {
  ExecutionDetail,
  ExecutionEvent,
  ExecutionMode,
  Item,
  NodeRun,
  RunData,
  ServerEvent,
  ServerEventData,
  WorkflowData,
  WsRoom,
} from '@flowforge/shared';
import { isWsRoom } from '@flowforge/shared';
import type { ExecutionsRepo } from '../db/repositories/executions.js';
import type { Logger } from '../logger.js';
import { publicEnv } from './env.js';
import { ExecutionQueue } from './queue.js';
import type { WorkflowRunner } from './runner.js';

export interface StartOptions {
  workflow: WorkflowData;
  mode: ExecutionMode;
  startNode?: string;
  triggerItems?: Item[];
  destinationNode?: string;
  previousRunData?: RunData;
}

export interface StartedExecution {
  executionId: string;
  /** Resolves with the stored execution once it has finished (or was canceled while queued). */
  done: Promise<ExecutionDetail>;
}

export interface EventPublisher {
  publish<T extends ServerEvent['type']>(room: WsRoom, type: T, data: ServerEventData<T>, seq?: number): void;
}

export interface ExecutionServiceOptions {
  repo: ExecutionsRepo;
  runner: WorkflowRunner;
  logger: Logger;
  publisher?: EventPublisher;
  maxConcurrent: number;
  timeoutMs: number;
  timezone: string;
  allowEnvAccess: boolean;
}

const PREVIEW_ITEMS = 3;
const PREVIEW_BYTES = 2048;

/** First items of the first non-empty output, small enough for a WebSocket message. */
export function previewOf(outputs: Item[][]): unknown[] {
  const items = outputs.find((list) => list.length > 0) ?? [];
  const out: unknown[] = [];
  let size = 0;
  for (const item of items.slice(0, PREVIEW_ITEMS)) {
    const length = JSON.stringify(item.json).length;
    if (size + length > PREVIEW_BYTES) {
      if (out.length === 0) out.push({ _truncated: true, fields: Object.keys(item.json).slice(0, 20) });
      break;
    }
    out.push(item.json);
    size += length;
  }
  return out;
}

/**
 * Creates, queues, runs and stores executions, and streams their progress over WebSocket.
 * Events go to the room `execution:<id>` and, when the workflow has an id, to `workflow:<id>`.
 */
export class ExecutionService {
  private readonly queue: ExecutionQueue;
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly o: ExecutionServiceOptions) {
    this.queue = new ExecutionQueue(o.maxConcurrent);
  }

  get activeCount(): number {
    return this.queue.active;
  }

  start(options: StartOptions): StartedExecution {
    const { repo } = this.o;
    const executionId = repo.create({ workflow: options.workflow, mode: options.mode });
    const workflowId = options.workflow.id ?? null;
    this.emit(executionId, workflowId, 'execution.queued', { executionId, workflowId, mode: options.mode });
    const done = new Promise<ExecutionDetail>((resolve) => {
      this.queue.add(
        executionId,
        async () => resolve(await this.execute(executionId, options)),
        () => {
          const now = new Date();
          repo.finish(executionId, {
            status: 'canceled',
            stoppedAt: now,
            lastNode: null,
            error: { name: 'ExecutionCanceledError', message: 'Execution was stopped before it started' },
            runData: {},
            events: [],
          });
          this.emit(executionId, workflowId, 'execution.finished', {
            executionId,
            workflowId,
            status: 'canceled',
            startedAt: now.toISOString(),
            stoppedAt: now.toISOString(),
            lastNodeExecuted: null,
          });
          resolve(repo.get(executionId)!);
        },
        options.mode === 'manual' ? 'high' : 'normal',
      );
    });
    return { executionId, done };
  }

  /** Stops a running or queued execution. Returns false if it is not active. */
  stop(executionId: string): boolean {
    const controller = this.running.get(executionId);
    if (controller) {
      controller.abort();
      return true;
    }
    return this.queue.remove(executionId);
  }

  /** Server shutdown: cancel everything still waiting or running. */
  shutdown(): void {
    this.queue.clear();
    for (const controller of this.running.values()) controller.abort();
  }

  private emit<T extends ServerEvent['type']>(
    executionId: string,
    workflowId: string | null,
    type: T,
    data: ServerEventData<T>,
    seq?: number,
  ): void {
    const publisher = this.o.publisher;
    if (!publisher) return;
    publisher.publish(`execution:${executionId}`, type, data, seq);
    const room = `workflow:${workflowId ?? ''}`;
    if (workflowId && isWsRoom(room)) publisher.publish(room, type, data, seq);
  }

  private async execute(executionId: string, options: StartOptions): Promise<ExecutionDetail> {
    const { repo, runner, logger } = this.o;
    const workflowId = options.workflow.id ?? null;
    const controller = new AbortController();
    this.running.set(executionId, controller);
    const startedAt = new Date();
    repo.markRunning(executionId, startedAt);
    let seq = 0;
    const events: ExecutionEvent[] = [];
    const ref = { executionId, workflowId };
    this.emit(executionId, workflowId, 'execution.started', { ...ref, mode: options.mode, startedAt: startedAt.toISOString() }, ++seq);

    const settingsTimeout = options.workflow.settings?.executionTimeout;
    try {
      const result = await runner.run({
        workflow: options.workflow,
        executionId,
        mode: options.mode,
        startNode: options.startNode,
        triggerItems: options.triggerItems,
        destinationNode: options.destinationNode,
        previousRunData: options.previousRunData,
        signal: controller.signal,
        timeoutMs: settingsTimeout && settingsTimeout > 0 ? settingsTimeout * 1000 : this.o.timeoutMs,
        timezone: options.workflow.settings?.timezone || this.o.timezone,
        variables: {},
        env: this.o.allowEnvAccess ? publicEnv() : null,
        hooks: {
          nodeStarted: (nodeName, runIndex) => {
            events.push({ seq: ++seq, ts: Date.now(), type: 'node.started', node: nodeName, runIndex });
            this.emit(executionId, workflowId, 'node.started', { ...ref, nodeName, runIndex }, seq);
          },
          nodeFinished: (nodeName, runIndex, run: NodeRun) => {
            events.push({ seq: ++seq, ts: Date.now(), type: 'node.finished', node: nodeName, runIndex, status: run.status });
            this.emit(
              executionId,
              workflowId,
              'node.finished',
              {
                ...ref,
                nodeName,
                runIndex,
                status: run.status,
                executionTime: run.executionTime,
                itemCounts: run.data.main.map((list) => list.length),
                preview: previewOf(run.data.main),
                ...(run.error ? { error: run.error } : {}),
              },
              seq,
            );
          },
          edgeData: (from, to, itemCount) => {
            this.emit(executionId, workflowId, 'edge.data', { ...ref, from, to, itemCount }, ++seq);
          },
        },
      });
      const stoppedAt = new Date();
      repo.finish(executionId, {
        status: result.status,
        stoppedAt,
        lastNode: result.lastNodeExecuted,
        error: result.error,
        runData: result.runData,
        events,
      });
      this.emit(
        executionId,
        workflowId,
        'execution.finished',
        {
          ...ref,
          status: result.status,
          startedAt: startedAt.toISOString(),
          stoppedAt: stoppedAt.toISOString(),
          lastNodeExecuted: result.lastNodeExecuted,
          ...(result.error ? { error: result.error } : {}),
        },
        ++seq,
      );
      logger.info(`Execution ${executionId} (${options.workflow.name}) finished: ${result.status}${result.error ? ` – ${result.error.message}` : ''}`);
    } catch (err) {
      // The runner never throws; this protects against bugs (e.g. a database error while saving).
      logger.error(`Execution ${executionId} crashed`, err);
      repo.finish(executionId, {
        status: 'crashed',
        stoppedAt: new Date(),
        lastNode: null,
        error: { name: 'Error', message: err instanceof Error ? err.message : String(err) },
        runData: {},
        events,
      });
    } finally {
      this.running.delete(executionId);
    }
    return repo.get(executionId)!;
  }
}
