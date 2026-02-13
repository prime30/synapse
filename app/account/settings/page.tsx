'use client';

import { useState } from 'react';
import { Monitor, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Toggle Switch                                                      */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] dark:focus-visible:ring-offset-[#0a0a0a] ${
        checked ? 'bg-emerald-600' : 'ide-surface-inset'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Confirmation Modal                                          */
/* ------------------------------------------------------------------ */

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [confirmEmail, setConfirmEmail] = useState('');

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

        <h2 className="text-lg font-semibold text-red-400">Delete Account</h2>
        <p className="text-sm ide-text-muted mt-2">
          This will permanently delete your account and all associated data.
          This action <strong className="text-white">cannot be undone</strong>.
        </p>

        <label className="block mt-5">
          <span className="text-sm ide-text-muted">
            Type your email to confirm
          </span>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="you@example.com"
            className="ide-input mt-1.5 w-full rounded-md px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />
        </label>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md ide-text-muted ide-hover transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!confirmEmail}
            className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Permanently Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AccountSettingsPage() {
  const [shareData, setShareData] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold ide-text">Settings</h1>
        <p className="ide-text-muted text-sm mt-1">
          Privacy, sessions, and account management.
        </p>
      </div>

      {/* ── Privacy ────────────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <h2 className="text-base font-medium ide-text mb-4">Privacy</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Share Data</p>
            <p className="text-xs ide-text-muted mt-0.5">
              Help improve Synapse by sharing anonymous usage data
            </p>
          </div>
          <Toggle checked={shareData} onChange={setShareData} />
        </div>
      </section>

      {/* ── Active Sessions ────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <h2 className="text-base font-medium ide-text mb-4">Active Sessions</h2>

        {/* Current session card */}
        <div className="flex items-center gap-4 ide-surface-input rounded-lg p-4">
          <div className="h-10 w-10 rounded-lg ide-surface-input flex items-center justify-center">
            <Monitor className="h-5 w-5 ide-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium ide-text">Current Session</p>
            <p className="text-xs ide-text-muted mt-0.5">Web &middot; {today}</p>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded-full">
            Active
          </span>
        </div>

        <button className="mt-4 px-4 py-2 text-sm rounded-md border ide-border ide-text-muted ide-hover transition-colors">
          Revoke All Other Sessions
        </button>

        <p className="text-xs ide-text-quiet mt-3">
          Session revocation may take up to 10 minutes to take effect.
        </p>
      </section>

      {/* ── Danger Zone ────────────────────────────── */}
      <section className="ide-surface-panel border border-red-900/50 rounded-lg p-6">
        <h2 className="text-base font-medium text-red-400 mb-2">
          Danger Zone
        </h2>

        <p className="text-sm ide-text-muted">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="mt-4 px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors"
        >
          Delete Account
        </button>
      </section>

      {/* ── Delete confirmation modal ──────────────── */}
      {showDeleteModal && (
        <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />
      )}
    </div>
  );
}
