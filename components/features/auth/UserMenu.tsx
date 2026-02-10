'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/features/auth/AuthProvider';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ProfileEditModal } from '@/components/features/auth/ProfileEditModal';

export function UserMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name?: string | null; avatar_url?: string | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
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

  if (!user) return null;

  const fullName = profile?.full_name ?? user.user_metadata?.full_name ?? null;
  const avatarUrl = profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null;
  const email = user.email ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full p-0.5 border border-gray-600 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-700 bg-gray-900 shadow-xl shadow-black/40 py-1"
          role="menu"
        >
          <div className="px-3 py-2 border-b border-gray-700">
            <p className="text-sm font-medium text-gray-200 truncate">
              {fullName || email || 'Signed in'}
            </p>
            {email && fullName && (
              <p className="text-xs text-gray-500 truncate">{email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleEditProfile}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 transition-colors"
            role="menuitem"
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 transition-colors"
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
    </div>
  );
}
