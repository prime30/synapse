import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
import { logger } from '../logger.js';

/**
 * Register media generation MCP tools:
 *  - synapse_generate_image  (Nano Banana Pro / Gemini 3 Pro Image)
 *  - synapse_generate_video  (Veo 3.1)
 *
 * These tools call the Synapse API routes which in turn call
 * the Google GenAI SDK. This keeps API keys server-side.
 */
export function registerMediaTools(
  registry: ToolRegistry,
  apiClient: APIClient,
  authManager: AuthManager
): void {
  // â”€â”€ Image Generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  registry.register({
    definition: {
      name: 'synapse_generate_image',
      description:
        'Generate images using Nano Banana Pro (Gemini 3 Pro Image). ' +
        'Creates production-ready images for Shopify themes: hero banners, ' +
        'product imagery, section backgrounds, promotional graphics. ' +
        'Supports up to 4K resolution, accurate text rendering in multiple languages, ' +
        'and reference image guidance for brand consistency.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed description of the image to generate. Be specific about style, ' +
              'colors, composition, lighting, and mood. Example: "A minimalist hero banner ' +
              'for a luxury skincare brand, soft pink gradient background, gold accents, ' +
              'centered product bottle with dramatic studio lighting"',
          },
          numberOfImages: {
            type: 'number',
            description: 'Number of image variants to generate (1-4). Defaults to 1.',
          },
          aspectRatio: {
            type: 'string',
            description: 'Image aspect ratio. Options: 1:1, 16:9, 9:16, 4:3, 3:4. Defaults to 16:9.',
          },
          negativePrompt: {
            type: 'string',
            description: 'What to avoid in the generated image. Example: "blurry, low quality, text, watermark"',
          },
        },
        required: ['prompt'],
      },
    },

    async handler(args) {
      if (!authManager.isAuthenticated()) {
        throw new Error('AUTH_REQUIRED');
      }

      const prompt = args.prompt as string;
      logger.info('Generating image with Nano Banana Pro', { promptLength: prompt.length });

      try {
        const result = await apiClient.request<{
          data: {
            images: Array<{ data: string; mimeType: string }>;
            model: string;
            prompt: string;
          };
        }>('POST', '/api/media/generate-image', {
          prompt,
          numberOfImages: args.numberOfImages ?? 1,
          aspectRatio: args.aspectRatio ?? '16:9',
          negativePrompt: args.negativePrompt,
        });

        const imageCount = result.data.images.length;
        const summaryLines = [
          'Generated ' + imageCount + ' image(s) using ' + result.data.model,
          'Prompt: ' + result.data.prompt,
          '',
          'Images are base64-encoded. To use in a Shopify theme:',
          '1. Upload to Shopify Files API or CDN',
          '2. Reference in Liquid templates via {{ image_url }}',
        ];

        // Include first 200 chars of base64 as preview indicator
        for (let i = 0; i < result.data.images.length; i++) {
          const img = result.data.images[i];
          summaryLines.push('');
          summaryLines.push('Image ' + (i + 1) + ': ' + img.mimeType + ' (' + Math.round(img.data.length * 0.75 / 1024) + ' KB)');
        }

        return {
          content: [{ type: 'text', text: summaryLines.join('\n') }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Image generation failed', { error: msg });
        return {
          content: [{ type: 'text', text: 'Image generation failed: ' + msg }],
          isError: true,
        };
      }
    },
  });

  // â”€â”€ Video Generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  registry.register({
    definition: {
      name: 'synapse_generate_video',
      description:
        'Generate short videos using Veo 3.1. Creates 4-8 second video clips ' +
        'for Shopify themes: hero background loops, product showcases, ' +
        'animated section backgrounds. Supports 720p/1080p, 16:9 and 9:16 ' +
        'aspect ratios, with native audio generation. ' +
        'NOTE: Video generation takes 1-5 minutes to complete.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed description of the video to generate. Include motion, ' +
              'camera movement, lighting, and mood. Example: "Slow-motion pour of ' +
              'golden honey onto a stack of pancakes, warm morning light, shallow ' +
              'depth of field, steam rising"',
          },
          durationSeconds: {
            type: 'number',
            description: 'Video duration: 4, 6, or 8 seconds. Defaults to 6.',
          },
          aspectRatio: {
            type: 'string',
            description: 'Video aspect ratio: 16:9 (landscape) or 9:16 (vertical/portrait). Defaults to 16:9.',
          },
        },
        required: ['prompt'],
      },
    },

    async handler(args) {
      if (!authManager.isAuthenticated()) {
        throw new Error('AUTH_REQUIRED');
      }

      const prompt = args.prompt as string;
      logger.info('Generating video with Veo 3.1', { promptLength: prompt.length });

      try {
        const result = await apiClient.request<{
          data: {
            video: { data: string; mimeType: string };
            model: string;
            prompt: string;
          };
        }>('POST', '/api/media/generate-video', {
          prompt,
          durationSeconds: args.durationSeconds ?? 6,
          aspectRatio: args.aspectRatio ?? '16:9',
        });

        const sizeKB = Math.round(result.data.video.data.length * 0.75 / 1024);

        return {
          content: [{
            type: 'text',
            text: [
              'Generated video using ' + result.data.model,
              'Prompt: ' + result.data.prompt,
              'Format: ' + result.data.video.mimeType + ' (' + sizeKB + ' KB)',
              '',
              'To use in a Shopify theme:',
              '1. Upload to Shopify Files API or CDN',
              '2. Use in video section settings or as background-video source',
            ].join('\n'),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Video generation failed', { error: msg });
        return {
          content: [{ type: 'text', text: 'Video generation failed: ' + msg }],
          isError: true,
        };
      }
    },
  });
}