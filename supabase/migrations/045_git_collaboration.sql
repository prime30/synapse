-- Migration: Git collaboration infrastructure
-- Creates storage bucket, GitHub tokens table, and Git repo state table

-- 1. Storage bucket for persisting .git directory data
INSERT INTO storage.buckets (id, name, public)
VALUES ('git-state', 'git-state', false)
ON CONFLICT (id) DO NOTHING;

-- 2. GitHub OAuth tokens (encrypted, per user per project)
CREATE TABLE IF NOT EXISTS public.github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ,
  github_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE public.github_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own GitHub tokens"
  ON public.github_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Git repository state per project
CREATE TABLE IF NOT EXISTS public.git_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE UNIQUE,
  current_branch TEXT NOT NULL DEFAULT 'main',
  remote_url TEXT,
  last_commit_sha TEXT,
  last_commit_message TEXT,
  last_commit_at TIMESTAMPTZ,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.git_repos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can access git repos"
  ON public.git_repos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = git_repos.project_id
    )
  );

-- 4. Storage policies for git-state bucket
CREATE POLICY "Authenticated users can access git state"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'git-state' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'git-state' AND auth.role() = 'authenticated');

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_github_tokens_user_project ON public.github_tokens(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_git_repos_project ON public.git_repos(project_id);
