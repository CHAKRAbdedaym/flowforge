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

/** HTTP response sent back to the caller of a webhook (Respond to Webhook node, response modes). */
export interface WebhookResponse {
  statusCode: number;
  headers?: Record<string, string>;
  /** Object → JSON, string → text, Buffer → raw bytes, undefined → empty body. */
  body?: unknown;
  redirect?: string;
}

export interface SubWorkflowRequest {
  /** Workflow stored in the database… */
  workflowId?: string;
  /** …or given inline as JSON. */
  workflow?: WorkflowData;
  items: Item[];
  wait: boolean;
}

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
  /** Pauses the execution (Wait node). Never returns. */
  putExecutionToWait(resumeAt: Date | null, kind: 'time' | 'webhook' | 'form'): never;
  /** Sends the HTTP response of a webhook execution. Returns false when there is no caller waiting. */
  sendWebhookResponse(response: WebhookResponse): boolean;
  /** Runs another workflow and returns the output of its last node (or the input when not waiting). */
  executeWorkflow(request: SubWorkflowRequest): Promise<Item[]>;
  /** URLs that resume this execution when it waits for a webhook call or a form. */
  getResumeUrls(): { webhook: string; form: string };
}

/** Given to trigger nodes while their workflow is active (or listening for a test event). */
export interface TriggerContext {
  readonly node: WorkflowNode;
  readonly workflow: WorkflowData;
  /** "trigger" when active, "manual" when listening for a test event. */
  readonly mode: 'trigger' | 'manual';
  readonly logger: Logger;
  readonly timezone: string;
  /** Root folder file triggers may watch. */
  readonly filesRoot: string;
  getNodeParameter<T = unknown>(name: string, fallback?: T): T;
  /** Starts an execution with these items. */
  emit(items: Item[]): void;
  /** Reports a runtime problem (workflow stays active, status turns red). */
  emitError(error: Error): void;
  /** Data kept between polls (persisted). */
  getStaticData(): Record<string, unknown>;
}

export interface TriggerHandle {
  close(): Promise<void> | void;
}

export interface WebhookRequestData {
  method: string;
  /** Path params, e.g. { id: "42" } for "user/:id". */
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
  rawBody: Buffer;
  files: Array<{ field: string; fileName: string; mimeType: string; data: Buffer }>;
  /** Full URL that was called. */
  webhookUrl: string;
  executionMode: 'test' | 'production';
}

export type WebhookResponseMode = 'onReceived' | 'lastNode' | 'responseNode';

export type WebhookHandleResult =
  /** Answer right away without running the workflow (e.g. failed authentication). */
  | { response: WebhookResponse }
  | {
      items: Item[];
      responseMode: WebhookResponseMode;
      responseCode?: number;
      responseHeaders?: Record<string, string>;
      /** onReceived: custom body (default {"message":"Workflow was started"}). */
      onReceivedBody?: unknown;
      /** lastNode: what to send back. */
      lastNodeData?: 'firstEntryJson' | 'allEntries' | 'firstEntryBinary' | 'noData';
      binaryProperty?: string;
    };

/** Nodes that receive HTTP requests (Webhook, Form Trigger, Chat Trigger). */
export interface WebhookSpec {
  /** "/webhook/…" or "/form/…" style URLs. */
  urlPrefix: 'webhook' | 'form';
  /** HTTP methods and path (may contain :params) for this node instance. */
  endpoints(node: WorkflowNode, parameters: JsonObject): { methods: string[]; path: string };
  handle(input: {
    request: WebhookRequestData;
    parameters: JsonObject;
    node: WorkflowNode;
    storeBinary(data: Buffer, fileName?: string, mimeType?: string): Promise<BinaryRef>;
  }): Promise<WebhookHandleResult> | WebhookHandleResult;
  /** Allowed CORS origins ("*" or comma-separated), undefined = no CORS headers. */
  cors?(parameters: JsonObject): string | undefined;
}

export interface NodeType {
  description: NodeDescription;
  properties: NodeProperty[];
  /** Nodes whose outputs depend on parameters (Switch, Filter) compute them here. */
  outputs?: (parameters: JsonObject) => ConnectionSpec[];
  execute?(ctx: ExecuteContext): Promise<Item[][]> | Item[][];
  /** Schedule / listener triggers: start listening; return a handle that stops it. */
  trigger?(ctx: TriggerContext): Promise<TriggerHandle> | TriggerHandle;
  /** Checks the configuration before activation (throw to refuse with a clear message). */
  validate?(ctx: TriggerContext): void;
  /** Polling triggers: fetch and return the NEW items (dedupe with the helpers), or [] when nothing changed. */
  poll?(ctx: TriggerContext): Promise<Item[]>;
  /** Webhook-style triggers. */
  webhook?: WebhookSpec;
}

/** Identity helper giving node files full type checking. */
export function defineNode(node: NodeType): NodeType {
  return node;
}
