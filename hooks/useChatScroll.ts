'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

const SCROLL_THRESHOLD = 100; // px from bottom

export interface UseChatScrollReturn {
  /** Ref to attach to the scrollable container */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Scroll to bottom of the container */
  scrollToBottom: () => void;
  /** Whether the user is at the bottom of the scroll area */
  isAtBottom: boolean;
  /** Whether to show the "scroll to bottom" button (user scrolled up while content is loading) */
  showScrollButton: boolean;
}

/**
 * Manages scroll behavior for a chat message list: auto-scroll when new content arrives,
 * track user scroll position, and show a "scroll to bottom" button when the user has
 * scrolled up.
 */
export function useChatScroll(options?: {
  /** Whether new content is loading (streaming). When true, showScrollButton can be true when user scrolled up. */
  isLoading?: boolean;
  /** Dependencies that trigger auto-scroll when they change (e.g. messages, responseSuggestions) */
  scrollDeps?: unknown[];
}): UseChatScrollReturn {
  const { isLoading = false, scrollDeps = [] } = options ?? {};
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Auto-scroll to bottom when content changes (only when user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledUp) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [userScrolledUp, ...scrollDeps]);

  // Track user scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const isAtBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
      setUserScrolledUp(!isAtBottom);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset scroll state when streaming completes
  useEffect(() => {
    if (!isLoading) setUserScrolledUp(false);
  }, [isLoading]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
    setUserScrolledUp(false);
  }, []);

  const isAtBottom = !userScrolledUp;
  const showScrollButton = isLoading && userScrolledUp;

  return {
    scrollRef,
    scrollToBottom,
    isAtBottom,
    showScrollButton,
  };
}
