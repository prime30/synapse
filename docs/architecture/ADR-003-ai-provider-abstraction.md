# ADR-003: AI Provider Abstraction

## Status
Accepted

## Context
Synapse uses multiple AI providers (Anthropic Claude, OpenAI GPT) for theme generation and code assistance. Client code should not be tightly coupled to any single provider's API.

## Decision
Create a unified `AIProviderInterface` that all providers implement, with a factory function (`getAIProvider`) for provider selection.

## Rationale
- **Provider flexibility**: Easy to switch between providers based on task requirements, cost, or availability
- **Consistent API**: Client code uses the same interface regardless of provider
- **Extensibility**: New providers can be added by implementing the interface
- **Testing**: Easy to mock providers in tests using the interface

## Consequences

### Positive
- Client code is provider-agnostic
- Easy to add new providers (e.g., Google Gemini, Mistral)
- Consistent error handling across providers
- Simplified testing with mock implementations

### Negative
- Must handle provider-specific features carefully (some features may not map cleanly)
- Lowest-common-denominator risk — advanced provider features may be harder to expose
- Additional abstraction layer to maintain
- Provider-specific optimizations may require escape hatches

## Alternatives Considered
- **Provider-specific implementations**: Maximum control but duplicated client code
- **Single provider**: Simplest but creates vendor lock-in
- **Vercel AI SDK**: Good abstraction but adds a dependency and may not cover all use cases
