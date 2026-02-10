'use client';

export interface UserAvatarProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  /** Fallback when no fullName: use first 1–2 chars of email */
  email?: string | null;
  /** Fallback when no fullName/email: show this (e.g. truncated user_id) */
  userId?: string | null;
  /** Background color for initials circle */
  fallbackColor?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(
  fullName?: string | null,
  email?: string | null,
  userId?: string | null
): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? '';
      const last = parts[parts.length - 1]?.[0] ?? '';
      return (first + last).toUpperCase().slice(0, 2);
    }
    return (parts[0]?.[0] ?? '').toUpperCase().slice(0, 2) || '?';
  }
  if (email?.trim()) {
    const local = email.split('@')[0] ?? '';
    return (local[0] ?? '?').toUpperCase() + (local[1] ?? '').toUpperCase();
  }
  if (userId) {
    return userId.slice(0, 2).toUpperCase();
  }
  return '?';
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export function UserAvatar({
  avatarUrl,
  fullName,
  email,
  userId,
  fallbackColor = '#6b7280',
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const initials = getInitials(fullName, email, userId);
  const sizeClass = sizeClasses[size];

  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl.trim()}
        alt={fullName ?? 'User avatar'}
        className={`rounded-full object-cover flex-shrink-0 ${sizeClass} ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className={`rounded-full flex items-center justify-center font-medium text-gray-200 flex-shrink-0 ${sizeClass} ${className}`}
      style={{ backgroundColor: fallbackColor }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
