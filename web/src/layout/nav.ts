import { Braces, History, KeyRound, LayoutDashboard, LayoutTemplate, Settings, Workflow, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Phase that delivers the page (shown on placeholder pages until then). */
  phase?: string;
  description: string;
}

export const MAIN_NAV: NavItem[] = [
  { to: '/home', label: 'Overview', icon: LayoutDashboard, description: 'Dashboard: runs per day, success rate, failing workflows and instance status.' },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: Workflow,
    description: 'Create, open and organise workflows in the visual editor.',
  },
  {
    to: '/templates',
    label: 'Templates',
    icon: LayoutTemplate,
    description: 'Ready-made workflows you can import in one click.',
  },
  {
    to: '/executions',
    label: 'Executions',
    icon: History,
    description: 'Every run of every workflow, with the input and output of each node.',
  },
  {
    to: '/credentials',
    label: 'Credentials',
    icon: KeyRound,
    description: 'Encrypted API keys and logins for SMTP, Telegram, Discord and Gemini, with a Test button.',
  },
  {
    to: '/variables',
    label: 'Variables',
    icon: Braces,
    description: 'Global key/value pairs available in expressions as $vars.',
  },
];

export const SETTINGS_NAV: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  description: 'Timezone, execution timeout, concurrency, data pruning and security toggles.',
};
