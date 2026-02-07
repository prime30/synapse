# ADR-002: File Storage Strategy

## Status
Accepted

## Context
Synapse manages Shopify theme files (Liquid, JavaScript, CSS, assets) of varying sizes. We need efficient storage that balances query performance for small files with cost-effective storage for large files.

## Decision
Store files smaller than 100KB in the database `content` column. Store files 100KB or larger in Supabase Storage with a path reference in the `storage_path` column.

## Rationale
- **Small files (<100KB)**: Most Liquid templates and CSS files are small. Storing in the database enables fast queries, atomic transactions, and simpler backup/restore
- **Large files (≥100KB)**: Larger assets benefit from object storage with CDN delivery, avoiding database bloat
- **100KB threshold**: Chosen based on typical Shopify theme file sizes — most Liquid files are under 50KB, while images and bundled JS can exceed this

## Consequences

### Positive
- Fast reads for frequently accessed small files
- Cost-effective storage for large assets
- Database stays performant without large blob storage
- CDN delivery for large files improves load times

### Negative
- Dual storage paths increase implementation complexity
- Must handle cleanup of Supabase Storage on file deletion
- Size checking logic required on every file operation
- Potential edge cases around the 100KB boundary

## Alternatives Considered
- **All in database**: Simple but causes database bloat with large files
- **All in Supabase Storage**: Consistent but slower for small file reads
- **CDN-only**: Fast delivery but complex cache invalidation
- **Git-based storage**: Version control benefits but poor query performance
