-- KM-10: Community Skill Marketplace
CREATE TABLE IF NOT EXISTS public.published_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  version TEXT NOT NULL DEFAULT '1.0.0',
  category TEXT NOT NULL CHECK (category IN ('theme-type', 'task-type', 'component', 'workflow', 'debugging', 'performance', 'accessibility', 'cx-optimization', 'migration', 'internationalization')),
  theme_compatibility TEXT[] DEFAULT '{}',
  downloads INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_published_skills_category ON public.published_skills(category);
CREATE INDEX IF NOT EXISTS idx_published_skills_name ON public.published_skills(name);
CREATE INDEX IF NOT EXISTS idx_published_skills_downloads ON public.published_skills(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_published_skills_author ON public.published_skills(author_id);

CREATE TABLE IF NOT EXISTS public.installed_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.published_skills(id) ON DELETE CASCADE,
  installed_version TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_installed_skills_project ON public.installed_skills(project_id);

CREATE TABLE IF NOT EXISTS public.skill_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.published_skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(skill_id, user_id)
);

CREATE TRIGGER published_skills_updated_at
  BEFORE UPDATE ON public.published_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: published_skills — public read, author write
ALTER TABLE public.published_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published skills"
  ON public.published_skills FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can publish skills"
  ON public.published_skills FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own skills"
  ON public.published_skills FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own skills"
  ON public.published_skills FOR DELETE
  USING (auth.uid() = author_id);

-- RLS: installed_skills — project members only
ALTER TABLE public.installed_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view installed skills"
  ON public.installed_skills FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can install skills"
  ON public.installed_skills FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can uninstall skills"
  ON public.installed_skills FOR DELETE
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS: skill_ratings — public read, authenticated write
ALTER TABLE public.skill_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view skill ratings"
  ON public.skill_ratings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can rate skills"
  ON public.skill_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings"
  ON public.skill_ratings FOR UPDATE
  USING (auth.uid() = user_id);
