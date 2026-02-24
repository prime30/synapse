'use client';

import { useEffect, useState, useRef } from 'react';

const CHAR_DELAY_MS = 30;
const AGENT_COLORS = ['text-green-400', 'text-blue-400', 'text-purple-400'] as const;
const AGENT_GLOW = ['shadow-[0_0_8px_oklch(0.723_0.191_149_/_0.6)]', 'shadow-[0_0_8px_oklch(0.623_0.214_259_/_0.6)]', 'shadow-[0_0_8px_oklch(0.586_0.262_293_/_0.6)]'] as const;

type AgentIndex = 0 | 1 | 2;

interface Segment {
  text: string;
  agent: AgentIndex;
}

const TYPING_CONTENT: Segment[] = [
  { text: '{% section ', agent: 0 },
  { text: "'hero-banner'", agent: 1 },
  { text: ' %}', agent: 0 },
  { text: '\n  <section class="', agent: 0 },
  { text: 'hero', agent: 1 },
  { text: '">', agent: 0 },
  { text: '\n    <h1>{{ section.settings.heading }}</h1>', agent: 0 },
  { text: '\n    <div class="hero__cta">', agent: 2 },
  { text: '\n      <a href="#">{{ cta_text }}</a>', agent: 2 },
  { text: '\n    </div>\n  </section>', agent: 0 },
];

interface TypewriterCodeProps {
  onComplete?: () => void;
  className?: string;
}

export function TypewriterCode({ onComplete, className = '' }: TypewriterCodeProps) {
  const [displaySegments, setDisplaySegments] = useState<{ text: string; agent: AgentIndex }[]>([]);
  const [activeAgent, setActiveAgent] = useState<AgentIndex | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let timerId: number | undefined;
    let segmentIndex = 0;
    let charIndex = 0;

    function runTyping() {
      const segment = TYPING_CONTENT[segmentIndex];
      if (!segment) {
        setIsComplete(true);
        onCompleteRef.current?.();
        return;
      }
      const nextChar = segment.text[charIndex];
      if (nextChar === undefined) {
        segmentIndex += 1;
        charIndex = 0;
        setActiveAgent(null);
        timerId = requestAnimationFrame(runTyping);
        return;
      }
      setActiveAgent(segment.agent);
      setDisplaySegments((prev) => {
        const next = [...prev];
        if (next.length === 0 || next[next.length - 1].agent !== segment.agent) {
          next.push({ text: nextChar, agent: segment.agent });
        } else {
          next[next.length - 1] = { ...next[next.length - 1], text: next[next.length - 1].text + nextChar };
        }
        return next;
      });
      charIndex += 1;
      timerId = window.setTimeout(() => {
        timerId = requestAnimationFrame(runTyping);
      }, CHAR_DELAY_MS) as unknown as number;
    }

    runTyping();

    return () => {
      if (timerId !== undefined) {
        clearTimeout(timerId);
        cancelAnimationFrame(timerId);
      }
    };
  }, []);

  return (
    <div className={`h-full flex flex-col p-4 font-mono text-sm ${className}`}>
      <div className="flex items-center gap-2 mb-3 text-white/30 text-xs">
        <span className="px-2 py-0.5 bg-white/5 rounded text-stone-500/60">hero-section.liquid</span>
        <span className="ml-auto px-2 py-0.5 bg-accent/10 rounded text-accent text-[10px]">AI Writing...</span>
      </div>
      <div className="flex-1 text-[13px] leading-6 flex flex-col">
        <div className="flex flex-wrap">
          {displaySegments.map((seg, i) => (
            <span key={i} className={AGENT_COLORS[seg.agent]}>
              {seg.text}
            </span>
          ))}
          {!isComplete && <span className="inline-block w-[2px] h-[18px] bg-accent animate-pulse ml-0.5 align-middle" />}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        {(['Code', 'Design', 'QA'] as const).map((name, i) => (
          <div key={name} className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${['bg-green-500', 'bg-blue-400', 'bg-purple-400'][i]} transition-shadow duration-200 ${
                activeAgent === i ? AGENT_GLOW[i] : ''
              }`}
              style={{ animationDelay: `${i * 500}ms` }}
            />
            <span className="text-[10px] text-white/60">{name} Agent</span>
          </div>
        ))}
      </div>
    </div>
  );
}


