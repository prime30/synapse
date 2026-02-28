/**
 * Tree-sitter WASM loader for Liquid, JavaScript, CSS, and JSON parsing.
 * Uses web-tree-sitter (WASM) for Next.js/serverless compatibility.
 */

type TSParser = import('web-tree-sitter').Parser;

let liquidParser: TSParser | null = null;
let jsParser: TSParser | null = null;
let cssParser: TSParser | null = null;
let jsonParser: TSParser | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initTreeSitter(): Promise<boolean> {
  if (initialized) return true;
  if (initPromise) { await initPromise; return initialized; }

  initPromise = (async () => {
    try {
      const mod = await import('web-tree-sitter');
      const ParserClass = (mod as Record<string, unknown>).default as typeof import('web-tree-sitter').Parser | undefined;
      const LanguageClass = (mod as Record<string, unknown>).Language as typeof import('web-tree-sitter').Language | undefined;

      const TSP = ParserClass ?? (mod as unknown as typeof import('web-tree-sitter').Parser);
      const TSL = LanguageClass ?? (TSP as unknown as { Language: typeof import('web-tree-sitter').Language }).Language;

      await TSP.init({
        locateFile(scriptName: string) {
          return `/tree-sitter/${scriptName}`;
        },
      });

      const loadGrammar = async (name: string): Promise<TSParser | null> => {
        try {
          const lang = await TSL.load(`/tree-sitter/tree-sitter-${name}.wasm`);
          const p = new (TSP as unknown as new () => TSParser)();
          (p as unknown as { setLanguage(l: unknown): void }).setLanguage(lang);
          return p;
        } catch {
          console.warn(`[tree-sitter] ${name} grammar unavailable`);
          return null;
        }
      };

      liquidParser = await loadGrammar('liquid');
      jsParser = await loadGrammar('javascript');
      cssParser = await loadGrammar('css');
      jsonParser = await loadGrammar('json');

      initialized = true;
      const loaded = [
        liquidParser && 'liquid',
        jsParser && 'javascript',
        cssParser && 'css',
        jsonParser && 'json',
      ].filter(Boolean);
      console.log(`[tree-sitter] Initialized: ${loaded.join(', ')}`);
    } catch (err) {
      console.warn('[tree-sitter] Failed to initialize:', err);
      initialized = false;
    }
  })();

  await initPromise;
  return initialized;
}

export function getLiquidParser() { return liquidParser; }
export function getJSParser() { return jsParser; }
export function getCSSParser() { return cssParser; }
export function getJSONParser() { return jsonParser; }
export function isTreeSitterAvailable() { return initialized; }
export function isLiquidParserAvailable() { return liquidParser !== null; }
