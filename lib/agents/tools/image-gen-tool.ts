/**
 * Placeholder for image generation capability.
 */

export interface ImageGenInput {
  prompt: string;
  targetPath: string;
  width?: number;
  height?: number;
}

export async function executeImageGen(
  input: ImageGenInput,
): Promise<{ success: boolean; path: string; message: string }> {
  // Image generation requires an API key (DALL-E, Flux, etc.)
  // For now, return guidance
  return {
    success: false,
    path: input.targetPath,
    message: `Image generation is not yet configured. To generate "${input.prompt}", configure an image generation API key in settings. For now, use a placeholder image or download one with the web search tool.`,
  };
}
