const FRAMEWORK_INSTRUCTIONS: Record<string, string> = {
  Dawn:
    'Use BEM naming (.section__element--modifier). Use var(--color-base-text-1), var(--color-base-background-1), etc. Use .page-width for container, .section-template--padding for vertical spacing.',
  T4S:
    'Use t4s- prefix for all custom classes. T4S uses dynamic product forms via product-form-dynamic.liquid. Alpine.js x-data patterns for interactivity.',
  Prestige:
    'Uses Prestige section patterns with section-padding and section-margin classes.',
  Turbo:
    'Uses Turbo-specific modular section structure.',
  Debut:
    'Legacy theme using traditional Liquid patterns without JSON templates.',
};

export function getFrameworkInstructions(frameworkName: string): string {
  if (!frameworkName || typeof frameworkName !== 'string') return '';
  const normalized = frameworkName.trim();
  if (!normalized) return '';
  const key = Object.keys(FRAMEWORK_INSTRUCTIONS).find(
    (k) => k.toLowerCase() === normalized.toLowerCase(),
  );
  return key ? FRAMEWORK_INSTRUCTIONS[key] : '';
}
