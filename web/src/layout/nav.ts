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
  { to: '/home', label: 'Overview', icon: LayoutDashboard, description: 'Status of your FlowForge instance.' },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: Workflow,
    phase: '2',
    description: 'Create, open and organise workflows in the visual editor.',
  },
  {
    to: '/templates',
    label: 'Templates',
    icon: LayoutTemplate,
    phase: '7',
    description: 'Ready-made workflows you can import in one click.',
  },
  {
    to: '/executions',
    label: 'Executions',
    icon: History,
    phase: '7',
    description: 'Every run of every workflow, with the input and output of each node.',
  },
  {
    to: '/credentials',
    label: 'Credentials',
    icon: KeyRound,
    phase: '3B',
    description: 'Encrypted API keys and logins for SMTP, Telegram, Discord and Gemini, with a Test button.',
  },
  {
    to: '/variables',
    label: 'Variables',
    icon: Braces,
    phase: '7',
    description: 'Global key/value pairs available in expressions as $vars.',
  },
];

export const SETTINGS_NAV: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  phase: '7',
  description: 'Timezone, execution timeout, concurrency, data pruning and security toggles.',
};
