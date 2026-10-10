import { memo, useEffect, useMemo } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Check, CircleAlert, Hourglass, LoaderCircle, Pin, Plus, PowerOff, Radio } from 'lucide-react';
import { cn } from '../../components/ui/cn';
import { iconFor, isTriggerType, resolveSubtitle, staticOutputs } from '../../lib/node-types';
import { plural } from '../../lib/format';
import { listEdges } from '../graph';
import { editor, useEditor } from '../store';
import { useNodeTypeMap } from './types-context';

const handleTop = (i: number, n: number) => `${((i + 1) / (n + 1)) * 100}%`;

/** A workflow node on the canvas: icon box, name, subtitle, status, handles. */
export const WorkflowNodeCard = memo(function WorkflowNodeCard({ id, selected }: NodeProps) {
  const node = useEditor((s) => s.nodes.find((n) => n.id === id));
  const live = useEditor((s) => (node ? s.execution.nodes[node.name] : undefined));
  const pinned = useEditor((s) => (node ? Boolean(s.pinData[node.name]) : false));
  const listening = useEditor((s) => (node ? s.listening?.nodeName === node.name : false));
  const dynamic = useEditor((s) => s.dynamicOutputs[id]);
  const connections = useEditor((s) => s.connections);
  const types = useNodeTypeMap();
  const type = node ? types.get(node.type) : undefined;
  const updateInternals = useUpdateNodeInternals();
  const handleKey = node ? `${(type?.inputs ?? []).length}:${(dynamic ?? staticOutputs(type, node)).length}` : '';
  // Switch/Filter outputs arrive from the server after the first render: re-measure the handles,
  // otherwise React Flow cannot draw the connections attached to the new handles.
  useEffect(() => {
    updateInternals(id);
  }, [handleKey, id, updateInternals]);
  const connectedOutputs = useMemo(
    () => new Set(node ? listEdges(connections).filter((e) => e.source === node.name).map((e) => e.output) : []),
    [connections, node],
  );
  if (!node) return null;

  const Icon = iconFor(type?.icon);
  const trigger = isTriggerType(type);
  const inputs = (type?.inputs ?? []).filter((i) => i.type === 'main');
  const outputs = dynamic ?? staticOutputs(type, node);
  const subtitle = resolveSubtitle(type, node);
  const status = live?.status;
  const ok = status === 'success' || status === 'reused' || status === 'pinned';

  return (
    <div
      className="group/node relative flex w-[100px] flex-col items-center"
      data-testid="canvas-node"
      data-node-name={node.name}
      data-status={status ?? 'idle'}
      data-disabled={node.disabled ? 'true' : undefined}
      title={live?.error ? `${live.error.message}${live.error.hint ? `\n\n${live.error.hint}` : ''}` : undefined}
    >
      <div
        className={cn(
          'relative flex size-[100px] items-center justify-center border-2 bg-panel-2 transition-[box-shadow,border-color] duration-200',
          trigger ? 'rounded-l-[42px] rounded-r-xl' : 'rounded-xl',
          selected ? 'border-accent shadow-[0_0_0_4px_rgba(240,89,42,0.18)]' : 'border-line-strong',
          status === 'running' && 'ff-node-running border-info',
          ok && !selected && 'border-success/80',
          status === 'error' && !selected && 'border-danger',
          status === 'waiting' && !selected && 'border-warning',
          listening && 'ff-node-listening',
          node.disabled && 'opacity-50',
        )}
      >
        <Icon size={38} strokeWidth={1.6} style={{ color: node.disabled ? 'var(--color-subtle)' : (type?.defaults.color ?? 'var(--color-fg)') }} />
        {node.disabled && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-[2px] w-[120%] rotate-45 bg-subtle/70" />
          </span>
        )}
        {pinned && (
          <span className="absolute right-1.5 top-1.5 text-[#c4a6ff]" data-testid="node-pinned" title="Pinned data">
            <Pin size={14} />
          </span>
        )}
        {node.disabled && (
          <span className="absolute left-1.5 top-1.5 text-subtle" title="Disabled">
            <PowerOff size={13} />
          </span>
        )}
        {status === 'running' && <LoaderCircle size={16} className="absolute bottom-1.5 right-1.5 animate-spin text-info" />}
        {ok && <Check size={18} strokeWidth={3} className="absolute bottom-1.5 right-1.5 text-success" data-testid="node-success" />}
        {status === 'error' && <CircleAlert size={18} className="absolute bottom-1.5 right-1.5 text-danger" data-testid="node-error-badge" />}
        {status === 'waiting' && <Hourglass size={16} className="absolute bottom-1.5 right-1.5 text-warning" data-testid="node-waiting" />}
        {listening && <Radio size={15} className="absolute bottom-1.5 left-1.5 animate-pulse text-accent-hover" data-testid="node-listening" />}

        {inputs.map((input, i) => (
          <Handle
            key={`in-${i}`}
            id={`in-${i}`}
            type="target"
            position={Position.Left}
            style={{ top: handleTop(i, inputs.length) }}
            className="!size-3 !rounded-sm !border-2 !border-panel !bg-[#8a8a99] hover:!bg-accent"
          >
            {inputs.length > 1 && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] text-subtle">
                {input.displayName ?? `Input ${i + 1}`}
              </span>
            )}
          </Handle>
        ))}
        {outputs.map((output, i) => (
          <Handle
            key={`out-${i}`}
            id={`out-${i}`}
            type="source"
            position={Position.Right}
            style={{ top: handleTop(i, outputs.length) }}
            className={cn('!size-3 !rounded-full !border-2 !border-panel hover:!bg-accent', output.displayName === 'error' ? '!bg-danger' : '!bg-[#8a8a99]')}
          >
            {(outputs.length > 1 || output.displayName === 'error') && (
              <span className={cn('pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10.5px]', output.displayName === 'error' ? 'text-danger' : 'text-muted')}>
                {output.displayName ?? i}
              </span>
            )}
            {!connectedOutputs.has(i) && (
              <button
                type="button"
                title="Add a node here"
                data-testid={`add-from-${node.name}-${i}`}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.openCreator({ node: node.name, output: i });
                }}
                className={cn(
                  'nodrag nopan absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded border border-line-strong bg-panel-3 text-muted opacity-0 transition-opacity hover:border-accent hover:text-fg group-hover/node:opacity-100',
                  outputs.length > 1 || output.displayName === 'error' ? 'left-[52px]' : 'left-6',
                )}
              >
                <Plus size={12} />
              </button>
            )}
          </Handle>
        ))}
      </div>
      <div className="mt-2 w-[150px] text-center">
        <div className={cn('line-clamp-2 text-[12.5px] font-medium leading-tight', node.disabled && 'text-subtle line-through')}>{node.name}</div>
        {subtitle && <div className="truncate text-[11px] text-subtle">{subtitle}</div>}
        {live && live.status !== 'running' && (
          <div
            className={cn('text-[11px] font-medium', status === 'error' ? 'text-danger' : status === 'waiting' ? 'text-warning' : 'text-success')}
            data-testid="node-item-count"
          >
            {status === 'error' ? 'Error' : status === 'waiting' ? 'Waiting…' : plural(live.itemCount, 'item')}
            {live.runs > 1 && <span className="text-subtle"> · {live.runs} runs</span>}
          </div>
        )}
      </div>
    </div>
  );
});
