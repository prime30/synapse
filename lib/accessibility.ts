/**
 * Phase 7: Shared accessibility utilities.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function safeTransition(duration: number = 0.2): Record<string, unknown> {
  if (prefersReducedMotion()) {
    return { duration: 0, ease: 'linear' };
  }
  return { duration: duration, ease: 'easeOut' };
}

export function trapFocus(container: HTMLElement): () => void {
  var sel = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    var focusable = Array.from(container.querySelectorAll(sel)) as HTMLElement[];
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  container.addEventListener('keydown', handleKeyDown);
  var firstFocusable = container.querySelector(sel) as HTMLElement | null;
  if (firstFocusable) firstFocusable.focus();

  return function() { container.removeEventListener('keydown', handleKeyDown); };
}

export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return;
  var id = 'synapse-aria-live-' + priority;
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', priority);
    el.setAttribute('aria-atomic', 'true');
    el.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    document.body.appendChild(el);
  }
  el.textContent = '';
  requestAnimationFrame(function() { if (el) el.textContent = message; });
}
