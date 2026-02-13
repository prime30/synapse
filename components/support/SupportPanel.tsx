'use client';

import { useState, useEffect, useCallback } from 'react';
import { FAQAccordion } from './FAQAccordion';
import { ContactForm } from './ContactForm';
import { FAQ_CATEGORIES } from '@/lib/support/faq-data';
import { openSupportChat, isChatAvailable } from './CrispProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupportTab = 'faq' | 'contact' | 'chat';

interface SupportPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS: { id: SupportTab; label: string }[] = [
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
  { id: 'chat', label: 'Chat' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SupportPanel — slide-out panel with 3 tabs: FAQ, Contact, and Chat.
 *
 * - FAQ: Searchable accordion of common questions
 * - Contact: Ticket form that POSTs to /api/support/ticket
 * - Chat: Opens Gorgias live chat (or shows fallback if unavailable)
 */
export function SupportPanel({ isOpen, onClose }: SupportPanelProps) {
  const [activeTab, setActiveTab] = useState<SupportTab>('faq');

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // When Chat tab is selected and Gorgias is available, open it
  const handleTabChange = useCallback(
    (tab: SupportTab) => {
      setActiveTab(tab);
      if (tab === 'chat' && isChatAvailable()) {
        openSupportChat();
      }
    },
    [],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-[60] ide-overlay backdrop-blur-sm
          transition-opacity duration-200
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`
          fixed right-0 top-0 bottom-0 z-[61] w-[400px] max-w-[90vw]
          ide-surface-pop border-l ide-border shadow-2xl shadow-black/50
          flex flex-col
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Help & Support"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b ide-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-sky-500 dark:text-sky-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-sm font-semibold ide-text">Help & Support</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 ide-text-muted hover:ide-text ide-hover transition-colors"
            aria-label="Close support panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b ide-border flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex-1 px-3 py-2 text-xs font-medium transition-colors relative
                ${
                  activeTab === tab.id
                    ? 'text-sky-500 dark:text-sky-400'
                    : 'ide-text-muted hover:ide-text'
                }
              `}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0 py-3">
          {activeTab === 'faq' && (
            <FAQAccordion categories={FAQ_CATEGORIES} />
          )}

          {activeTab === 'contact' && (
            <ContactForm />
          )}

          {activeTab === 'chat' && (
            <ChatTabContent />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t ide-border flex-shrink-0">
          <p className="text-[10px] ide-text-quiet text-center">
            support@synapse.shop
          </p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat tab content
// ---------------------------------------------------------------------------

function ChatTabContent() {
  const chatAvailable = isChatAvailable();

  if (!chatAvailable) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="w-10 h-10 rounded-full ide-surface-panel border ide-border flex items-center justify-center mb-3">
          <svg className="w-5 h-5 ide-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-medium ide-text mb-1">Live chat unavailable</h3>
        <p className="text-xs ide-text-muted text-center mb-4">
          Chat is not configured yet. Use the Contact tab to send us a message, or email us directly.
        </p>
        <a
          href="mailto:support@synapse.shop"
          className="text-xs text-sky-500 dark:text-sky-400 hover:text-sky-400 transition-colors"
        >
          support@synapse.shop
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <div className="w-10 h-10 rounded-full ide-active border border-sky-500/20 flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-sky-500 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-medium ide-text mb-1">Live chat</h3>
      <p className="text-xs ide-text-muted text-center mb-4">
        The Gorgias chat window should have opened. If it didn&apos;t, click below.
      </p>
      <button
        type="button"
        onClick={openSupportChat}
        className="px-4 py-2 text-xs font-medium rounded bg-sky-500 hover:bg-sky-600 text-white transition-colors"
      >
        Open chat
      </button>
    </div>
  );
}
