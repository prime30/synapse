# ADR-001: Database Schema Design

## Status
Accepted

## Context
Synapse needs a database to store users, organizations, projects, Shopify theme files, AI sessions, and messages. We need a solution that provides authentication integration, real-time capabilities, and Row Level Security for multi-tenant data isolation.

## Decision
Use Supabase Postgres with Row Level Security (RLS) as the primary database.

## Rationale
- **Auth integration**: Supabase Auth integrates natively with Postgres, linking `auth.users` to application tables
- **RLS**: Row Level Security enforces data access at the database level, preventing unauthorized access even if application code has bugs
- **Real-time**: Supabase provides real-time subscriptions for live updates
- **Managed infrastructure**: Automatic backups, scaling, and maintenance
- **TypeScript support**: Generated types from schema ensure type safety

## Consequences

### Positive
- Data access rules enforced at database level
- Built-in auth user management
- Real-time capabilities without additional infrastructure
- Managed backups and scaling

### Negative
- Must follow Supabase patterns and conventions
- RLS policies required for all tables (additional complexity)
- Vendor lock-in to Supabase ecosystem
- Limited control over database internals

## Alternatives Considered
- **Self-hosted Postgres**: More control but requires DevOps overhead
- **MongoDB**: Flexible schema but lacks RLS and auth integration
- **Firebase**: Good real-time but weaker SQL capabilities
- **PlanetScale**: Good MySQL option but no built-in auth integration
