import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import type { PublicUser } from '@flowforge/shared';
import { wsClient } from '../lib/ws';
import { Sidebar } from './Sidebar';

const COLLAPSE_KEY = 'ff.sidebarCollapsed';

export function AppLayout({ user }: { user: PublicUser }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    wsClient.connect();
    return () => wsClient.disconnect();
  }, []);

  const toggle = () =>
    setCollapsed((value) => {
      localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      return !value;
    });

  return (
    <div className="flex h-full">
      <Sidebar user={user} collapsed={collapsed} onToggle={toggle} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
