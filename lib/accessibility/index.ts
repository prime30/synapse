/**
 * Accessibility utilities for focus management and animations
 */

/**
 * Returns a safe transition configuration for framer-motion that respects
 * user preferences for reduced motion.
 */
export function safeTransition(duration: number): { duration: number } {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    duration: prefersReducedMotion ? 0 : duration,
  };
}

/**
 * Traps focus within a container element. Returns a cleanup function.
 * 
 * @param container - The element to trap focus within
 * @returns Cleanup function to remove focus trap
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  function getFocusableElements(): HTMLElement[] {
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelectors)
    );
    return elements.filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift + Tab: moving backwards
      if (document.activeElement === firstElement || !container.contains(document.activeElement)) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: moving forwards
      if (document.activeElement === lastElement || !container.contains(document.activeElement)) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Focus the first focusable element
  const focusableElements = getFocusableElements();
  if (focusableElements.length > 0) {
    const firstElement = focusableElements[0];
    // Use setTimeout to ensure the element is fully rendered
    setTimeout(() => {
      firstElement.focus();
    }, 0);
  }

  container.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return function cleanup() {
    container.removeEventListener('keydown', handleKeyDown);
  };
}
