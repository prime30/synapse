'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageLightboxProps {
  images: Array<{ src: string; alt?: string }>;
  initialIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [copied, setCopied] = useState(false);
  const current = images[currentIndex];
  const hasMultiple = images.length > 1;

  const goNext = useCallback(() => {
    setCurrentIndex(i => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasMultiple) goNext();
      if (e.key === 'ArrowLeft' && hasMultiple) goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev, hasMultiple]);

  const handleCopy = useCallback(async () => {
    if (!current) return;
    try {
      const response = await fetch(current.src);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = current.src;
        });
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob(b => resolve(b!), 'image/png')
        );
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard API not available */
      }
    }
  }, [current]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-sm"
          title="Copy image to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm z-10"
            onClick={e => { e.stopPropagation(); goPrev(); }}
            title="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm z-10"
            onClick={e => { e.stopPropagation(); goNext(); }}
            title="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Image */}
      <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={current.alt ?? 'Image preview'}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
      </div>

      {/* Counter */}
      {hasMultiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
