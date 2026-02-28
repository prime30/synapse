'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/features/auth/AuthProvider';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ProfileEditModal } from '@/components/features/auth/ProfileEditModal';
import { SupportPanel } from '@/components/support/SupportPanel';

export function UserMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name?: string | null; avatar_url?: string | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadProfile = useCallback(async () => {
    const res = await fetch('/api/profile');
    if (res.ok) {
      const data = await res.json();
      setProfile(data?.data ?? data);
    } else {
      setProfile({});
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProfile(data?.data ?? data);
      })
      .catch(() => {
        if (!cancelled) setProfile({});
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push('/');
    router.refresh();
  }, [router]);

  const handleEditProfile = useCallback(() => {
    setMenuOpen(false);
    setEditModalOpen(true);
  }, []);

  const handleOpenSupport = useCallback(() => {
    setMenuOpen(false);
    setSupportOpen(true);
  }, []);

  if (!user) return null;

  const fullName = profile?.full_name ?? user.user_metadata?.full_name ?? null;
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null;
  const email = user.email ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full p-0.5 border ide-border ide-surface-panel ide-hover focus:outline-none focus:ring-2 focus:ring-sky-500"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <UserAvatar
          avatarUrl={avatarUrl}
          fullName={fullName}
          email={email}
          userId={user.id}
          size="sm"
        />
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border ide-border ide-surface-pop shadow-xl shadow-black/40 py-1"
          role="menu"
        >
          <div className="px-3 py-2 border-b ide-border">
            <p className="text-sm font-medium ide-text truncate">
              {fullName || email || 'Signed in'}
            </p>
            {email && fullName && (
              <p className="text-xs ide-text-muted truncate">{email}</p>
            )}
          </div>
          <Link
            href="/account"
            onClick={() => setMenuOpen(false)}
            className="w-full px-3 py-2 flex items-center justify-between text-sm ide-text ide-hover transition-colors"
            role="menuitem"
          >
            <span>Account &amp; Billing</span>
            <span className="ide-text-muted text-xs">&rarr;</span>
          </Link>
          <div className="px-3 py-1.5">
            <p className="text-[11px] ide-text-muted tabular-nums">
              12 / 50 requests used
            </p>
            <div className="mt-1 h-1 w-full rounded-full bg-stone-200 dark:bg-[#1e1e1e] overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: '24%' }}
              />
            </div>
          </div>
          <div className="border-t ide-border my-1" />
          <button
            type="button"
            onClick={handleEditProfile}
            className="w-full px-3 py-2 text-left text-sm ide-text ide-hover transition-colors"
            role="menuitem"
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleOpenSupport}
            className="w-full px-3 py-2 text-left text-sm ide-text ide-hover transition-colors"
            role="menuitem"
          >
            Help &amp; Support
          </button>
          <div className="border-t ide-border my-1" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-left text-sm ide-text ide-hover transition-colors"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}

      <ProfileEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        fullName={fullName ?? ''}
        avatarUrl={avatarUrl ?? ''}
        onSaved={loadProfile}
      />

      <SupportPanel isOpen={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
