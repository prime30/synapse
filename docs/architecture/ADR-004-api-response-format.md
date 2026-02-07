# ADR-004: API Response Format

## Status
Accepted

## Context
Synapse has multiple API routes serving different features. Consistent response formatting ensures predictable client-side handling and clear error identification.

## Decision
All API endpoints return:
- **Success**: `{ data: T }` with appropriate HTTP status code
- **Error**: `{ error: string, code: string }` with appropriate HTTP status code

## Rationale
- **Predictable**: Client code always knows the response shape
- **Type-safe**: TypeScript generics work well with `{ data: T }` pattern
- **Error identification**: `code` field enables programmatic error handling beyond HTTP status codes
- **Simplicity**: Minimal wrapper with no unnecessary metadata

## Consequences

### Positive
- Consistent client-side response handling
- Easy to build typed API clients
- Clear error messages for debugging
- Machine-readable error codes for programmatic handling

### Negative
- All routes must follow this pattern strictly
- Pagination and metadata require extension of the format
- Streaming responses need a different pattern
- Slight overhead wrapping every response

## Alternatives Considered
- **Varying formats per endpoint**: Flexible but unpredictable for clients
- **HTTP status codes only**: Standard but insufficient for complex error states
- **JSON:API specification**: Comprehensive but overly complex for our needs
- **GraphQL**: Powerful query language but adds significant infrastructure complexity
