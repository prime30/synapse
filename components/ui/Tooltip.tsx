'use client';

import {
  type ReactNode,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { positionElement } from '@/lib/ui/positioning';
import type { Placement } from '@floating-ui/dom';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: Placement;
  delayMs?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delayMs = 300,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none)').matches;
  }, []);

  const show = useCallback(() => {
    if (isTouchDevice) return;
    hideTimeoutRef.current && clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = null;
    if (isVisible) return;
    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      showTimeoutRef.current = null;
    }, delayMs);
  }, [isTouchDevice, isVisible, delayMs]);

  const hide = useCallback(() => {
    showTimeoutRef.current && clearTimeout(showTimeoutRef.current);
    showTimeoutRef.current = null;
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      hideTimeoutRef.current = null;
    }, 100);
  }, []);

  const handleMouseEnter = useCallback(() => {
    show();
  }, [show]);

  const handleMouseLeave = useCallback(() => {
    if (!isFocused) hide();
  }, [hide, isFocused]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    show();
  }, [show]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    hide();
  }, [hide]);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      positionElement(triggerRef.current, tooltipRef.current, {
        placement,
        offsetPx: 4,
        strategy: 'fixed',
      });
    }
  }, [isVisible, placement]);

  useEffect(() => {
    return () => {
      showTimeoutRef.current && clearTimeout(showTimeoutRef.current);
      hideTimeoutRef.current && clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const tooltipContent = (
    <AnimatePresence>
      {isVisible && !isTouchDevice && (
        <motion.div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className={`absolute z-[60] bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs px-2 py-1 rounded shadow-md max-w-[250px] pointer-events-none ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-describedby={isVisible ? tooltipId : undefined}
        className="inline-block"
      >
        {children}
      </div>
      {typeof document !== 'undefined' &&
        createPortal(tooltipContent, document.body, tooltipId)}
    </>
  );
}
