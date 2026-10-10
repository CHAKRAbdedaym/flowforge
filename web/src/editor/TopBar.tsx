import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, Keyboard, Play, Save, Settings2, Square } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/cn';
import { executeWorkflow, save, stopCurrent } from './actions';
import { ActiveToggle } from './ActiveToggle';
import { editor, isRunning, useEditor } from './store';

function WorkflowName() {
  const name = useEditor((s) => s.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) editor.setName(draft.trim());
    else setDraft(name);
  };
  return editing ? (
    <input
      autoFocus
      data-testid="workflow-name-input"
      className="h-8 w-72 rounded border border-accent bg-panel-2 px-2 text-[14px] font-medium focus:outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(name);
          setEditing(false);
        }
      }}
    />
  ) : (
    <button type="button" data-testid="workflow-name" title="Rename" onClick={() => setEditing(true)} className="max-w-[360px] truncate rounded px-1.5 py-1 text-[14px] font-medium hover:bg-panel-3">
      {name}
    </button>
  );
}

export function TopBar() {
  const dirty = useEditor((s) => s.dirty);
  const status = useEditor((s) => s.execution.status);
  const running = isRunning(status);
  const [saving, setSaving] = useState(false);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
      <Link to="/workflows" className="flex items-center gap-1 rounded px-1.5 py-1 text-[12.5px] text-muted hover:bg-panel-3 hover:text-fg">
        <ChevronLeft size={16} /> Workflows
      </Link>
      <span className="text-subtle">/</span>
      <WorkflowName />
      <span
        data-testid="save-state"
        data-dirty={dirty ? 'true' : 'false'}
        className={cn('flex items-center gap-1.5 text-[12px]', dirty ? 'text-warning' : 'text-subtle')}
      >
        <span className={cn('size-1.5 rounded-full', dirty ? 'bg-warning' : 'bg-success')} />
        {dirty ? 'Unsaved changes' : 'Saved'}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <ActiveToggle />
        <div className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          title="Workflow settings"
          data-testid="open-settings"
          onClick={() => editor.setUi({ settingsOpen: true })}
          className="rounded p-2 text-subtle hover:bg-panel-3 hover:text-fg"
        >
          <Settings2 size={16} />
        </button>
        <button type="button" title="Keyboard shortcuts (?)" onClick={() => editor.setUi({ helpOpen: true })} className="rounded p-2 text-subtle hover:bg-panel-3 hover:text-fg">
          <Keyboard size={16} />
        </button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Save size={14} />}
          loading={saving}
          data-testid="save-workflow"
          onClick={async () => {
            setSaving(true);
            await save();
            setSaving(false);
          }}
        >
          Save
        </Button>
        {running ? (
          <Button variant="danger" size="sm" icon={<Square size={13} />} data-testid="stop-execution" onClick={() => void stopCurrent()}>
            Stop
          </Button>
        ) : (
          <Button size="sm" icon={<Play size={14} />} data-testid="execute-workflow" onClick={() => void executeWorkflow()}>
            Execute workflow
          </Button>
        )}
      </div>
    </header>
  );
}
