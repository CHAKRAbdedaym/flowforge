import { errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { fetchExecution, runWorkflow, saveWorkflow, stopExecution } from '../lib/workflows-api';
import { editor, isRunning, useEditor, workflowData } from './store';

/** Loads the finished execution (full data) and tells the user how it went. */
export async function completeExecution(id: string) {
  // The WebSocket "finished" event and the fallback poller may both get here: only complete once.
  if (useEditor.getState().lastExecutionId === id) return true;
  try {
    const detail = await fetchExecution(id);
    if (['queued', 'running'].includes(detail.status)) return false;
    if (useEditor.getState().lastExecutionId === id) return true;
    editor.finishFromDetail(detail);
    const step = useEditor.getState().execution.destination;
    if (detail.status === 'success') toast.success(step ? 'Node executed successfully' : 'Workflow executed successfully');
    else if (detail.status === 'canceled') toast.info('Execution stopped');
    else if (detail.error) toast.error(detail.error.node ? `Problem in node "${detail.error.node}"` : 'Workflow could not run', detail.error.message);
    return true;
  } catch (err) {
    toast.error('Could not load the execution', errorMessage(err));
    return true;
  }
}

async function start(destination?: string) {
  const s = useEditor.getState();
  if (isRunning(s.execution.status)) return;
  if (!s.nodes.some((n) => n.type !== 'flowforge.stickyNote')) {
    toast.info('Add a node first', 'Start with a trigger such as "Manual Trigger".');
    return;
  }
  editor.prepareRun(destination);
  try {
    const { executionId } = await runWorkflow({
      workflow: workflowData(),
      ...(destination ? { destinationNode: destination, previousExecutionId: s.lastExecutionId ?? undefined } : {}),
    });
    // If the WebSocket events have not arrived (yet), adopt the id so the poller can follow the run.
    const ex = useEditor.getState().execution;
    if (!ex.id) useEditor.setState({ execution: { ...ex, id: executionId, status: 'queued' } });
  } catch (err) {
    editor.runFailedToStart({ name: 'Error', message: errorMessage(err) });
    toast.error('Could not start the workflow', errorMessage(err));
  }
}

export const executeWorkflow = () => start();
export const executeStep = (nodeName: string) => start(nodeName);

export async function stopCurrent() {
  const id = useEditor.getState().execution.id;
  if (id) await stopExecution(id).catch((err) => toast.error('Could not stop', errorMessage(err)));
}

export async function save(): Promise<boolean> {
  const s = useEditor.getState();
  if (!s.workflowId) return false;
  try {
    const record = await saveWorkflow(s.workflowId, workflowData());
    // Keep edits made while the request was in flight marked as unsaved.
    if (useEditor.getState().nodes === s.nodes && useEditor.getState().name === s.name) editor.markSaved(record);
    else useEditor.setState({ versionId: record.versionId });
    toast.success('Saved');
    return true;
  } catch (err) {
    toast.error('Could not save', errorMessage(err));
    return false;
  }
}
