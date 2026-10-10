import { describe, expect, it } from 'vitest';
import type { Connections, WorkflowNode } from '@flowforge/shared';
import { addEdge, autoLayout, copyPayload, listEdges, pastePayload, removeEdges, removeNodeConnections, renameInWorkflow, uniqueName } from '../src/editor/graph';

const node = (name: string, x = 0, extra: Partial<WorkflowNode> = {}): WorkflowNode => ({
  id: name,
  name,
  type: 'flowforge.noOp',
  typeVersion: 1,
  position: [x, 0],
  parameters: {},
  ...extra,
});

describe('graph helpers', () => {
  it('adds edges without duplicates or self-loops, and removes them', () => {
    let c: Connections = {};
    c = addEdge(c, { source: 'A', output: 0, target: 'B', input: 0 });
    c = addEdge(c, { source: 'A', output: 0, target: 'B', input: 0 });
    c = addEdge(c, { source: 'A', output: 1, target: 'C', input: 0 });
    c = addEdge(c, { source: 'A', output: 0, target: 'A', input: 0 });
    expect(listEdges(c)).toEqual([
      { source: 'A', output: 0, target: 'B', input: 0 },
      { source: 'A', output: 1, target: 'C', input: 0 },
    ]);
    expect(c.A!.main![1]![0]).toEqual({ node: 'C', type: 'main', index: 0 });
    expect(listEdges(removeEdges(c, [{ source: 'A', output: 1, target: 'C', input: 0 }]))).toHaveLength(1);
    expect(removeNodeConnections(c, new Set(['B', 'C']))).toEqual({});
  });

  it('creates n8n-style unique names', () => {
    expect(uniqueName('Edit Fields', new Set())).toBe('Edit Fields');
    expect(uniqueName('Edit Fields', new Set(['Edit Fields']))).toBe('Edit Fields1');
    expect(uniqueName('Edit Fields', new Set(['Edit Fields', 'Edit Fields1']))).toBe('Edit Fields2');
    expect(uniqueName('Code1', new Set(['Code1']))).toBe('Code2');
  });

  it('renames a node everywhere: connections, pinned data and expressions', () => {
    const state = {
      nodes: [
        node('Users'),
        node('Set', 200, { parameters: { a: "={{ $('Users').item.json.x }}", b: '={{ $node["Users"].json.y }}', c: { d: ['={{ $items("Users").length }}'] }, e: 'Users stays' } }),
      ],
      connections: addEdge({}, { source: 'Users', output: 0, target: 'Set', input: 0 }),
      pinData: { Users: [{ json: { x: 1 } }] },
    };
    const out = renameInWorkflow(state, 'Users', 'People');
    expect(out.nodes.map((n) => n.name)).toEqual(['People', 'Set']);
    expect(out.nodes[1]!.parameters).toEqual({
      a: "={{ $('People').item.json.x }}",
      b: '={{ $node["People"].json.y }}',
      c: { d: ['={{ $items("People").length }}'] },
      e: 'Users stays',
    });
    expect(listEdges(out.connections)).toEqual([{ source: 'People', output: 0, target: 'Set', input: 0 }]);
    expect(out.pinData).toEqual({ People: [{ json: { x: 1 } }] });
  });

  it('copies and pastes nodes with their internal connections, renaming conflicts', () => {
    const nodes = [node('A'), node('B', 200), node('C', 400)];
    let c = addEdge({}, { source: 'A', output: 0, target: 'B', input: 0 });
    c = addEdge(c, { source: 'B', output: 0, target: 'C', input: 0 });
    const text = copyPayload(nodes, c, new Set(['A', 'B']));
    const pasted = pastePayload(text, nodes, [40, 40])!;
    expect(pasted.nodes.map((n) => n.name)).toEqual(['A1', 'B1']);
    expect(pasted.nodes[1]!.position).toEqual([240, 40]);
    expect(pasted.nodes[0]!.id).not.toBe('A');
    expect(listEdges(pasted.connections)).toEqual([{ source: 'A1', output: 0, target: 'B1', input: 0 }]);
    expect(pastePayload('not json', nodes, [0, 0])).toBeNull();
    expect(pastePayload('{"nodes":[{"foo":1}]}', nodes, [0, 0])).toBeNull();
  });

  it('auto-layout places connected nodes left to right and ignores sticky notes', () => {
    const nodes = [node('C', 0), node('A', 0), node('B', 0), node('Note', 999, { type: 'flowforge.stickyNote' })];
    let c = addEdge({}, { source: 'A', output: 0, target: 'B', input: 0 });
    c = addEdge(c, { source: 'B', output: 0, target: 'C', input: 0 });
    const pos = autoLayout(nodes, c, (n) => n.type === 'flowforge.stickyNote');
    expect(pos.get('A')![0]).toBeLessThan(pos.get('B')![0]);
    expect(pos.get('B')![0]).toBeLessThan(pos.get('C')![0]);
    expect(pos.has('Note')).toBe(false);
  });
});
