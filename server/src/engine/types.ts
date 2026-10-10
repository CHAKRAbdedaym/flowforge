import type {
  BinaryRef,
  ConnectionSpec,
  ExecutionMode,
  Item,
  JsonObject,
  NodeDescription,
  NodeProperty,
  WorkflowData,
  WorkflowNode,
} from '@flowforge/shared';
import type { Logger } from '../logger.js';

export interface NodeHelpers {
  /** Stores a file for this execution and returns the reference to put in `item.binary`. */
  prepareBinaryData(data: Buffer, fileName?: string, mimeType?: string): Promise<BinaryRef>;
  /** Reads the bytes of `item.binary[property]` of the given input item. */
  getBinaryDataBuffer(itemIndex: number, property?: string): Promise<Buffer>;
  /** Turns plain objects (or an array of them) into items. */
  returnJsonArray(data: JsonObject | JsonObject[]): Item[];
}

export interface ExecuteContext {
  readonly node: WorkflowNode;
  readonly workflow: WorkflowData;
  readonly mode: ExecutionMode;
  readonly executionId: string;
  readonly runIndex: number;
  readonly signal: AbortSignal;
  readonly logger: Logger;
  readonly helpers: NodeHelpers;

  getInputData(inputIndex?: number): Item[];
  /** Number of main inputs this node has. */
  getInputCount(): number;
  /** Parameter value for the given item: defaults applied and `={{ }}` expressions resolved. */
  getNodeParameter<T = unknown>(name: string, itemIndex: number, fallback?: T): T;
  /** Raw stored parameter (no expression resolution). */
  getRawParameter(name: string): unknown;
  /** Evaluates an expression string ("={{ … }}") for an item. */
  evaluateExpression(expression: string, itemIndex: number): unknown;
  /** True when the node is set to continue (regular output or error output) after a failure. */
  continueOnFail(): boolean;
  /**
   * Runs `fn` for every item of input 0 and collects the results.
   * Per-item failures follow the node's "On Error" setting (stop / continue / error output).
   */
  forEachItem(fn: (item: Item, itemIndex: number) => Promise<Item | Item[] | null | undefined> | Item | Item[] | null | undefined): Promise<Item[]>;
  /** State that survives between runs of this node inside one execution (Loop Over Items). */
  getNodeState<T extends object>(): T;
  /** Output items (output 0, last run) of an already executed node, or undefined. */
  getNodeOutput(nodeName: string): Item[] | undefined;
  /** Resolves the paired item of `nodeName` for input item `itemIndex` (like `$('Node').item`). */
  getPairedItem(nodeName: string, itemIndex: number): Item;
  getTimezone(): string;
  /** Adds a line to the node's log (shown with the output). */
  addLog(line: string): void;
}

export interface NodeType {
  description: NodeDescription;
  properties: NodeProperty[];
  /** Nodes whose outputs depend on parameters (Switch, Filter) compute them here. */
  outputs?: (parameters: JsonObject) => ConnectionSpec[];
  execute?(ctx: ExecuteContext): Promise<Item[][]> | Item[][];
}

/** Identity helper giving node files full type checking. */
export function defineNode(node: NodeType): NodeType {
  return node;
}
