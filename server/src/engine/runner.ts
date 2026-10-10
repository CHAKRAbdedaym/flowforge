import type {
  ExecutionMode,
  Item,
  NodeRun,
  NodeRunStatus,
  PairedItem,
  RunData,
  SerializedError,
  TaskSource,
  WorkflowData,
  WorkflowNode,
} from '@flowforge/shared';
import type { Logger } from '../logger.js';
import type { NodeRegistry } from '../nodes/registry.js';
import type { BinaryStore } from './binary-store.js';
import {
  ExecutionCanceledError,
  ExecutionTimeoutError,
  FlowError,
  NodeOperationError,
  WorkflowOperationError,
  serializeError,
  toFlowError,
} from './errors.js';
import type { ExpressionEngine } from './expressions/engine.js';
import { WorkflowGraph } from './graph.js';
import { NodeExecutionContext } from './node-context.js';
import type { NodeType } from './types.js';

export interface RunHooks {
  nodeStarted?(nodeName: string, runIndex: number): void;
  nodeFinished?(nodeName: string, runIndex: number, run: NodeRun): void;
  edgeData?(from: { node: string; output: number }, to: { node: string; input: number }, itemCount: number): void;
}

export interface RunRequest {
  workflow: WorkflowData;
  executionId: string;
  mode: ExecutionMode;
  /** Trigger to start from (default: the only trigger, or the Manual Trigger in manual mode). */
  startNode?: string;
  /** Items emitted by the start node instead of executing it (webhook payload, schedule tick…). */
  triggerItems?: Item[];
  /** Partial run ("execute step"): run only what this node needs and stop after it. */
  destinationNode?: string;
  /** Partial run: data from the previous run, reused for nodes whose inputs did not change. */
  previousRunData?: RunData;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxNodeRuns?: number;
  hooks?: RunHooks;
  timezone?: string;
  variables?: Record<string, string>;
  env?: Record<string, string> | null;
}

export interface RunResult {
  status: 'success' | 'error' | 'canceled';
  runData: RunData;
  error?: SerializedError;
  lastNodeExecuted: string | null;
}

export interface RunnerDeps {
  registry: NodeRegistry;
  expressions: ExpressionEngine;
  binaryStore: BinaryStore;
  logger: Logger;
  defaults: { timeoutMs: number; maxNodeRuns: number; timezone: string };
}

interface Task {
  node: string;
  inputs: Item[][];
  sources: (TaskSource | null)[];
  triggerItems?: Item[];
  /** True when something upstream was (re)executed in this run, so stored data must not be reused. */
  fresh: boolean;
}

interface Waiting {
  node: string;
  inputs: (Item[] | undefined)[];
  sources: (TaskSource | null)[];
  fresh: boolean;
}

/** Thrown to end the execution after a node failed with "On Error: Stop Workflow". */
class StopExecution extends Error {
  constructor(readonly error: FlowError) {
    super(error.message);
  }
}

const MANUAL_TRIGGER = 'flowforge.manualTrigger';

function raceAbort<T>(work: () => Promise<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return raceAbort(() => new Promise<void>((resolve) => setTimeout(resolve, ms)), signal);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeItems(list: unknown, nodeName: string): Item[] {
  if (!Array.isArray(list)) throw new NodeOperationError(`Node "${nodeName}" returned invalid output (expected a list of items)`);
  return list.map((item, i) => {
    const candidate = item as Item;
    if (!candidate || typeof candidate.json !== 'object' || candidate.json === null || Array.isArray(candidate.json)) {
      throw new NodeOperationError(`Node "${nodeName}" returned an invalid item at index ${i}`, {
        hint: 'Every item must look like { json: { … } }.',
      });
    }
    return candidate;
  });
}

/** Links every output item to the input item it came from (powers `$('Node').item`). */
function assignPairedItems(outputs: Item[][], inputs: Item[][]): Item[][] {
  const origin = new Map<Item, PairedItem>();
  inputs.forEach((list, input) =>
    list.forEach((item, index) => {
      if (!origin.has(item)) origin.set(item, input === 0 ? { item: index } : { item: index, input });
    }),
  );
  const total = inputs.reduce((n, list) => n + list.length, 0);
  const onlyInput = inputs.findIndex((list) => list.length > 0);
  return outputs.map((list) =>
    list.map((item, j) => {
      const from = origin.get(item);
      if (from) return { ...item, pairedItem: from };
      if (item.pairedItem !== undefined) return item;
      if (total === 1) return { ...item, pairedItem: onlyInput > 0 ? { item: 0, input: onlyInput } : { item: 0 } };
      if (inputs.length === 1 && list.length === inputs[0]!.length) return { ...item, pairedItem: { item: j } };
      return item;
    }),
  );
}

/**
 * Executes a workflow: items flow through main connections, node by node.
 * Order follows n8n v1: depth-first, one branch finished before the next, branches top-to-bottom.
 */
export class WorkflowRunner {
  constructor(private readonly deps: RunnerDeps) {}

  async run(req: RunRequest): Promise<RunResult> {
    const runData: RunData = {};
    let lastNode: string | null = null;
    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? this.deps.defaults.timeoutMs;
    const timer =
      timeoutMs > 0
        ? setTimeout(
            () =>
              controller.abort(
                new ExecutionTimeoutError(`Execution timed out after ${Math.round(timeoutMs / 100) / 10} s`, {
                  hint: 'Increase the timeout in the workflow settings, or make the slow node faster.',
                }),
              ),
            timeoutMs,
          )
        : undefined;
    const onExternalAbort = () => controller.abort(new ExecutionCanceledError('Execution was stopped'));
    if (req.signal?.aborted) onExternalAbort();
    req.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const graph = new WorkflowGraph(req.workflow);
      for (const node of graph.nodes.values()) this.deps.registry.require(node.type);
      const { tasks, allowed } = this.plan(req, graph);
      const stack: Task[] = [...tasks].reverse();
      const waiting: Waiting[] = [];
      const nodeState = new Map<string, object>();
      const maxRuns = req.maxNodeRuns ?? this.deps.defaults.maxNodeRuns;
      let totalRuns = 0;

      while (true) {
        if (controller.signal.aborted) throw controller.signal.reason;
        let task = stack.pop();
        if (!task) {
          // Nothing runnable left: run the oldest node that is still waiting for one of its inputs.
          const next = waiting.shift();
          if (!next) break;
          task = { node: next.node, inputs: next.inputs.map((i) => i ?? []), sources: next.sources, fresh: next.fresh };
        }
        if (++totalRuns > maxRuns) {
          throw new WorkflowOperationError(`Stopped after ${maxRuns} node executions`, {
            hint: 'The workflow probably loops forever. Check the conditions that end your loop.',
          });
        }
        const node = graph.node(task.node);
        lastNode = node.name; // set before running, so a failing node is reported as the last one
        const { outputs, status } = await this.runNode(req, graph, node, task, runData, nodeState, controller.signal);
        if (req.destinationNode === node.name) continue;
        this.deliver(req, graph, node, outputs, status, task, runData, allowed, stack, waiting);
      }
      return { status: 'success', runData, lastNodeExecuted: lastNode };
    } catch (err) {
      if (err instanceof StopExecution) {
        return { status: 'error', runData, error: serializeError(err.error), lastNodeExecuted: lastNode };
      }
      const error = err instanceof FlowError ? err : toFlowError(err, lastNode ?? 'workflow');
      return {
        status: err instanceof ExecutionCanceledError ? 'canceled' : 'error',
        runData,
        error: serializeError(error),
        lastNodeExecuted: lastNode,
      };
    } finally {
      if (timer) clearTimeout(timer);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private isTrigger(type: NodeType): boolean {
    return type.description.group === 'trigger' || type.description.trigger !== undefined;
  }

  /** Decides where execution starts and which nodes may run. */
  private plan(req: RunRequest, graph: WorkflowGraph): { tasks: Task[]; allowed: Set<string> | null } {
    const { registry } = this.deps;
    if (req.destinationNode) {
      const allowed = graph.ancestorsOf(graph.node(req.destinationNode).name);
      const roots = [...allowed]
        .filter((name) => graph.parents(name).every((p) => !allowed.has(p)))
        .sort((a, b) => this.compare(graph, a, b));
      const tasks = roots.map<Task>((name) => {
        const isTrigger = this.isTrigger(registry.require(graph.node(name).type));
        // A node without a trigger in front of it starts with one empty item (like n8n's "execute step").
        return isTrigger
          ? { node: name, inputs: [], sources: [], fresh: false }
          : { node: name, inputs: [[{ json: {} }]], sources: [null], fresh: false };
      });
      return { tasks, allowed };
    }

    let start: WorkflowNode;
    if (req.startNode) {
      start = graph.node(req.startNode);
    } else {
      const triggers = [...graph.nodes.values()].filter((n) => this.isTrigger(registry.require(n.type)));
      if (triggers.length === 0) {
        throw new WorkflowOperationError('This workflow has no trigger node', {
          hint: 'Add a "Manual Trigger" (or another trigger) and connect it to the first node.',
        });
      }
      const manual = triggers.filter((t) => t.type === MANUAL_TRIGGER);
      if (triggers.length === 1) start = triggers[0]!;
      else if (req.mode === 'manual' && manual.length === 1) start = manual[0]!;
      else {
        throw new WorkflowOperationError('This workflow has several triggers', {
          hint: 'Choose which trigger to start from.',
        });
      }
    }
    if (start.disabled) {
      throw new WorkflowOperationError(`The start node "${start.name}" is disabled`, { hint: 'Enable it to run the workflow.' });
    }
    return { tasks: [{ node: start.name, inputs: [], sources: [], triggerItems: req.triggerItems, fresh: true }], allowed: null };
  }

  private compare(graph: WorkflowGraph, a: string, b: string): number {
    const [ay, ax] = graph.position(a);
    const [by, bx] = graph.position(b);
    return ay - by || ax - bx;
  }

  private async runNode(
    req: RunRequest,
    graph: WorkflowGraph,
    node: WorkflowNode,
    task: Task,
    runData: RunData,
    nodeState: Map<string, object>,
    signal: AbortSignal,
  ): Promise<{ outputs: Item[][]; status: NodeRunStatus }> {
    const { registry, logger } = this.deps;
    const type = registry.require(node.type);
    const runIndex = runData[node.name]?.length ?? 0;
    req.hooks?.nodeStarted?.(node.name, runIndex);
    const startTime = Date.now();
    const specs = registry.outputsFor(node);
    const hasErrorOutput = node.onError === 'continueErrorOutput' && !this.isTrigger(type);
    const regularCount = hasErrorOutput ? specs.length - 1 : specs.length;
    const previous = req.previousRunData?.[node.name];
    const pinned = req.mode === 'manual' ? req.workflow.pinData?.[node.name] : undefined;

    let outputs: Item[][];
    let status: NodeRunStatus = 'success';
    let error: FlowError | undefined;
    let logs: string[] | undefined;
    const finish = () => {
      const run: NodeRun = { startTime, executionTime: Date.now() - startTime, status, source: task.sources, data: { main: outputs } };
      if (error) run.error = serializeError(error, node.name);
      if (logs?.length) run.logs = logs;
      (runData[node.name] ??= []).push(run);
      req.hooks?.nodeFinished?.(node.name, runIndex, run);
    };

    try {
      if (task.triggerItems) {
        outputs = [normalizeItems(task.triggerItems, node.name)];
      } else if (node.disabled) {
        outputs = [task.inputs[0] ?? []];
        status = 'disabled';
      } else if (pinned) {
        outputs = [normalizeItems(pinned.map((i) => ('json' in (i as object) ? i : { json: i as unknown as Item['json'] })), node.name)];
        status = 'pinned';
      } else if (req.destinationNode && node.name !== req.destinationNode && !task.fresh && previous?.length) {
        outputs = previous[previous.length - 1]!.data.main.map((list) => [...list]);
        status = 'reused';
      } else {
        const result = await this.execute(req, node, type, task, runData, nodeState, runIndex, signal, regularCount);
        outputs = result.outputs;
        logs = result.logs;
        if (result.error) {
          error = result.error;
          status = 'error';
        }
        if (hasErrorOutput) outputs.push(result.errorItems);
      }
      while (outputs.length < specs.length) outputs.push([]);
      if (status !== 'reused' && status !== 'pinned' && !task.triggerItems) outputs = assignPairedItems(outputs, task.inputs);
      finish();
      return { outputs, status };
    } catch (err) {
      outputs = [];
      status = 'error';
      if (err instanceof StopExecution) {
        error = err.error;
        logs = (err as StopExecution & { logs?: string[] }).logs;
        finish();
        throw err;
      }
      error = err instanceof FlowError ? err : toFlowError(err, node.name);
      error.node ??= node.name;
      finish();
      logger.debug(`Node "${node.name}" stopped the execution: ${error.message}`);
      throw err instanceof ExecutionCanceledError || err instanceof ExecutionTimeoutError ? err : new StopExecution(error);
    }
  }

  /** Runs the node's code with retries and the "On Error" setting applied. */
  private async execute(
    req: RunRequest,
    node: WorkflowNode,
    type: NodeType,
    task: Task,
    runData: RunData,
    nodeState: Map<string, object>,
    runIndex: number,
    signal: AbortSignal,
    regularCount: number,
  ): Promise<{ outputs: Item[][]; errorItems: Item[]; logs: string[]; error?: FlowError }> {
    if (!type.execute) return { outputs: [], errorItems: [], logs: [] };
    const inputs = node.executeOnce ? task.inputs.map((list) => list.slice(0, 1)) : task.inputs;
    const tries = node.retryOnFail ? clamp(node.maxTries ?? 3, 1, 5) : 1;
    const wait = clamp(node.waitBetweenTries ?? 1000, 0, 5000);
    let lastError: unknown;
    let lastLogs: string[] = [];

    for (let attempt = 1; attempt <= tries; attempt++) {
      const ctx = new NodeExecutionContext({
        node,
        type,
        workflow: req.workflow,
        mode: req.mode,
        executionId: req.executionId,
        runIndex,
        inputs,
        sources: task.sources,
        runData,
        nodeState,
        signal,
        logger: this.deps.logger,
        expressions: this.deps.expressions,
        binaryStore: this.deps.binaryStore,
        timezone: req.timezone ?? req.workflow.settings?.timezone ?? this.deps.defaults.timezone,
        variables: req.variables ?? {},
        env: req.env === undefined ? null : req.env,
      });
      try {
        const raw = await raceAbort(() => type.execute!(ctx), signal);
        if (!Array.isArray(raw)) throw new NodeOperationError(`Node "${node.name}" returned invalid output`);
        const outputs: Item[][] = [];
        for (let i = 0; i < regularCount; i++) outputs.push(normalizeItems(raw[i] ?? [], node.name));
        if (node.alwaysOutputData && outputs.every((list) => list.length === 0) && regularCount > 0) {
          outputs[0] = [{ json: {}, ...(inputs[0]?.length ? { pairedItem: { item: 0 } } : {}) }];
        }
        return { outputs, errorItems: ctx.errorItems, logs: ctx.logs };
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        lastError = err;
        lastLogs = ctx.logs;
        if (attempt < tries) {
          this.deps.logger.debug(`Node "${node.name}" failed (attempt ${attempt}/${tries}), retrying in ${wait} ms`);
          await sleep(wait, signal);
        }
      }
    }

    const error = toFlowError(lastError, node.name);
    const empty = () => Array.from({ length: regularCount }, () => [] as Item[]);
    switch (node.onError) {
      case 'continueRegularOutput': {
        const outputs = empty();
        if (regularCount > 0) outputs[0] = [{ json: { error: error.message }, pairedItem: { item: 0 } }];
        return { outputs, errorItems: [], logs: lastLogs, error };
      }
      case 'continueErrorOutput': {
        const source = inputs[0]?.length ? inputs[0] : [{ json: {} }];
        const errorItems = source.map<Item>((item, i) => ({ ...item, json: { ...item.json, error: error.message }, pairedItem: { item: i } }));
        return { outputs: empty(), errorItems, logs: lastLogs, error };
      }
      default: {
        const stop = new StopExecution(error) as StopExecution & { logs?: string[] };
        stop.logs = lastLogs;
        throw stop;
      }
    }
  }

  /** Sends a finished node's output items along its connections. */
  private deliver(
    req: RunRequest,
    graph: WorkflowGraph,
    node: WorkflowNode,
    outputs: Item[][],
    status: NodeRunStatus,
    task: Task,
    runData: RunData,
    allowed: Set<string> | null,
    stack: Task[],
    waiting: Waiting[],
  ): void {
    const runIndex = runData[node.name]!.length - 1;
    const fresh = task.fresh || (status !== 'reused' && status !== 'pinned');
    const deliveries: Array<{ output: number; target: string; input: number; items: Item[] }> = [];
    (req.workflow.connections[node.name]?.main ?? []).forEach((targets, output) => {
      const items = outputs[output];
      if (!items?.length) return;
      for (const t of targets ?? []) {
        if (allowed && !allowed.has(t.node)) continue;
        deliveries.push({ output, target: t.node, input: t.index ?? 0, items });
      }
    });
    deliveries.sort((a, b) => this.compare(graph, a.target, b.target) || a.output - b.output);

    const ready: Task[] = [];
    for (const d of deliveries) {
      req.hooks?.edgeData?.({ node: node.name, output: d.output }, { node: d.target, input: d.input }, d.items.length);
      const source: TaskSource = { previousNode: node.name, previousNodeOutput: d.output, previousNodeRun: runIndex };
      const target = graph.node(d.target);
      const inputCount = this.deps.registry.inputsFor(target).length;
      if (inputCount <= 1) {
        ready.push({ node: d.target, inputs: [d.items], sources: [source], fresh });
        continue;
      }
      let entry = waiting.find((w) => w.node === d.target && w.inputs[d.input] === undefined);
      if (!entry) {
        entry = { node: d.target, inputs: Array(inputCount).fill(undefined), sources: Array(inputCount).fill(null), fresh: false };
        waiting.push(entry);
      }
      entry.inputs[d.input] = d.items;
      entry.sources[d.input] = source;
      entry.fresh ||= fresh;
      if (entry.inputs.every((i) => i !== undefined)) {
        waiting.splice(waiting.indexOf(entry), 1);
        ready.push({ node: entry.node, inputs: entry.inputs as Item[][], sources: entry.sources, fresh: entry.fresh });
      }
    }
    // LIFO stack: push in reverse so the top-most branch runs first and completely.
    for (let i = ready.length - 1; i >= 0; i--) stack.push(ready[i]!);
  }
}
