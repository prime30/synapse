import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');

export const uuidSchema = z.string().uuid('Invalid ID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  organization_id: uuidSchema,
  shopify_store_url: z.string().url().optional(),
});

export const createFileSchema = z.object({
  project_id: uuidSchema,
  name: z.string().min(1, 'File name is required'),
  path: z.string().min(1, 'File path is required'),
  file_type: z.enum(['liquid', 'javascript', 'css', 'other']),
  content: z.string(),
});

export const previewStateSchema = z.object({
  project_id: uuidSchema,
  device_width: z.coerce.number().int().min(320).max(2560),
  page_type: z.enum([
    'home',
    'product',
    'collection',
    'cart',
    'blog',
    'page',
    'not_found',
  ]),
  resource_id: z.string().optional().nullable(),
});

export const presenceUpdateSchema = z.object({
  project_id: uuidSchema,
  file_path: z.string().optional().nullable(),
  cursor_position: z.record(z.string(), z.unknown()).optional().nullable(),
  state: z.enum(['active', 'idle', 'offline']).optional(),
});
