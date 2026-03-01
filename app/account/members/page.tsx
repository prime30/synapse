'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  BarChart3,
  Shield,
  BookOpen,
  Crown,
  UserPlus,
  X,
  ChevronDown,
  Trash2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Member';
  joined: string;
  requests: number;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_MEMBERS: TeamMember[] = [
  {
    id: '1',
    name: 'You',
    email: 'you@example.com',
    role: 'Owner',
    joined: 'Feb 1, 2026',
    requests: 24,
  },
];

const SEATS = { used: 1, total: 5 };

/* ------------------------------------------------------------------ */
/*  Feature cards for upsell                                           */
/* ------------------------------------------------------------------ */

const UPSELL_FEATURES = [
  {
    icon: Users,
    title: 'Team Management',
    description: 'Invite members and manage roles',
  },
  {
    icon: BarChart3,
    title: 'Usage Analytics',
    description: 'Track team usage across projects',
  },
  {
    icon: Shield,
    title: 'Admin Controls',
    description: 'Centralized billing and privacy settings',
  },
  {
    icon: BookOpen,
    title: 'Shared Knowledge',
    description: 'Share coding conventions across team',
  },
];

/* ------------------------------------------------------------------ */
/*  Invite Member Modal                                                */
/* ------------------------------------------------------------------ */

function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Member');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleSendInvite = async () => {
    setSending(true);
    setInviteError(null);
    try {
      const res = await fetch('/api/account/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to send invite');
      }
      setSent(true);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative ide-surface-panel border ide-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 ide-text-muted hover:text-stone-900 dark:hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold ide-text">Invite Member</h2>
        <p className="text-sm ide-text-muted mt-1">
          Send an invitation to join your team.
        </p>

        <label className="block mt-5">
          <span className="text-sm ide-text-muted">Email address</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="ide-input mt-1.5 w-full rounded-md px-3 py-2 text-sm"
          />
        </label>

        <label className="block mt-4">
          <span className="text-sm ide-text-muted">Role</span>
          <div className="relative mt-1.5">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="ide-input w-full appearance-none rounded-md px-3 py-2 pr-8 text-sm"
            >
              <option value="Member">Member</option>
              <option value="Admin">Admin</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 ide-text-muted pointer-events-none" />
          </div>
        </label>

        {inviteError && (
          <p className="text-sm text-red-500 mt-3">{inviteError}</p>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md ide-text-muted ide-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSendInvite}
            disabled={!email || sending}
            className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? 'Sending...' : sent ? 'Sent!' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Solo / Upsell View                                                 */
/* ------------------------------------------------------------------ */

function SoloUpsellView() {
  return (
    <section className="ide-surface-panel border ide-border rounded-lg p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-emerald-900/40 flex items-center justify-center mb-4">
        <Users className="h-6 w-6 text-emerald-400" />
      </div>

      <h2 className="text-xl font-semibold ide-text">Team Collaboration</h2>
      <p className="ide-text-muted text-sm mt-2 max-w-md mx-auto">
        Unlock powerful team features to collaborate on Shopify theme development
        with your team.
      </p>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 max-w-lg mx-auto">
        {UPSELL_FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="ide-surface-panel border ide-border rounded-lg p-4 text-left ide-hover transition-colors"
            >
              <div className="h-9 w-9 rounded-lg ide-surface-input flex items-center justify-center mb-3">
                <Icon className="h-4.5 w-4.5 text-emerald-400" />
              </div>
              <p className="text-sm font-medium ide-text">{f.title}</p>
              <p className="text-xs ide-text-muted mt-1">{f.description}</p>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="mt-8">
        <Link
          href="/account/billing"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
        >
          Upgrade to Team Plan
        </Link>
        <p className="text-xs ide-text-muted mt-3">
          Need enterprise?{' '}
          <Link
            href="/support"
            className="ide-text-muted hover:text-stone-900 dark:hover:text-white underline underline-offset-2 transition-colors"
          >
            Contact sales
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Team / Member List View                                            */
/* ------------------------------------------------------------------ */

function TeamMembersView({ members, seats }: { members: TeamMember[]; seats: { used: number; total: number } }) {
  const [showInviteModal, setShowInviteModal] = useState(false);

  return (
    <>
      <section className="ide-surface-panel border ide-border rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b ide-border">
          <div>
            <h2 className="text-base font-medium ide-text">
              Members{' '}
              <span className="ide-text-muted font-normal">
                ({seats.used} / {seats.total} seats)
              </span>
            </h2>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Invite Member
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs ide-text-muted uppercase tracking-wider border-b ide-border">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Joined</th>
                <th className="px-6 py-3 font-medium text-right">
                  Usage (requests)
                </th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-white/10">
              {members.map((m) => (
                <tr
                  key={m.id}
                  className="ide-hover transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium ide-text">{m.name}</span>
                      {m.role === 'Owner' && (
                        <Crown className="h-3.5 w-3.5 text-amber-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 ide-text-muted">{m.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        m.role === 'Owner'
                          ? 'bg-amber-900/40 text-amber-400'
                          : m.role === 'Admin'
                            ? 'ide-active text-sky-500 dark:text-sky-400'
                            : 'ide-surface-inset ide-text-2'
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 ide-text-muted">{m.joined}</td>
                  <td className="px-6 py-4 ide-text-muted text-right">
                    {m.requests}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.role !== 'Owner' ? (
                      <button className="ide-text-muted hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-xs ide-text-quiet">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showInviteModal && (
        <InviteMemberModal onClose={() => setShowInviteModal(false)} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MembersPage() {
  const [loading, setLoading] = useState(true);
  const [isTeamPlan, setIsTeamPlan] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [seats, setSeats] = useState({ used: 1, total: 5 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const subRes = await fetch('/api/billing/subscription');
        if (subRes.ok) {
          const data = await subRes.json();
          const sub = data.data ?? data;
          const plan = (sub.plan ?? 'starter').toLowerCase();
          if (!cancelled) {
            setIsTeamPlan(plan === 'team' || plan === 'agency');
          }
        }

        try {
          const membersRes = await fetch('/api/account/members');
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            const list = membersData.data ?? membersData;
            if (!cancelled && Array.isArray(list) && list.length > 0) {
              setMembers(list);
              setSeats((prev) => ({ ...prev, used: list.length }));
            }
          }
        } catch {
          // Route may not exist yet; current user fallback handled by default empty state
        }
      } catch {
        // subscription fetch failed; default to solo view
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-stone-200 dark:bg-white/10 rounded" />
          <div className="h-64 bg-stone-200 dark:bg-white/10 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="ide-text-muted text-sm mt-1">
          Manage your team and collaboration settings.
        </p>
      </div>

      {/* ── View ──────────────────────────────────── */}
      {isTeamPlan ? <TeamMembersView members={members} seats={seats} /> : <SoloUpsellView />}
    </div>
  );
}
