import { describe, it, expect } from 'vitest';
import type { Profile, Organization, Project, FileRecord, AISession, AIMessageRecord } from '@/lib/types/database';

describe('Database Types', () => {
  it('should define Profile type with required fields', () => {
    const profile: Profile = {
      id: 'uuid',
      email: 'test@test.com',
      full_name: 'Test User',
      avatar_url: null,
      is_admin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(profile.id).toBeDefined();
    expect(profile.email).toBe('test@test.com');
  });

  it('should define Organization type with required fields', () => {
    const org: Organization = {
      id: 'uuid',
      name: 'Test Org',
      slug: 'test-org',
      owner_id: 'user-uuid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(org.slug).toBe('test-org');
  });

  it('should define Project type with required fields', () => {
    const project: Project = {
      id: 'uuid',
      name: 'Test Project',
      description: null,
      organization_id: 'org-uuid',
      owner_id: 'user-uuid',
      shopify_store_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(project.name).toBe('Test Project');
  });

  it('should define FileRecord with storage strategy fields', () => {
    const file: FileRecord = {
      id: 'uuid',
      project_id: 'project-uuid',
      name: 'template.liquid',
      path: 'templates/template.liquid',
      file_type: 'liquid',
      size_bytes: 1024,
      content: '<h1>Hello</h1>',
      storage_path: null,
      created_by: 'user-uuid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(file.file_type).toBe('liquid');
    expect(file.content).toBeDefined();
    expect(file.storage_path).toBeNull();
  });

  it('should define AISession with provider enum', () => {
    const session: AISession = {
      id: 'uuid',
      project_id: 'project-uuid',
      user_id: 'user-uuid',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      title: null,
      total_input_tokens: 100,
      total_output_tokens: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(session.provider).toBe('anthropic');
  });

  it('should define AIMessageRecord with role enum', () => {
    const msg: AIMessageRecord = {
      id: 'uuid',
      session_id: 'session-uuid',
      role: 'assistant',
      content: 'Hello!',
      input_tokens: null,
      output_tokens: 50,
      created_at: new Date().toISOString(),
    };
    expect(msg.role).toBe('assistant');
  });
});
