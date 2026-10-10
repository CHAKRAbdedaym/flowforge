import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleCheck, Copy, Cpu, Globe, HardDrive, Radio } from 'lucide-react';
import type { HealthResponse, PublicUser, SystemInfo } from '@flowforge/shared';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { useTitle } from '../lib/useTitle';
import { useWsStore } from '../lib/ws';
import { PageHeader } from './PageHeader';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

function StatCard({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-subtle">
        {icon}
        {label}
      </div>
      <div className="min-h-[44px]">{children}</div>
    </Card>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded p-1 text-subtle hover:bg-panel-3 hover:text-fg"
      aria-label="Copy"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}

const PHASES: Array<[string, string]> = [
  ['0', 'Foundation: install, login, app shell, live connection'],
  ['1', 'Execution engine + core nodes'],
  ['2', 'Visual editor + live execution view'],
  ['3', 'Triggers: webhook, schedule, error, sub-workflows, wait'],
  ['3B', 'Send Email + Form Trigger (builder, QR, validation)'],
  ['4', 'Data, file and network nodes'],
  ['5', 'Telegram, Discord, Open-Meteo, Gemini, chat, npm run check'],
  ['6', 'AI Agent + AI Workflow Builder'],
  ['7', 'Workflows, executions, versions, variables, settings, dashboard'],
  ['8', 'Time travel, Demo Mode, examples, teacher demo script'],
];
const DONE_PHASES = new Set(['0']);

export function OverviewPage({ user }: { user: PublicUser }) {
  useTitle('Overview');
  const wsStatus = useWsStore((s) => s.status);
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<HealthResponse>('/health'), refetchInterval: 30_000 });
  const info = useQuery({ queryKey: ['system', 'info'], queryFn: () => api<SystemInfo>('/system/info') });

  return (
    <div className="animate-fade-in">
      <PageHeader title="Overview" subtitle={`Welcome, ${user.firstName}. Here is the state of your FlowForge instance.`} />
      <div className="flex flex-col gap-6 px-8 py-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Cpu size={14} />} label="Server">
            {health.data ? (
              <div data-testid="server-status">
                <div className="flex items-center gap-2 font-medium text-success">
                  <CircleCheck size={16} /> Running
                </div>
                <div className="mt-1 text-[12px] text-muted">
                  v{health.data.version} · Node {health.data.nodeVersion} · up {formatUptime(health.data.uptimeSeconds)}
                </div>
              </div>
            ) : health.isError ? (
              <span className="text-danger">Unreachable</span>
            ) : (
              <Spinner />
            )}
          </StatCard>

          <StatCard icon={<Radio size={14} />} label="Real-time">
            <div className={cn('font-medium', wsStatus === 'open' ? 'text-success' : 'text-warning')}>
              {wsStatus === 'open' ? 'Connected' : wsStatus === 'idle' ? 'Offline' : 'Connecting…'}
            </div>
            <div className="mt-1 text-[12px] text-muted">WebSocket for live execution updates</div>
          </StatCard>

          <StatCard icon={<Globe size={14} />} label="Public URL">
            {info.data ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="truncate font-mono text-[13px]" data-testid="public-url">
                    {info.data.publicUrl}
                  </span>
                  <CopyButton text={info.data.publicUrl} />
                </div>
                <div className="mt-1 text-[12px] text-muted">Used for webhooks, forms and QR codes</div>
              </>
            ) : (
              <Spinner />
            )}
          </StatCard>

          <StatCard icon={<HardDrive size={14} />} label="Data folder">
            {info.data ? (
              <>
                {/* rtl + bdi: long paths are cut on the left, so the meaningful end stays visible */}
                <div className="truncate font-mono text-[13px]" style={{ direction: 'rtl', textAlign: 'left' }} title={info.data.dataDir}>
                  <bdi>{info.data.dataDir}</bdi>
                </div>
                <div className="mt-1 text-[12px] text-muted">SQLite database, files and keys</div>
              </>
            ) : (
              <Spinner />
            )}
          </StatCard>
        </div>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Build progress</h2>
          <p className="mt-1 text-[13px] text-muted">
            FlowForge is built in phases. Each phase is tested before it is ticked in FEATURES.md.
          </p>
          <ol className="mt-4 grid gap-2 md:grid-cols-2">
            {PHASES.map(([id, label]) => {
              const done = DONE_PHASES.has(id);
              return (
                <li key={id} className="flex items-start gap-3 rounded-md border border-line bg-panel-2 px-3 py-2.5">
                  <span
                    className={cn(
                      'mt-px grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                      done ? 'bg-success/20 text-success' : 'bg-panel-3 text-subtle',
                    )}
                  >
                    {done ? <Check size={13} /> : id}
                  </span>
                  <span className={cn('text-[13px]', done ? 'text-fg' : 'text-muted')}>
                    <strong className="font-medium">Phase {id}</strong> · {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}
