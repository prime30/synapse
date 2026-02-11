'use client';

import { Preloader } from './preloader';
import { CustomCursor } from './cursor';
import { PreloaderProvider } from './PreloaderContext';
import { AuthModalProvider } from './AuthModalContext';
import { CursorRevealCode } from './textures/CursorRevealCode';
import { BreakpointIndicator } from './dev/BreakpointIndicator';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <PreloaderProvider>
      <AuthModalProvider>
        <Preloader />
        <CustomCursor />
        <div className="relative">
          <CursorRevealCode />
          {children}
        </div>
        <BreakpointIndicator />
      </AuthModalProvider>
    </PreloaderProvider>
  );
}
