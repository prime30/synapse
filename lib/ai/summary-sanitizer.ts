export function sanitizeSummary(content: string): string {
  let result = content;

  // Remove fenced code blocks (```...```)
  result = result.replace(/```[\s\S]*?```/g, '[code block removed]');

  // Remove inline code with file paths
  result = result.replace(
    /`[^`]*\.(liquid|js|css|json|html)[^`]*`/g,
    '[file reference]'
  );

  // Anonymize file paths
  result = result.replace(
    /(?:snippets|sections|templates|layout|assets|config|locales)\/[^\s)}\]'"]+/g,
    '[file]'
  );

  // Remove potential API keys / tokens
  result = result.replace(
    /(?:sk|pk|api|key|token|secret)[-_]?[a-zA-Z0-9]{20,}/gi,
    '[redacted]'
  );

  // Remove Shopify store URLs
  result = result.replace(
    /https?:\/\/[^\s]*\.myshopify\.com[^\s]*/g,
    '[store URL]'
  );

  return result.trim();
}
