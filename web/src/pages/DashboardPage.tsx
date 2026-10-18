import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Activity, CircleCheck, Clock, Plug, Workflow } from 'lucide-react';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { Spinner } from '../components/ui/Spinner';
import { errorMessage } from '../lib/api';
import { useAuthStatus } from '../lib/auth';
import { duration, plural, timeAgo } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { StatusBadge } from './ExecutionsPage';
import { PageHeader } from './PageHeader';
import { useDashboard } from './dashboard/dashboard-api';
import { RunsChart } from './dashboard/RunsChart';
import { SystemCards } from './dashboard/SystemCards';

function Kpi({ icon, label, value, hint, testId }: { icon: ReactNode; label: string; value: string; hint?: string; testId: string }) {
  return (
    <Card className="p-5" data-testid={testId}>
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-subtle">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-muted">{hint}</div>}
    </Card>
  );
}

function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

const linkCls = 'text-[13px] text-accent hover:text-accent-hover';

/** Overview: instance cards, KPIs, runs per day, failing workflows, recent executions, integrations. */
export function DashboardPage() {
  useTitle('Overview');
  const auth = useAuthStatus();
  const q = useDashboard();
  const s = q.data;
  const name = auth.data?.user?.firstName;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Overview" subtitle={`${name ? `Welcome, ${name}. ` : ''}Here is the state of your FlowForge instance.`} />
      <div className="flex flex-col gap-6 px-8 py-6">
        <SystemCards />

        {q.isError && <Alert>Could not load the dashboard: {errorMessage(q.error)}</Alert>}
        {q.isLoading && (
          <div className="flex justify-center py-10" data-testid="dashboard-loading">
            <Spinner />
          </div>
        )}

        {s && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi testId="kpi-executions" icon={<Activity size={14} />} label="Executions (14 days)" value={String(s.totals.executions)} hint={`${s.totals.success} succeeded · ${s.totals.error} failed`} />
              <Kpi
                testId="kpi-success"
                icon={<CircleCheck size={14} />}
                label="Success rate"
                value={s.successRate === null ? '–' : `${Math.round(s.successRate * 100)}%`}
                hint={s.successRate === null ? 'No finished execution yet' : 'Finished executions, last 14 days'}
              />
              <Kpi testId="kpi-duration" icon={<Clock size={14} />} label="Average duration" value={s.avgDurationMs === null ? '–' : duration(s.avgDurationMs)} hint="Of finished executions" />
              <Kpi testId="kpi-active" icon={<Workflow size={14} />} label="Active workflows" value={`${s.workflows.active} / ${s.workflows.total}`} hint="Active / total" />
            </div>

            <Section title="Executions per day" action={<Link to="/executions" className={linkCls}>All executions</Link>}>
              {s.totals.executions === 0 ? (
                <div className="grid h-40 place-items-center text-center text-[13px] text-muted" data-testid="dashboard-empty">
                  <div>
                    No executions yet — run a workflow.
                    <div className="mt-2">
                      <Link to="/workflows" className={linkCls}>Open workflows</Link>
                    </div>
                  </div>
                </div>
              ) : (
                <RunsChart perDay={s.perDay} />
              )}
            </Section>

            <div className="grid gap-6 xl:grid-cols-2">
              <Section title="Top failing workflows" className="min-w-0">
                {s.topFailing.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted">No failures in the last 14 days.</p>
                ) : (
                  <ul className="divide-y divide-line" data-testid="top-failing">
                    {s.topFailing.map((f) => (
                      <li key={f.workflowId ?? f.workflowName} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          {f.workflowId ? (
                            <Link to={`/workflow/${f.workflowId}`} className="block truncate text-[13px] font-medium hover:text-accent">{f.workflowName}</Link>
                          ) : (
                            <span className="block truncate text-[13px] font-medium">{f.workflowName}</span>
                          )}
                          {f.lastError && <div className="mt-0.5 truncate text-[12px] text-muted" title={f.lastError}>{f.lastError}</div>}
                        </div>
                        <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[12px] font-medium text-[#ffb4b2]">{plural(f.errors, 'error')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Recent executions" action={<Link to="/executions" className={linkCls}>View all</Link>} className="min-w-0">
                {s.recent.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted">Nothing has run yet.</p>
                ) : (
                  <ul className="divide-y divide-line" data-testid="recent-executions">
                    {s.recent.map((e) => (
                      <li key={e.id}>
                        <Link to={`/executions/${e.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-panel-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{e.workflowName}</div>
                            <div className="text-[12px] text-muted">
                              #{e.id} · {timeAgo(e.startedAt ?? e.createdAt)}
                              {e.durationMs !== null && ` · ${duration(e.durationMs)}`}
                            </div>
                          </div>
                          <StatusBadge status={e.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Section title="Integrations" action={<Link to="/credentials" className={linkCls}>Open Credentials</Link>}>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="integrations">
                {s.integrations.map((i) => {
                  const state = i.count > 0 ? 'configured' : i.fromEnv ? 'from .env' : 'missing';
                  return (
                    <li key={i.type}>
                      <Link to="/credentials" className="flex items-center gap-3 rounded-md border border-line bg-panel-2 px-3 py-2.5 hover:border-line-strong" data-state={state}>
                        <Plug size={15} className="shrink-0 text-subtle" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{i.displayName}</div>
                          <div className="text-[12px] text-muted">{i.count > 0 ? plural(i.count, 'credential') : i.fromEnv ? 'Set in .env' : 'No credential'}</div>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            state === 'configured' && 'bg-success/15 text-[#a6efc6]',
                            state === 'from .env' && 'bg-info/15 text-[#b8d8ff]',
                            state === 'missing' && 'bg-panel-3 text-muted',
                          )}
                        >
                          {state}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
