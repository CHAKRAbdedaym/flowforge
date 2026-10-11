import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Terminal } from 'lucide-react';
import type { InstanceSettings } from '@flowforge/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Toggle } from '../components/ui/Toggle';
import { api, errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { useTitle } from '../lib/useTitle';
import { PageHeader } from './PageHeader';

const settingsKey = ['settings'] as const;

export function SettingsPage() {
  useTitle('Settings');
  const client = useQueryClient();
  const settings = useQuery({ queryKey: settingsKey, queryFn: () => api<InstanceSettings>('/settings') });
  const update = useMutation({
    mutationFn: (patch: Partial<InstanceSettings>) => api<InstanceSettings>('/settings', { method: 'PATCH', body: patch }),
    onSuccess: (data) => client.setQueryData(settingsKey, data),
    onError: (err) => toast.error('Could not save the setting', errorMessage(err)),
  });
  const [confirm, setConfirm] = useState(false);
  const enabled = settings.data?.executeCommandEnabled === true;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Settings" subtitle="Switches for this FlowForge instance." />
      <div className="flex max-w-3xl flex-col gap-5 px-8 py-6">
        {settings.isPending ? (
          <Spinner />
        ) : settings.isError ? (
          <Alert>{errorMessage(settings.error)}</Alert>
        ) : (
          <Card>
            <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-[13px] font-semibold">
              <ShieldAlert size={16} className="text-accent-hover" /> Security
            </div>
            <div className="flex items-start gap-4 px-5 py-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-accent-hover">
                <Terminal size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">Allow the Execute Command node</div>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  The Execute Command node runs shell commands on the computer where FlowForge is installed, with the same rights as FlowForge. It is{' '}
                  <b className="text-fg">off by default</b>. While it is off, the node fails with a clear message and nothing is run.
                </p>
                <p className="mt-1.5 text-[12px]" data-testid="setting-executeCommand-state">
                  {enabled ? <span className="text-warning">Enabled: workflows can run commands on this computer.</span> : <span className="text-success">Disabled (safe).</span>}
                </p>
              </div>
              <Toggle
                checked={enabled}
                label="Allow the Execute Command node"
                testId="setting-executeCommandEnabled"
                onChange={(next) => (next ? setConfirm(true) : update.mutate({ executeCommandEnabled: false }, { onSuccess: () => toast.info('Execute Command disabled') }))}
              />
            </div>
          </Card>
        )}
        <p className="text-[12.5px] text-subtle">More settings (time zone, execution timeout, data pruning) arrive in Phase 7. Until then they are set in the .env file.</p>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Allow shell commands?"
          message="Any workflow will be able to run commands on this computer with the rights of FlowForge: read and delete files, install programs… Enable it only if you trust everyone who can edit workflows here."
          confirmLabel="Enable Execute Command"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            update.mutate({ executeCommandEnabled: true }, { onSuccess: () => toast.success('Execute Command enabled', 'You can turn it off again here at any time.') });
          }}
        />
      )}
    </div>
  );
}
