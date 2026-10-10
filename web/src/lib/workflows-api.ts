import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExecutionDetail,
  RunWorkflowRequest,
  TestListenRequest,
  TestListenResponse,
  WorkflowData,
  WorkflowRecord,
  WorkflowSummary,
} from '@flowforge/shared';
import { api } from './api';

export const workflowsKey = ['workflows'] as const;

export function useWorkflows() {
  return useQuery({ queryKey: workflowsKey, queryFn: () => api<WorkflowSummary[]>('/workflows') });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: () => api<WorkflowRecord>(`/workflows/${id}`),
    enabled: Boolean(id),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}

export function useCreateWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<WorkflowData> = {}) => api<WorkflowRecord>('/workflows', { method: 'POST', body }),
    onSuccess: () => void client.invalidateQueries({ queryKey: workflowsKey }),
  });
}

export function useRenameWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api<WorkflowRecord>(`/workflows/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: workflowsKey }),
  });
}

export function useDeleteWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/workflows/${id}`, { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: workflowsKey }),
  });
}

export const saveWorkflow = (id: string, data: WorkflowData) => api<WorkflowRecord>(`/workflows/${id}`, { method: 'PUT', body: data });

export const runWorkflow = (body: RunWorkflowRequest) => api<{ executionId: string }>('/executions/run', { method: 'POST', body });

export const stopExecution = (id: string) => api<{ stopped: boolean }>(`/executions/${id}/stop`, { method: 'POST' });

export const fetchExecution = (id: string) => api<ExecutionDetail>(`/executions/${id}`);

export const activateWorkflow = (id: string) => api<WorkflowRecord>(`/workflows/${id}/activate`, { method: 'POST', body: {} });

export const deactivateWorkflow = (id: string) => api<WorkflowRecord>(`/workflows/${id}/deactivate`, { method: 'POST', body: {} });

export const testListen = (id: string, body: TestListenRequest) => api<TestListenResponse>(`/workflows/${id}/test-listen`, { method: 'POST', body });

export const cancelTestListen = (id: string) => api<{ stopped: boolean }>(`/workflows/${id}/test-listen`, { method: 'DELETE' });

export function useToggleActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => (active ? activateWorkflow(id) : deactivateWorkflow(id)),
    onSettled: () => void client.invalidateQueries({ queryKey: workflowsKey }),
  });
}
