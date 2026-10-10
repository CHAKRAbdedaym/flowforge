import { Construction } from 'lucide-react';
import type { NavItem } from '../layout/nav';
import { useTitle } from '../lib/useTitle';
import { PageHeader } from './PageHeader';

/** Honest placeholder for pages delivered in a later phase. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  useTitle(item.label);
  const Icon = item.icon;
  return (
    <div className="animate-fade-in">
      <PageHeader title={item.label} subtitle={item.description} />
      <div className="grid place-items-center px-8 py-24">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <div className="grid size-14 place-items-center rounded-2xl border border-line bg-panel-2 text-accent-hover">
            <Icon size={26} />
          </div>
          <h2 className="text-base font-semibold">Not built yet</h2>
          <p className="text-muted">
            This page arrives in <strong className="text-fg">Phase {item.phase}</strong> of the build plan.
          </p>
          <p className="flex items-center gap-1.5 text-[12px] text-subtle">
            <Construction size={13} /> Progress is tracked in FEATURES.md
          </p>
        </div>
      </div>
    </div>
  );
}
