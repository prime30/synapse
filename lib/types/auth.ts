import type { Profile } from './database';

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
}

export interface SignUpRequest {
  email: string;
  password: string;
  full_name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}
