import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Download, LayoutTemplate, Pencil, Plus, Trash2, Workflow, X } from 'lucide-react';
import type { WorkflowRecord, WorkflowSummary } from '@flowforge/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import { toast } from '../lib/toast';
import { useTitle } from '../lib/useTitle';
import { cn } from '../components/ui/cn';
import { wsClient } from '../lib/ws';
import { useCreateWorkflow, useDeleteWorkflow, useRenameWorkflow, useToggleActive, useWorkflows, workflowsKey } from '../lib/workflows-api';
import { PageHeader } from './PageHeader';

function Row({ wf }: { wf: WorkflowSummary }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(wf.name);
  const [confirm, setConfirm] = useState(false);
  const rename = useRenameWorkflow();
  const remove = useDeleteWorkflow();
  const toggle = useToggleActive();
  const problem = wf.active ? wf.triggerError : wf.activationError;
  const commit = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== wf.name) {
      rename.mutate({ id: wf.id, name: name.trim() }, { onError: (err) => toast.error('Could not rename', errorMessage(err)) });
    } else setName(wf.name);
  };
  return (
    <div className="group flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-panel-2/60" data-testid="workflow-row" data-name={wf.name}>
      <Workflow size={18} className="shrink-0 text-accent-hover" />
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            data-testid="workflow-rename-input"
            className="h-8 w-full max-w-md rounded border border-accent bg-panel-2 px-2 text-[14px] focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setName(wf.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <Link to={`/workflow/${wf.id}`} className="block truncate text-[14px] font-medium hover:text-accent-hover" data-testid="workflow-link">
            {wf.name}
          </Link>
        )}
        <div className="text-[12px] text-subtle">
          {wf.nodeCount} node{wf.nodeCount === 1 ? '' : 's'} · updated {timeAgo(wf.updatedAt)} · created {new Date(wf.createdAt).toLocaleDateString()}
        </div>
        {problem && (
          <div className="truncate text-[12px] text-danger" data-testid="workflow-row-error" title={problem}>
            {problem}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2" title={problem ?? undefined}>
        <span className={cn('text-[12px]', wf.active ? (wf.triggerError ? 'text-danger' : 'text-success') : 'text-subtle')} data-testid="workflow-row-status">
          {wf.active ? 'Active' : 'Inactive'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={wf.active}
          aria-label={wf.active ? 'Deactivate' : 'Activate'}
          data-testid="workflow-row-toggle"
          disabled={toggle.isPending}
          onClick={() =>
            toggle.mutate(
              { id: wf.id, active: !wf.active },
              {
                onSuccess: () => toast.success(wf.active ? 'Workflow deactivated' : 'Workflow activated'),
                onError: (err) => toast.error('Could not activate the workflow', errorMessage(err)),
              },
            )
          }
          className={cn('relative h-5 w-9 rounded-full transition-colors disabled:opacity-50', wf.active ? 'bg-success' : 'bg-line-strong')}
        >
          <span className={cn('absolute top-0.5 size-4 rounded-full bg-white transition-all', wf.active ? 'left-[18px]' : 'left-0.5')} />
        </button>
      </div>
      <div className="flex gap-1 opacity-60 group-hover:opacity-100">
        <button type="button" title="Rename" data-testid="workflow-rename" onClick={() => setRenaming(true)} className="rounded p-2 text-subtle hover:bg-panel-3 hover:text-fg">
          <Pencil size={15} />
        </button>
        <button type="button" title="Delete" data-testid="workflow-delete" onClick={() => setConfirm(true)} className="rounded p-2 text-subtle hover:bg-panel-3 hover:text-danger">
          <Trash2 size={15} />
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          title={`Delete "${wf.name}"?`}
          message="The workflow is deleted permanently. Its past executions stay in the history."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            remove.mutate(wf.id, {
              onSuccess: () => toast.success('Workflow deleted'),
              onError: (err) => toast.error('Could not delete', errorMessage(err)),
            });
          }}
        />
      )}
    </div>
  );
}

interface ExampleInfo {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
}

/** Ready-made workflows from the repo's `examples/` folder: one click creates a copy. */
function ExamplesDialog({ onClose }: { onClose(): void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const examples = useQuery({ queryKey: ['examples'], queryFn: () => api<ExampleInfo[]>('/examples') });
  const [importing, setImporting] = useState<string>();
  const importExample = (id: string) => {
    setImporting(id);
    api<WorkflowRecord>(`/examples/${id}/import`, { method: 'POST' })
      .then((wf) => {
        void client.invalidateQueries({ queryKey: workflowsKey });
        toast.success('Example imported', `"${wf.name}" is ready to edit.`);
        navigate(`/workflow/${wf.id}`);
      })
      .catch((err) => toast.error('Could not import the example', errorMessage(err)))
      .finally(() => setImporting(undefined));
  };
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/55" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[86vh] w-[620px] max-w-[94vw] animate-fade-in flex-col overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl" role="dialog" aria-label="Examples" data-testid="examples-dialog">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <LayoutTemplate size={18} className="text-accent-hover" />
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold">Example workflows</h2>
            <p className="text-[12px] text-subtle">Imported as a copy you can edit. The files live in the examples/ folder.</p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="rounded p-1.5 text-subtle hover:bg-panel-3 hover:text-fg">
            <X size={16} />
          </button>
        </header>
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
          {examples.isPending ? (
            <Spinner />
          ) : examples.isError ? (
            <Alert>{errorMessage(examples.error)}</Alert>
          ) : examples.data.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-subtle">No example found in the examples/ folder.</p>
          ) : (
            examples.data.map((e) => (
              <div key={e.id} className="flex items-center gap-4 rounded-lg border border-line bg-panel-2/60 px-4 py-3" data-testid="example-row" data-id={e.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{e.name}</div>
                  <div className="text-[12.5px] text-muted">{e.description}</div>
                  <div className="mt-0.5 text-[11.5px] text-subtle">
                    {e.nodeCount} node{e.nodeCount === 1 ? '' : 's'}
                  </div>
                </div>
                <Button size="sm" icon={<Download size={14} />} loading={importing === e.id} onClick={() => importExample(e.id)} data-testid={`import-example-${e.id}`}>
                  Import
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowsPage() {
  useTitle('Workflows');
  const client = useQueryClient();
  // Activation changes (also from other tabs or trigger failures) refresh the list.
  useEffect(
    () =>
      wsClient.onEvent((e) => {
        if (e.type.startsWith('workflow.')) void client.invalidateQueries({ queryKey: workflowsKey });
      }),
    [client],
  );
  const navigate = useNavigate();
  const workflows = useWorkflows();
  const create = useCreateWorkflow();
  const [examples, setExamples] = useState(false);
  const createAndOpen = () =>
    create.mutate(
      {},
      {
        onSuccess: (wf) => navigate(`/workflow/${wf.id}`),
        onError: (err) => toast.error('Could not create the workflow', errorMessage(err)),
      },
    );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Workflows"
        subtitle="Create, open and organise your automations."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<LayoutTemplate size={16} />} onClick={() => setExamples(true)} data-testid="open-examples">
              Examples
            </Button>
            <Button icon={<Plus size={16} />} loading={create.isPending} onClick={createAndOpen} data-testid="create-workflow">
              Create workflow
            </Button>
          </div>
        }
      />
      {examples && <ExamplesDialog onClose={() => setExamples(false)} />}
      <div className="px-8 py-6">
        {workflows.isPending ? (
          <Spinner />
        ) : workflows.isError ? (
          <Alert>{errorMessage(workflows.error)}</Alert>
        ) : workflows.data.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="grid size-14 place-items-center rounded-2xl border border-line bg-panel-2 text-accent-hover">
              <Workflow size={26} />
            </div>
            <h2 className="text-base font-semibold">No workflows yet</h2>
            <p className="max-w-sm text-muted">A workflow connects a trigger to the steps that should run. Start with an empty canvas.</p>
            <div className="flex gap-2">
              <Button icon={<Plus size={16} />} onClick={createAndOpen} loading={create.isPending}>
                Create your first workflow
              </Button>
              <Button variant="secondary" icon={<LayoutTemplate size={16} />} onClick={() => setExamples(true)}>
                Start from an example
              </Button>
            </div>
          </Card>
        ) : (
          <Card data-testid="workflow-list">
            {workflows.data.map((wf) => (
              <Row key={wf.id} wf={wf} />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
