/**
 * Tree-sitter WASM loader for Liquid, JavaScript, and CSS parsing.
 * Uses web-tree-sitter (WASM) for Next.js/serverless compatibility.
 *
 * Liquid grammar is not available as pre-built WASM, so we fall back
 * to the custom Liquid AST parser for Liquid files. JS and CSS use
 * real tree-sitter grammars.
 */

let Parser: typeof import('web-tree-sitter') | null = null;
let jsParser: InstanceType<typeof import('web-tree-sitter')> | null = null;
let cssParser: InstanceType<typeof import('web-tree-sitter')> | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initTreeSitter(): Promise<boolean> {
  if (initialized) return true;
  if (initPromise) { await initPromise; return initialized; }

  initPromise = (async () => {
    try {
      const TSParser = (await import('web-tree-sitter')).default;
      await TSParser.init({
        locateFile(scriptName: string) {
          return `/tree-sitter/${scriptName}`;
        },
      });
      Parser = TSParser as unknown as typeof import('web-tree-sitter');

      try {
        const jsLang = await TSParser.Language.load('/tree-sitter/tree-sitter-javascript.wasm');
        jsParser = new TSParser();
        jsParser.setLanguage(jsLang);
      } catch { /* JS grammar unavailable */ }

      try {
        const cssLang = await TSParser.Language.load('/tree-sitter/tree-sitter-css.wasm');
        cssParser = new TSParser();
        cssParser.setLanguage(cssLang);
      } catch { /* CSS grammar unavailable */ }

      initialized = true;
    } catch (err) {
      console.warn('[tree-sitter] Failed to initialize:', err);
      initialized = false;
    }
  })();

  await initPromise;
  return initialized;
}

export function getJSParser() { return jsParser; }
export function getCSSParser() { return cssParser; }
export function isTreeSitterAvailable() { return initialized; }
