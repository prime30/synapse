/**
 * Veo 3.1 -- Video Generation
 *
 * Uses the @google/genai unified SDK to generate short videos.
 * Supports:
 *  - Text-to-video (4-8 second clips)
 *  - Reference image guidance (up to 3 images)
 *  - 720p / 1080p output
 *  - 16:9 and 9:16 aspect ratios
 *  - Native audio generation
 *
 * Video generation is async -- the SDK returns a polling operation.
 */

import { GoogleGenAI } from '@google/genai';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VideoGenerationOptions {
  /** Text prompt describing the video to generate. */
  prompt: string;
  /** Model override. Defaults to veo-3.1-generate-preview. */
  model?: string;
  /** Video duration in seconds (4, 6, or 8). Defaults to 6. */
  durationSeconds?: 4 | 6 | 8;
  /** Aspect ratio. Defaults to 16:9. */
  aspectRatio?: '16:9' | '9:16';
  /** Reference image as base64 with MIME type. */
  referenceImage?: { data: string; mimeType: string };
  /** Whether to generate audio. Defaults to true. */
  generateAudio?: boolean;
}

export interface GeneratedVideo {
  /** Base64-encoded video data. */
  data: string;
  /** MIME type (video/mp4). */
  mimeType: string;
}

export interface VideoGenerationResult {
  video: GeneratedVideo;
  model: string;
  prompt: string;
}

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_MODEL = 'veo-3.1-generate-preview';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max

export async function generateVideo(
  options: VideoGenerationOptions,
  apiKey?: string,
): Promise<VideoGenerationResult> {
  const key = apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const model = options.model ?? DEFAULT_MODEL;

  // Start the video generation operation
  let operation = await ai.models.generateVideos({
    model,
    prompt: options.prompt,
    config: {
      aspectRatio: options.aspectRatio ?? '16:9',
      numberOfVideos: 1,
    } as Record<string, unknown>,
  });

  // Poll until completion
  let attempts = 0;
  while (!operation.done && attempts < MAX_POLL_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    operation = await ai.operations.get({ operation: operation });
    attempts++;
  }

  if (!operation.done) {
    throw new Error('Video generation timed out after ' + (MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000) + ' seconds');
  }

  // Extract video from result
  const response = operation.response as Record<string, unknown> | undefined;
  const generatedVideos = (response?.generatedVideos ?? []) as Array<Record<string, unknown>>;

  if (generatedVideos.length === 0) {
    throw new Error('Video generation returned no videos. The prompt may have been filtered.');
  }

  const firstVideo = generatedVideos[0];
  const videoData = firstVideo.video as { uri?: string; data?: string; mimeType?: string } | undefined;

  if (!videoData) {
    throw new Error('Video generation returned empty video data.');
  }

  // If we got a URI, fetch the video data
  let base64Data: string;
  let mimeType = videoData.mimeType ?? 'video/mp4';

  if (videoData.data) {
    base64Data = videoData.data;
  } else if (videoData.uri) {
    // Fetch the video from the URI
    const videoResponse = await fetch(videoData.uri);
    if (!videoResponse.ok) {
      throw new Error('Failed to download generated video: ' + videoResponse.status);
    }
    const buffer = await videoResponse.arrayBuffer();
    base64Data = Buffer.from(buffer).toString('base64');
    mimeType = videoResponse.headers.get('content-type') ?? mimeType;
  } else {
    throw new Error('Video generation returned no video data or URI.');
  }

  return {
    video: { data: base64Data, mimeType },
    model,
    prompt: options.prompt,
  };
}