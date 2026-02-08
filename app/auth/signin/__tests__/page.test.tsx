import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- Mocks ---

const mockSearchParams = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
}));

vi.mock('@/components/features/auth/GoogleSignInButton', () => ({
  GoogleSignInButton: ({ callbackUrl }: { callbackUrl?: string }) => (
    <button data-testid="google-signin-button" data-callback-url={callbackUrl}>
      Sign in with Google
    </button>
  ),
}));

// Import after mocks
import SignInPage from '../page';

// --- Tests ---

describe('SignInPage - REQ-8 TASK-2', () => {
  beforeEach(() => {
    mockSearchParams.clear();
  });

  it('should render "Sign in to Synapse" heading', () => {
    render(<SignInPage />);
    const heading = screen.getByRole('heading', {
      name: /sign in to synapse/i,
    });
    expect(heading).toBeDefined();
  });

  it('should render GoogleSignInButton', () => {
    render(<SignInPage />);
    const button = screen.getByTestId('google-signin-button');
    expect(button).toBeDefined();
  });

  it('should pass callbackUrl to GoogleSignInButton', () => {
    mockSearchParams.set('callbackUrl', '/dashboard');
    render(<SignInPage />);
    const button = screen.getByTestId('google-signin-button');
    expect(button.getAttribute('data-callback-url')).toBe('/dashboard');
  });

  it('should default callbackUrl to / when not provided', () => {
    render(<SignInPage />);
    const button = screen.getByTestId('google-signin-button');
    expect(button.getAttribute('data-callback-url')).toBe('/');
  });

  it('should show error message when error query param is present', () => {
    mockSearchParams.set('error', 'SomeError');
    render(<SignInPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain(
      'An error occurred during sign in. Please try again.',
    );
  });

  it('should show specific message for OAuthAccountNotLinked error', () => {
    mockSearchParams.set('error', 'OAuthAccountNotLinked');
    render(<SignInPage />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'This email is already associated with another account.',
    );
  });

  it('should not show error banner when no error param', () => {
    render(<SignInPage />);
    const alert = screen.queryByRole('alert');
    expect(alert).toBeNull();
  });
});
