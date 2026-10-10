import { errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import type { NodeTypeInfo } from '@flowforge/shared';
import { isTriggerType } from '../lib/node-types';
import {
  activateWorkflow,
  cancelTestListen,
  deactivateWorkflow,
  fetchExecution,
  runWorkflow,
  saveWorkflow,
  stopExecution,
  testListen,
} from '../lib/workflows-api';
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

let nodeTypes = new Map<string, NodeTypeInfo>();
/** The editor registers the node types so actions can tell triggers apart. */
export function setNodeTypes(types: Map<string, NodeTypeInfo>) {
  nodeTypes = types;
}

const triggerKind = (nodeName: string) => {
  const node = useEditor.getState().nodes.find((n) => n.name === nodeName);
  const type = node ? nodeTypes.get(node.type) : undefined;
  return isTriggerType(type) ? (type?.trigger?.kind ?? 'manual') : null;
};

/**
 * "Listen for test event" on a trigger node: webhooks wait for a call to the test URL,
 * listeners for the next event; schedules / polls / event triggers run right away.
 */
export async function listenForTestEvent(nodeName: string) {
  const s = useEditor.getState();
  if (!s.workflowId) return;
  try {
    const res = await testListen(s.workflowId, { workflow: workflowData(), nodeName });
    if (res.kind === 'webhook' || res.kind === 'listener') {
      editor.setListening({ nodeName, testUrl: res.testUrl, method: res.method, expiresAt: res.expiresAt });
      editor.setUi({ logOpen: false });
    } else {
      editor.prepareRun();
    }
  } catch (err) {
    toast.error('Could not listen for a test event', errorMessage(err));
  }
}

export async function stopListening() {
  const id = useEditor.getState().workflowId;
  editor.setListening(null);
  if (id) await cancelTestListen(id).catch(() => undefined);
}

/** Like n8n: with a Manual Trigger run now; otherwise listen on (or fire) the first trigger. */
export function executeWorkflow() {
  const s = useEditor.getState();
  const triggers = s.nodes.filter((n) => !n.disabled && triggerKind(n.name));
  if (triggers.length === 0 || triggers.some((n) => triggerKind(n.name) === 'manual')) return start();
  return listenForTestEvent(triggers[0]!.name);
}

export const executeStep = (nodeName: string) => {
  const kind = triggerKind(nodeName);
  return kind && kind !== 'manual' ? listenForTestEvent(nodeName) : start(nodeName);
};

/** Active toggle: saves unsaved changes first, then (de)activates. */
export async function setActive(active: boolean) {
  const s = useEditor.getState();
  if (!s.workflowId) return;
  if (active && s.dirty && !(await save())) return;
  try {
    const record = await (active ? activateWorkflow(s.workflowId) : deactivateWorkflow(s.workflowId));
    editor.setActivation(record);
    if (active) toast.success('Workflow activated', 'Its triggers are now live.');
    else toast.info('Workflow deactivated');
  } catch (err) {
    editor.setActivation({ active: false, activationError: errorMessage(err) });
    toast.error('Could not activate the workflow', errorMessage(err));
  }
}

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
    editor.setActivation(record);
    if (s.active && !record.active && record.activationError) {
      toast.error('Saved, but the workflow was deactivated', record.activationError);
      return true;
    }
    toast.success('Saved');
    return true;
  } catch (err) {
    toast.error('Could not save', errorMessage(err));
    return false;
  }
}
