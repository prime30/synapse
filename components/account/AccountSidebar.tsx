'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Settings,
  Users,
  Puzzle,
  Bot,
  BarChart3,
  DollarSign,
  CreditCard,
  FileText,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccountSidebarProps {
  user: { email: string; name: string };
  plan: string;
}

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Navigation groups                                                  */
/* ------------------------------------------------------------------ */

const navGroups: NavItem[][] = [
  [
    { label: 'Overview', href: '/account', icon: LayoutDashboard },
    { label: 'Settings', href: '/account/settings', icon: Settings },
    { label: 'Members', href: '/account/members', icon: Users },
  ],
  [
    { label: 'Integrations', href: '/account/integrations', icon: Puzzle },
    { label: 'Agent Settings', href: '/account/agents', icon: Bot },
  ],
  [
    { label: 'Usage', href: '/account/usage', icon: BarChart3 },
    { label: 'Spending', href: '/account/spending', icon: DollarSign },
    {
      label: 'Billing & Invoices',
      href: '/account/billing',
      icon: CreditCard,
    },
  ],
  [
    {
      label: 'Docs',
      href: 'https://synapse.shop/docs',
      icon: FileText,
      external: true,
    },
    { label: 'Contact Us', href: '/support', icon: MessageCircle },
  ],
];

/* ------------------------------------------------------------------ */
/*  Plan badge color map                                               */
/* ------------------------------------------------------------------ */

const planColors: Record<string, string> = {
  starter: 'bg-gray-700 text-gray-300',
  pro: 'bg-emerald-900/60 text-emerald-400',
  team: 'bg-blue-900/60 text-blue-400',
  agency: 'bg-purple-900/60 text-purple-400',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AccountSidebar({ user, plan }: AccountSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/account') return pathname === '/account';
    return pathname.startsWith(href);
  };

  const badgeClass =
    planColors[plan.toLowerCase()] ?? planColors.starter;

  return (
    <aside className="w-64 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* ── User info ──────────────────────────────── */}
      <div className="p-5 border-b border-gray-800">
        <p className="text-sm font-medium text-white truncate">{user.name}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>
        <span
          className={`inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeClass}`}
        >
          {plan}
        </span>
      </div>

      {/* ── Navigation ─────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="border-t border-gray-800 my-2" />}
            {group.map((item) => {
              const Icon = item.icon;
              const active = !item.external && isActive(item.href);

              const baseClasses =
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors';
              const activeClasses = active
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50';

              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${baseClasses} ${activeClasses}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${baseClasses} ${activeClasses}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Back to IDE ────────────────────────────── */}
      <div className="p-3 border-t border-gray-800">
        <Link
          href="/projects"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to IDE
        </Link>
      </div>
    </aside>
  );
}
