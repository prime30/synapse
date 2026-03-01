'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';

interface PreviewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  storeDomain: string;
  onSessionSaved: (expiresAt: string) => void;
}

type ModalStatus = 'idle' | 'connecting' | 'testing' | 'success' | 'error';

export function PreviewSessionModal({
  isOpen,
  onClose,
  projectId,
  storeDomain,
  onSessionSaved,
}: PreviewSessionModalProps) {
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [tkaPassword, setTkaPassword] = useState('');
  const [tkaStored, setTkaStored] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '');

  useEffect(() => {
    if (!isOpen) {
      setStatus('idle');
      setErrorMsg('');
      setCookieInput('');
      setTkaPassword('');
      setShowAdvanced(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/projects/${projectId}/preview-session`);
        if (cancelled) return;
        const data = await res.json();
        if (data.status === 'tka') {
          setTkaStored(true);
        }
      } catch { /* ignore */ }
    }
    check();
    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  const handleConnect = useCallback(async () => {
    const pw = tkaPassword.trim();
    if (!pw) return;

    if (!pw.startsWith('shptka_')) {
      setStatus('error');
      setErrorMsg('Theme Access passwords start with shptka_');
      return;
    }

    setStatus('connecting');
    setErrorMsg('');

    try {
      const res = await fetch(`/api/projects/${projectId}/preview-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeAccessPassword: pw }),
      });

      const data = await res.json();

      if (res.ok && data.valid) {
        setStatus('success');
        setTkaStored(true);
        onSessionSaved(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
        setTimeout(() => onClose(), 1200);
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Failed to save password');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    }
  }, [projectId, tkaPassword, onSessionSaved, onClose]);

  const saveCookie = useCallback(async (cookieStr: string) => {
    if (!cookieStr.trim()) return;
    setStatus('testing');
    setErrorMsg('');

    try {
      const res = await fetch(`/api/projects/${projectId}/preview-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: cookieStr.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.valid) {
        setStatus('success');
        onSessionSaved(data.expires_at);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatus('error');
        const debugStr = data.debug
          ? `\n[${data.debug.effectiveDomain} -> ${data.debug.redirectTo} (${data.debug.status})]`
          : '';
        setErrorMsg((data.error || 'Cookie validation failed.') + debugStr);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    }
  }, [projectId, onSessionSaved, onClose]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(`/api/projects/${projectId}/preview-session`, { method: 'DELETE' });
      setTkaStored(false);
      setTkaPassword('');
      onClose();
    } catch {
      // Best-effort
    }
  }, [projectId, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preview Session" size="md">
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-gray-400">
          Connect Synapse to preview your draft theme using a{' '}
          <a
            href={`https://${cleanDomain}/admin/apps/theme-access`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 underline"
          >
            Theme Access
          </a>
          {' '}password.
        </p>

        {/* TKA connected status */}
        {tkaStored && status === 'idle' && (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Theme Access connected
              </span>
            </div>
          </div>
        )}

        {/* TKA password input */}
        {(status === 'idle' || status === 'error') && (
          <div className="rounded-lg bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <label htmlFor="tka-password" className="block text-xs font-medium text-stone-900 dark:text-white mb-1.5">
                    {tkaStored ? 'Update Theme Access Password' : 'Theme Access Password'}
                  </label>
                  <input
                    ref={inputRef}
                    id="tka-password"
                    type="password"
                    value={tkaPassword}
                    onChange={(e) => {
                      setTkaPassword(e.target.value);
                      if (status === 'error') setStatus('idle');
                    }}
                    placeholder="shptka_..."
                    className="w-full rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 px-2.5 py-1.5 text-sm text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tkaPassword.trim()) handleConnect();
                    }}
                  />
                </div>
                <p className="text-xs text-stone-500 dark:text-gray-500">
                  Install the{' '}
                  <a
                    href={`https://${cleanDomain}/admin/apps/theme-access`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 underline"
                  >
                    Theme Access app
                  </a>
                  {' '}from your Shopify admin and create a password.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!tkaPassword.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#28CD56] hover:bg-[#22b84c] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connecting */}
        {status === 'connecting' && (
          <div className="flex items-center gap-2 py-6 justify-center">
            <span className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-stone-600 dark:text-gray-400">Validating Theme Access password...</span>
          </div>
        )}

        {/* Testing (manual cookie) */}
        {status === 'testing' && (
          <div className="flex items-center gap-2 py-6 justify-center">
            <span className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-stone-600 dark:text-gray-400">Validating with Shopify...</span>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Connected! Preview is refreshing with your draft theme.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && errorMsg && (
          <div className="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">
            <p className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap">{errorMsg}</p>
          </div>
        )}

        {/* Advanced: manual cookie paste */}
        {(status === 'idle' || status === 'error') && (
          <div className="border-t border-stone-200 dark:border-white/5 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-stone-400 dark:text-gray-600 hover:text-stone-600 dark:hover:text-gray-400 transition-colors flex items-center gap-1"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Advanced: manual cookie paste
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-stone-500 dark:text-gray-500">
                  Open your store&apos;s preview, copy the Cookie header from DevTools Network tab, and paste it below.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="password"
                    value={cookieInput}
                    onChange={(e) => {
                      setCookieInput(e.target.value);
                      if (status === 'error') setStatus('idle');
                    }}
                    placeholder="Paste cookie value"
                    className="flex-1 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 px-2.5 py-1.5 text-xs text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && cookieInput.trim()) saveCookie(cookieInput.trim());
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => cookieInput.trim() && saveCookie(cookieInput.trim())}
                    disabled={!cookieInput.trim()}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-stone-200 dark:bg-white/10 text-stone-700 dark:text-gray-300 hover:bg-stone-300 dark:hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {status !== 'connecting' && status !== 'testing' && status !== 'success' && (
          <div className="flex items-center justify-between pt-1 border-t border-stone-200 dark:border-white/5">
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[11px] text-stone-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Disconnect session
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-stone-600 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
