'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type AuthModalView = 'login' | 'signup' | null;

interface AuthModalContextValue {
  authModal: AuthModalView;
  openAuthModal: (view: 'login' | 'signup') => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  authModal: null,
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [authModal, setAuthModal] = useState<AuthModalView>(null);
  const openAuthModal = useCallback((view: 'login' | 'signup') => setAuthModal(view), []);
  const closeAuthModal = useCallback(() => setAuthModal(null), []);

  return (
    <AuthModalContext.Provider value={{ authModal, openAuthModal, closeAuthModal }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  return useContext(AuthModalContext);
}
