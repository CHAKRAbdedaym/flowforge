import dagre from '@dagrejs/dagre';
import type { Connections, ConnectionTarget, Item, JsonObject, WorkflowNode } from '@flowforge/shared';

/** A main connection, by node names. */
export interface EdgeRef {
  source: string;
  output: number;
  target: string;
  input: number;
}

export const edgeKey = (e: EdgeRef) => `${encodeURIComponent(e.source)}:${e.output}->${encodeURIComponent(e.target)}:${e.input}`;

export function listEdges(connections: Connections): EdgeRef[] {
  const edges: EdgeRef[] = [];
  for (const [source, byType] of Object.entries(connections)) {
    (byType.main ?? []).forEach((targets, output) => {
      for (const t of targets ?? []) edges.push({ source, output, target: t.node, input: t.index ?? 0 });
    });
  }
  return edges;
}

export function addEdge(connections: Connections, e: EdgeRef): Connections {
  if (e.source === e.target) return connections;
  if (listEdges(connections).some((x) => edgeKey(x) === edgeKey(e))) return connections;
  const main = [...(connections[e.source]?.main ?? [])];
  while (main.length <= e.output) main.push([]);
  main[e.output] = [...(main[e.output] ?? []), { node: e.target, type: 'main', index: e.input }];
  return { ...connections, [e.source]: { ...connections[e.source], main } };
}

export function removeEdges(connections: Connections, edges: EdgeRef[]): Connections {
  const remove = new Set(edges.map(edgeKey));
  const out: Connections = {};
  for (const [source, byType] of Object.entries(connections)) {
    const main = (byType.main ?? []).map((targets, output) =>
      (targets ?? []).filter((t) => !remove.has(edgeKey({ source, output, target: t.node, input: t.index ?? 0 }))),
    );
    while (main.length && main[main.length - 1]!.length === 0) main.pop();
    if (main.length) out[source] = { ...byType, main };
  }
  return out;
}

/** Drops every connection from or to the given nodes. */
export function removeNodeConnections(connections: Connections, names: Set<string>): Connections {
  return removeEdges(
    connections,
    listEdges(connections).filter((e) => names.has(e.source) || names.has(e.target)),
  );
}

/** n8n-style unique names: "Edit Fields", "Edit Fields1", "Edit Fields2"… */
export function uniqueName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  const stem = base.replace(/\d+$/, '');
  let n = 1;
  while (existing.has(`${stem}${n}`)) n++;
  return `${stem}${n}`;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renameInValue(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') {
    if (!value.includes(from)) return value;
    const name = escapeRegex(from);
    return value
      .replace(new RegExp(`(\\$\\(\\s*['"\`])${name}(['"\`]\\s*\\))`, 'g'), `$1${to}$2`)
      .replace(new RegExp(`(\\$node\\[\\s*['"])${name}(['"]\\s*\\])`, 'g'), `$1${to}$2`)
      .replace(new RegExp(`(\\$items\\(\\s*['"])${name}(['"])`, 'g'), `$1${to}$2`);
  }
  if (Array.isArray(value)) return value.map((v) => renameInValue(v, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameInValue(v, from, to)]));
  }
  return value;
}

/** Renames a node and updates connections, pinned data and expressions that reference it. */
export function renameInWorkflow(
  state: { nodes: WorkflowNode[]; connections: Connections; pinData: Record<string, Item[]> },
  from: string,
  to: string,
) {
  const nodes = state.nodes.map((n) => ({
    ...(n.name === from ? { ...n, name: to } : n),
    parameters: renameInValue(n.parameters, from, to) as JsonObject,
  }));
  const connections: Connections = {};
  for (const [source, byType] of Object.entries(state.connections)) {
    connections[source === from ? to : source] = {
      ...byType,
      main: (byType.main ?? []).map((targets) => (targets ?? []).map((t): ConnectionTarget => (t.node === from ? { ...t, node: to } : t))),
    };
  }
  const pinData = Object.fromEntries(Object.entries(state.pinData).map(([k, v]) => [k === from ? to : k, v]));
  return { nodes, connections, pinData };
}

export interface ClipboardPayload {
  flowforge: 1;
  nodes: WorkflowNode[];
  connections: Connections;
}

export function copyPayload(nodes: WorkflowNode[], connections: Connections, names: Set<string>): string {
  const picked = nodes.filter((n) => names.has(n.name));
  const internal = listEdges(connections).filter((e) => names.has(e.source) && names.has(e.target));
  const payload: ClipboardPayload = { flowforge: 1, nodes: picked, connections: internal.reduce(addEdge, {} as Connections) };
  return JSON.stringify(payload, null, 2);
}

/** Parses clipboard text (FlowForge or n8n-like JSON) into renamed copies placed at an offset. */
export function pastePayload(text: string, existing: WorkflowNode[], offset: [number, number]): { nodes: WorkflowNode[]; connections: Connections } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const data = parsed as Partial<ClipboardPayload>;
  if (!data || !Array.isArray(data.nodes) || data.nodes.some((n) => !n || typeof n.name !== 'string' || typeof n.type !== 'string')) return null;
  const taken = new Set(existing.map((n) => n.name));
  const rename = new Map<string, string>();
  const nodes = data.nodes.map((n) => {
    const name = uniqueName(n.name, taken);
    taken.add(name);
    rename.set(n.name, name);
    const [x, y] = Array.isArray(n.position) ? n.position : [0, 0];
    return { ...n, id: crypto.randomUUID(), name, position: [x + offset[0], y + offset[1]] as [number, number], parameters: n.parameters ?? {} };
  });
  let connections: Connections = {};
  for (const e of listEdges((data.connections ?? {}) as Connections)) {
    const source = rename.get(e.source);
    const target = rename.get(e.target);
    if (source && target) connections = addEdge(connections, { ...e, source, target });
  }
  return { nodes, connections };
}

export const NODE_SIZE = 100;

/** Left-to-right layout with dagre (sticky notes keep their position). */
export function autoLayout(nodes: WorkflowNode[], connections: Connections, isNote: (n: WorkflowNode) => boolean): Map<string, [number, number]> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 130, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  const laid = nodes.filter((n) => !isNote(n));
  for (const n of laid) g.setNode(n.name, { width: NODE_SIZE, height: NODE_SIZE + 40 });
  for (const e of listEdges(connections)) if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const minX = Math.min(...laid.map((n) => n.position[0]));
  const minY = Math.min(...laid.map((n) => n.position[1]));
  const out = new Map<string, [number, number]>();
  const xs = laid.map((n) => g.node(n.name).x);
  const ys = laid.map((n) => g.node(n.name).y);
  const offsetX = (Number.isFinite(minX) ? minX : 0) - Math.min(...xs);
  const offsetY = (Number.isFinite(minY) ? minY : 0) - Math.min(...ys);
  for (const n of laid) {
    const p = g.node(n.name);
    out.set(n.name, [Math.round((p.x + offsetX) / 20) * 20, Math.round((p.y + offsetY) / 20) * 20]);
  }
  return out;
}
