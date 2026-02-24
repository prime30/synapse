'use client';

import { useEffect, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface SectionHighlighterProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  hoveredSectionId: string | null;
  selectedSectionId: string | null;
}

// ── PostMessage helpers ──────────────────────────────────────────────

type BridgeMessage =
  | { type: 'synapse:highlight-section'; sectionId: string; color: string }
  | { type: 'synapse:select-section'; sectionId: string; color: string }
  | { type: 'synapse:clear-highlight' };

function postToIframe(
  iframe: HTMLIFrameElement | null,
  message: BridgeMessage
) {
  if (!iframe?.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(message, '*');
  } catch {
    // iframe may be cross-origin or not yet loaded — silently ignore
  }
}

// ── Component ────────────────────────────────────────────────────────

export function SectionHighlighter({
  iframeRef,
  hoveredSectionId,
  selectedSectionId,
}: SectionHighlighterProps) {
  const prevHoveredRef = useRef<string | null>(null);
  const prevSelectedRef = useRef<string | null>(null);

  // ── Handle hover changes ─────────────────────────────────────────

  useEffect(() => {
    const iframe = iframeRef.current;
    const prevHovered = prevHoveredRef.current;

    // Clear previous hover highlight if section changed
    if (prevHovered && prevHovered !== hoveredSectionId) {
      postToIframe(iframe, { type: 'synapse:clear-highlight' });
    }

    // Apply new hover highlight
    if (hoveredSectionId) {
      postToIframe(iframe, {
        type: 'synapse:highlight-section',
        sectionId: hoveredSectionId,
        color: 'oklch(0.623 0.214 259 / 0.15)',
      });
    }

    prevHoveredRef.current = hoveredSectionId;
  }, [iframeRef, hoveredSectionId]);

  // ── Handle selection changes ─────────────────────────────────────

  useEffect(() => {
    const iframe = iframeRef.current;
    const prevSelected = prevSelectedRef.current;

    // Clear previous selection highlight if section changed
    if (prevSelected && prevSelected !== selectedSectionId) {
      postToIframe(iframe, { type: 'synapse:clear-highlight' });
    }

    // Apply new selection highlight
    if (selectedSectionId) {
      postToIframe(iframe, {
        type: 'synapse:select-section',
        sectionId: selectedSectionId,
        color: 'oklch(0.623 0.214 259 / 0.25)',
      });
    }

    prevSelectedRef.current = selectedSectionId;
  }, [iframeRef, selectedSectionId]);

  // This component communicates via postMessage only — no DOM output
  return null;
}
