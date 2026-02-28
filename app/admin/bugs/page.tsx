'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bug, Archive, Wrench, AlertTriangle, Clock, CheckCircle, ChevronDown, ExternalLink } from 'lucide-react';
import type { BugReport, BugSeverity, BugStatus } from '@/lib/types/database';

const STATUS_STYLES: Record<BugStatus, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Open' },
  in_progress: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'In Progress' },
  fixed: { bg: 'bg-[#28CD56]/10', text: 'text-[#28CD56]', label: 'Fixed' },
  archived: { bg: 'bg-stone-500/10', text: 'text-stone-500 dark:text-gray-500', label: 'Archived' },
};

const SEVERITY_COLORS: Record<BugSeverity, string> = {
  low: 'text-stone-400',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
};

function StatusBadge({ status }: { status: BugStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function TimeAgo({ date }: { date: string }) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const label = days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : `${mins}m ago`;
  return <span className="text-xs text-stone-500 dark:text-gray-500">{label}</span>;
}

export default function AdminBugsPage() {
  const [reports, setReports] = useState<(BugReport & { profiles?: { full_name: string; email: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<BugStatus | 'all'>('open');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/bug-reports?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.data?.reports ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const updateStatus = useCallback(async (id: string, status: BugStatus) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReports((prev) => prev.map((r) =>
          r.id === id ? { ...r, status } : r
        ));
      }
    } catch { /* ignore */ } finally {
      setUpdating(null);
    }
  }, []);

  const handleFix = useCallback((report: BugReport) => {
    const prompt = [
      `Fix this bug report:`,
      ``,
      `**${report.title}**`,
      report.description ? `\n${report.description}` : '',
      ``,
      `Severity: ${report.severity}`,
      `Report ID: ${report.id}`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(prompt).then(() => {
      updateStatus(report.id, 'in_progress');
      alert('Bug context copied to clipboard. Paste it into the agent chat to start fixing.');
    });
  }, [updateStatus]);

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] text-stone-900 dark:text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Bug className="h-6 w-6 text-red-500" />
            <h1 className="text-xl font-semibold">Bug Reports</h1>
            <span className="text-sm text-stone-500 dark:text-gray-500">
              {reports.length} {filter === 'all' ? 'total' : filter}
            </span>
          </div>

          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as BugStatus | 'all')}
              className="appearance-none pl-3 pr-8 py-1.5 text-sm bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="fixed">Fixed</option>
              <option value="archived">Archived</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-stone-500 dark:text-gray-500">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle className="h-8 w-8 text-[#28CD56] mx-auto mb-3" />
            <p className="text-stone-500 dark:text-gray-400">No {filter === 'all' ? '' : filter} bug reports</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="group bg-white dark:bg-white/[0.02] border border-stone-200 dark:border-white/5 rounded-xl p-4 hover:border-stone-300 dark:hover:border-white/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${SEVERITY_COLORS[report.severity]}`} />
                      <h3 className="text-sm font-medium truncate">{report.title}</h3>
                      <StatusBadge status={report.status} />
                    </div>
                    {report.description && (
                      <p className="text-xs text-stone-600 dark:text-gray-400 line-clamp-2 ml-5.5 mt-1">
                        {report.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 ml-5.5">
                      <span className="text-xs text-stone-500 dark:text-gray-500">
                        {(report as unknown as Record<string, unknown>).profiles
                          ? ((report as unknown as Record<string, unknown>).profiles as { full_name?: string; email?: string })?.full_name
                            ?? ((report as unknown as Record<string, unknown>).profiles as { email?: string })?.email
                          : 'Unknown'}
                      </span>
                      <TimeAgo date={report.created_at} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {report.status !== 'archived' && (
                      <button
                        onClick={() => updateStatus(report.id, 'archived')}
                        disabled={updating === report.id}
                        title="Archive"
                        className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-gray-300 hover:bg-stone-100 dark:hover:bg-white/5 transition-colors"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    {(report.status === 'open' || report.status === 'in_progress') && (
                      <button
                        onClick={() => handleFix(report)}
                        disabled={updating === report.id}
                        title="Fix with agent"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white bg-sky-500 hover:bg-sky-600 transition-colors"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Fix
                      </button>
                    )}
                    {report.status === 'in_progress' && (
                      <button
                        onClick={() => updateStatus(report.id, 'fixed')}
                        disabled={updating === report.id}
                        title="Mark as fixed"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white bg-[#28CD56] hover:bg-[#22b34a] transition-colors"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Done
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
