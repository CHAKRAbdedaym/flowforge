import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import type { NodeProperty, SystemInfo } from '@flowforge/shared';
import { cn } from '../../components/ui/cn';
import { api } from '../../lib/api';
import { useWorkflows } from '../../lib/workflows-api';
import { CopyText } from '../ndv/TriggerPanel';
import { useEditor } from '../store';
import { useNodeEdit } from './context';
import { inputClass } from './Field';

/** Test / production URLs of a webhook-style trigger, built from its path and method parameters. */
export function WebhookUrls({ property }: { property: NodeProperty }) {
  const { nodeName } = useNodeEdit();
  const node = useEditor((s) => s.nodes.find((n) => n.name === nodeName));
  const info = useQuery({ queryKey: ['system', 'info'], queryFn: () => api<SystemInfo>('/system/info'), staleTime: 60_000 });
  const [tab, setTab] = useState<'test' | 'production'>('test');
  if (!node) return null;
  const prefix = property.typeOptions?.urlPrefix ?? 'webhook';
  const params = node.parameters as { path?: string; httpMethod?: string };
  const path = String(params.path || node.webhookId || node.id)
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const base = info.data?.publicUrl ?? window.location.origin;
  const url = `${base}/${tab === 'test' ? `${prefix}-test` : prefix}/${path}`;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-panel-2/60 p-2.5" data-testid="webhook-urls">
      <div className="flex items-center gap-1">
        <span className="mr-auto text-[12.5px] font-medium text-muted">{property.displayName}</span>
        {(['test', 'production'] as const).map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`webhook-url-${t}`}
            onClick={() => setTab(t)}
            className={cn('rounded px-2 py-0.5 text-[11.5px] capitalize', tab === t ? 'bg-panel-3 text-fg' : 'text-subtle hover:text-fg')}
          >
            {t} URL
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {prefix === 'webhook' && <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] text-accent-hover">{params.httpMethod ?? 'GET'}</span>}
        <div className="min-w-0 flex-1">
          <CopyText text={url} testId="webhook-url" />
        </div>
      </div>
      <p className="text-[11.5px] text-subtle">
        {tab === 'test'
          ? 'Works once after clicking "Listen for test event" (120 s). The run shows live in the editor.'
          : 'Works while the workflow is active. Runs appear in the executions list.'}
      </p>
    </div>
  );
}

/** Pick a saved workflow (Execute Workflow node). */
export function WorkflowSelector({ value, onChange, testId }: { value: unknown; onChange(v: unknown): void; testId: string }) {
  const workflows = useWorkflows();
  const current = useEditor((s) => s.workflowId);
  const id = typeof value === 'string' ? value : '';
  return (
    <div className="flex items-center gap-1.5">
      <select className={inputClass} data-testid={`${testId}-select`} value={id} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a workflow…</option>
        {(workflows.data ?? []).map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.id === current ? ' (this workflow)' : ''}
          </option>
        ))}
        {id && !workflows.data?.some((w) => w.id === id) && <option value={id}>Unknown workflow ({id})</option>}
      </select>
      {id && (
        <a href={`/workflow/${id}`} target="_blank" rel="noreferrer" title="Open in a new tab" className="rounded p-1.5 text-subtle hover:bg-panel-3 hover:text-fg">
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}
