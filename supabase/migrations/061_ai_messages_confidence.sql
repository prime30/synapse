-- V2-4: Feedback-Driven Confidence Calibration
-- Add confidence column to ai_messages for calibration correlation with feedback_rating.
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1);
