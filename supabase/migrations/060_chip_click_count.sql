-- V2-1: Chip Learning – track click counts on CX pattern chips
ALTER TABLE public.cx_pattern_dismissed
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;

-- RPC for atomic upsert and increment (used by chips/click API)
CREATE OR REPLACE FUNCTION public.increment_chip_click(p_project_id uuid, p_pattern_id text)
RETURNS TABLE (click_count integer)
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.cx_pattern_dismissed (project_id, pattern_id, click_count)
  VALUES (p_project_id, p_pattern_id, 1)
  ON CONFLICT (project_id, pattern_id) DO UPDATE SET click_count = cx_pattern_dismissed.click_count + 1
  RETURNING cx_pattern_dismissed.click_count;
$$;
