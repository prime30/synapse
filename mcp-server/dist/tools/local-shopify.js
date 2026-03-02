import { readThemeFiles, readThemeFile } from '../local/file-reader.js';
import { ShopifyAPIClient } from '../local/shopify-api.js';
import { loadCredentials } from '../local/credential-reader.js';
import { logger } from '../logger.js';
function ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function err(message) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}
function getShopifyClient(config) {
    if (!config.store)
        throw new Error('No store configured. Set store in .synapse-theme/config.json or SHOPIFY_STORE env var.');
    const envToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (envToken)
        return new ShopifyAPIClient(config.store, envToken);
    const creds = loadCredentials(config.store);
    if (!creds)
        throw new Error(`No credentials found for store "${config.store}". Run synapse-theme auth first, or set SHOPIFY_ACCESS_TOKEN env var.`);
    return new ShopifyAPIClient(config.store, creds.accessToken);
}
function checkThemeFiles(workspacePath, filterFiles) {
    const files = filterFiles
        ? filterFiles.map((f) => readThemeFile(workspacePath, f)).filter(Boolean)
        : readThemeFiles(workspacePath);
    const issues = [];
    for (const file of files) {
        if (file.path.endsWith('.liquid')) {
            checkLiquid(file, issues);
        }
        else if (file.path.endsWith('.json')) {
            checkJSON(file, issues);
        }
    }
    return issues;
}
function checkLiquid(file, issues) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        // Unclosed Liquid tags
        const openTags = (line.match(/{%/g) ?? []).length;
        const closeTags = (line.match(/%}/g) ?? []).length;
        if (openTags !== closeTags) {
            issues.push({ file: file.path, line: lineNum, severity: 'error', message: 'Unclosed Liquid tag delimiter' });
        }
        // Unclosed output tags
        const openOutput = (line.match(/{{/g) ?? []).length;
        const closeOutput = (line.match(/}}/g) ?? []).length;
        if (openOutput !== closeOutput) {
            issues.push({ file: file.path, line: lineNum, severity: 'error', message: 'Unclosed Liquid output delimiter' });
        }
        // Deprecated filters
        if (/\|\s*img_tag\b/.test(line)) {
            issues.push({ file: file.path, line: lineNum, severity: 'warning', message: 'Deprecated filter: img_tag. Use image_tag instead.' });
        }
        if (/\|\s*img_url\b/.test(line)) {
            issues.push({ file: file.path, line: lineNum, severity: 'warning', message: 'Deprecated filter: img_url. Use image_url instead.' });
        }
        // Missing alt text on image_tag
        if (/\|\s*image_tag\b/.test(line) && !/alt:/.test(line)) {
            issues.push({ file: file.path, line: lineNum, severity: 'warning', message: 'image_tag missing alt attribute for accessibility' });
        }
    }
    // Check for mismatched block-level tags
    const blockTags = ['if', 'unless', 'for', 'case', 'capture', 'form', 'paginate', 'tablerow', 'comment', 'raw', 'style', 'javascript'];
    for (const tag of blockTags) {
        const openRegex = new RegExp(`{%[-\\s]*\\b${tag}\\b`, 'g');
        const closeRegex = new RegExp(`{%[-\\s]*\\bend${tag}\\b`, 'g');
        const opens = (file.content.match(openRegex) ?? []).length;
        const closes = (file.content.match(closeRegex) ?? []).length;
        if (opens !== closes) {
            issues.push({ file: file.path, line: 1, severity: 'error', message: `Mismatched {%${tag}%}/{%end${tag}%}: ${opens} opens, ${closes} closes` });
        }
    }
}
function checkJSON(file, issues) {
    try {
        JSON.parse(file.content);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        issues.push({ file: file.path, line: 1, severity: 'error', message: `Invalid JSON: ${msg}` });
        return;
    }
    // Section schema validation
    if (file.path.startsWith('sections/') && file.path.endsWith('.liquid'))
        return;
    if (file.path.startsWith('templates/') && file.path.endsWith('.json')) {
        try {
            const template = JSON.parse(file.content);
            if (!template.sections && !template.layout) {
                issues.push({ file: file.path, line: 1, severity: 'warning', message: 'Template JSON missing "sections" key' });
            }
        }
        catch {
            // Already caught above
        }
    }
}
function traceRenderingChain(workspacePath, pageType) {
    const chain = [];
    const visited = new Set();
    // Step 1: Find the template
    const templatePath = `templates/${pageType}.json`;
    const templateFile = readThemeFile(workspacePath, templatePath);
    if (!templateFile) {
        const liquidTemplatePath = `templates/${pageType}.liquid`;
        const liquidTemplate = readThemeFile(workspacePath, liquidTemplatePath);
        if (liquidTemplate) {
            chain.push(liquidTemplate.path);
            traceLiquidReferences(workspacePath, liquidTemplate.content, chain, visited);
            return chain;
        }
        return [`Template not found: ${templatePath}`];
    }
    chain.push(templateFile.path);
    // Step 2: Parse JSON template for section references
    try {
        const template = JSON.parse(templateFile.content);
        if (template.layout) {
            const layoutPath = template.layout === 'theme' ? 'layout/theme.liquid' : `layout/${template.layout}.liquid`;
            chain.push(layoutPath);
        }
        else {
            chain.push('layout/theme.liquid');
        }
        if (template.sections) {
            for (const key of Object.keys(template.sections)) {
                const section = template.sections[key];
                const sectionType = section.type ?? key;
                const sectionPath = `sections/${sectionType}.liquid`;
                if (!visited.has(sectionPath)) {
                    visited.add(sectionPath);
                    chain.push(sectionPath);
                    const sectionFile = readThemeFile(workspacePath, sectionPath);
                    if (sectionFile) {
                        traceLiquidReferences(workspacePath, sectionFile.content, chain, visited);
                    }
                }
            }
        }
    }
    catch {
        chain.push('(failed to parse template JSON)');
    }
    return chain;
}
function traceLiquidReferences(workspacePath, content, chain, visited) {
    // Match render and include tags: {% render 'snippet-name' %} or {% include 'snippet-name' %}
    const renderRegex = /{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = renderRegex.exec(content)) !== null) {
        const snippetName = match[1];
        const snippetPath = `snippets/${snippetName}${snippetName.endsWith('.liquid') ? '' : '.liquid'}`;
        if (visited.has(snippetPath))
            continue;
        visited.add(snippetPath);
        chain.push(snippetPath);
        const snippetFile = readThemeFile(workspacePath, snippetPath);
        if (snippetFile) {
            traceLiquidReferences(workspacePath, snippetFile.content, chain, visited);
        }
    }
    // Match section references: {% section 'section-name' %}
    const sectionRegex = /{%[-\s]*section\s+['"]([^'"]+)['"]/g;
    while ((match = sectionRegex.exec(content)) !== null) {
        const sectionName = match[1];
        const sectionPath = `sections/${sectionName}${sectionName.endsWith('.liquid') ? '' : '.liquid'}`;
        if (visited.has(sectionPath))
            continue;
        visited.add(sectionPath);
        chain.push(sectionPath);
        const sectionFile = readThemeFile(workspacePath, sectionPath);
        if (sectionFile) {
            traceLiquidReferences(workspacePath, sectionFile.content, chain, visited);
        }
    }
    // Match asset_url references
    const assetRegex = /['"]([^'"]+)['"]\s*\|\s*asset_url/g;
    while ((match = assetRegex.exec(content)) !== null) {
        const assetPath = `assets/${match[1]}`;
        if (!visited.has(assetPath)) {
            visited.add(assetPath);
            chain.push(assetPath);
        }
    }
}
function findSettingUsage(workspacePath, settingId) {
    const files = readThemeFiles(workspacePath);
    const definedIn = [];
    const usedIn = [];
    for (const file of files) {
        // Check schema definitions in section Liquid files
        if (file.path.endsWith('.liquid')) {
            const schemaMatch = file.content.match(/{%[-\s]*schema[-\s]*%}([\s\S]*?){%[-\s]*endschema[-\s]*%}/);
            if (schemaMatch) {
                try {
                    const schema = JSON.parse(schemaMatch[1]);
                    const settings = schema.settings ?? [];
                    if (settings.some((s) => s.id === settingId)) {
                        definedIn.push(file.path);
                    }
                    // Also check block-level settings
                    const blocks = schema.blocks ?? [];
                    for (const block of blocks) {
                        if (block.settings?.some((s) => s.id === settingId)) {
                            definedIn.push(file.path);
                            break;
                        }
                    }
                }
                catch {
                    // Invalid schema JSON
                }
            }
            // Check for settings usage in Liquid
            if (file.content.includes(`settings.${settingId}`) || file.content.includes(`section.settings.${settingId}`)) {
                usedIn.push(file.path);
            }
        }
        // Check settings_schema.json
        if (file.path === 'config/settings_schema.json') {
            try {
                const schemas = JSON.parse(file.content);
                for (const group of schemas) {
                    if (group.settings?.some((s) => s.id === settingId)) {
                        definedIn.push(file.path);
                        break;
                    }
                }
            }
            catch {
                // Invalid JSON
            }
        }
        // Check settings_data.json for actual values
        if (file.path === 'config/settings_data.json' && file.content.includes(`"${settingId}"`)) {
            usedIn.push(file.path);
        }
    }
    return { definedIn: [...new Set(definedIn)], usedIn: [...new Set(usedIn)] };
}
function findReferences(workspacePath, filePath) {
    const files = readThemeFiles(workspacePath);
    const referencedBy = [];
    const references = [];
    const baseName = filePath.replace(/^(snippets|sections|assets|layout)\//, '').replace(/\.liquid$/, '');
    // Find files that reference our target
    for (const file of files) {
        if (file.path === filePath) {
            // Find what this file references
            const renderRegex = /{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
            let match;
            while ((match = renderRegex.exec(file.content)) !== null) {
                references.push(`snippets/${match[1]}${match[1].endsWith('.liquid') ? '' : '.liquid'}`);
            }
            const sectionRegex = /{%[-\s]*section\s+['"]([^'"]+)['"]/g;
            while ((match = sectionRegex.exec(file.content)) !== null) {
                references.push(`sections/${match[1]}${match[1].endsWith('.liquid') ? '' : '.liquid'}`);
            }
            const assetRegex = /['"]([^'"]+)['"]\s*\|\s*asset_url/g;
            while ((match = assetRegex.exec(file.content)) !== null) {
                references.push(`assets/${match[1]}`);
            }
            continue;
        }
        // Check if this file references our target
        if (file.content.includes(baseName)) {
            // More precise check
            const renderPattern = new RegExp(`{%[-\\s]*(?:render|include)\\s+['"]${escapeRegex(baseName)}['"]`);
            const sectionPattern = new RegExp(`{%[-\\s]*section\\s+['"]${escapeRegex(baseName)}['"]`);
            const assetPattern = new RegExp(`['"]${escapeRegex(baseName.replace(/^assets\//, ''))}['"]\\s*\\|\\s*asset_url`);
            if (renderPattern.test(file.content) || sectionPattern.test(file.content) || assetPattern.test(file.content)) {
                referencedBy.push(file.path);
            }
        }
        // Check JSON templates for section references
        if (file.path.startsWith('templates/') && file.path.endsWith('.json') && filePath.startsWith('sections/')) {
            const sectionType = filePath.replace(/^sections\//, '').replace(/\.liquid$/, '');
            if (file.content.includes(`"type": "${sectionType}"`) || file.content.includes(`"type":"${sectionType}"`)) {
                referencedBy.push(file.path);
            }
        }
    }
    return {
        referencedBy: [...new Set(referencedBy)],
        references: [...new Set(references)],
    };
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// --- Tool registration ---
export function registerLocalShopifyTools(registry, config) {
    registry.register({
        definition: {
            name: 'shopify_theme_check',
            description: 'Run basic theme checks (schema validation, syntax issues, deprecated filters) on local theme files. Returns a list of issues with file, line, severity, and message.',
            inputSchema: {
                type: 'object',
                properties: {
                    files: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional list of file paths to check (relative to workspace). Defaults to all theme files.',
                    },
                },
            },
        },
        async handler(args) {
            try {
                const files = args.files;
                const issues = checkThemeFiles(config.workspacePath, files);
                return ok({ issueCount: issues.length, issues });
            }
            catch (e) {
                logger.error('shopify_theme_check failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_trace_chain',
            description: 'Trace the full rendering chain for a page type. Follows template JSON -> layout -> sections -> snippets -> assets to show exactly which files render a page.',
            inputSchema: {
                type: 'object',
                properties: {
                    pageType: {
                        type: 'string',
                        description: 'Page type to trace (e.g. "product", "collection", "cart", "index", "page")',
                    },
                },
                required: ['pageType'],
            },
        },
        async handler(args) {
            try {
                const pageType = args.pageType;
                const chain = traceRenderingChain(config.workspacePath, pageType);
                return ok({ pageType, chain });
            }
            catch (e) {
                logger.error('shopify_trace_chain failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_check_setting',
            description: 'Find where a Shopify theme setting is defined (in section schemas or settings_schema.json) and where it is used across Liquid files.',
            inputSchema: {
                type: 'object',
                properties: {
                    settingId: {
                        type: 'string',
                        description: 'The setting ID to search for (e.g. "show_announcement", "color_primary")',
                    },
                },
                required: ['settingId'],
            },
        },
        async handler(args) {
            try {
                const settingId = args.settingId;
                const result = findSettingUsage(config.workspacePath, settingId);
                return ok({ settingId, ...result });
            }
            catch (e) {
                logger.error('shopify_check_setting failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_find_references',
            description: 'Find all files that reference a given theme file (via render, include, section, asset_url) and all files that the given file references.',
            inputSchema: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'File path relative to workspace (e.g. "snippets/product-card.liquid", "sections/header.liquid")',
                    },
                },
                required: ['filePath'],
            },
        },
        async handler(args) {
            try {
                const filePath = args.filePath;
                const result = findReferences(config.workspacePath, filePath);
                return ok({ filePath, ...result });
            }
            catch (e) {
                logger.error('shopify_find_references failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_list_themes',
            description: 'List all themes in the connected Shopify store via the Admin API.',
            inputSchema: {
                type: 'object',
                properties: {
                    store: {
                        type: 'string',
                        description: 'Optional store override (e.g. "my-store.myshopify.com"). Uses configured store if omitted.',
                    },
                },
            },
        },
        async handler(args) {
            try {
                const storeOverride = args.store;
                const effectiveConfig = storeOverride ? { ...config, store: storeOverride } : config;
                const client = getShopifyClient(effectiveConfig);
                const themes = await client.listThemes();
                return ok({ themes });
            }
            catch (e) {
                logger.error('shopify_list_themes failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_get_asset',
            description: 'Get a single theme asset from the Shopify store via the Admin API.',
            inputSchema: {
                type: 'object',
                properties: {
                    themeId: {
                        type: 'string',
                        description: 'Theme ID',
                    },
                    key: {
                        type: 'string',
                        description: 'Asset key (e.g. "templates/index.json", "sections/header.liquid")',
                    },
                },
                required: ['themeId', 'key'],
            },
        },
        async handler(args) {
            try {
                const client = getShopifyClient(config);
                const content = await client.getAsset(args.themeId, args.key);
                return ok({ key: args.key, content });
            }
            catch (e) {
                logger.error('shopify_get_asset failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_get_product',
            description: 'Get product details (variants, images, metafields) from the Shopify store. Provide either a product ID or handle.',
            inputSchema: {
                type: 'object',
                properties: {
                    productId: {
                        type: 'string',
                        description: 'Numeric product ID',
                    },
                    handle: {
                        type: 'string',
                        description: 'Product handle (URL slug)',
                    },
                },
            },
        },
        async handler(args) {
            try {
                const client = getShopifyClient(config);
                const product = await client.getProduct(args.productId, args.handle);
                return ok({ product });
            }
            catch (e) {
                logger.error('shopify_get_product failed', e);
                return err(String(e));
            }
        },
    });
    registry.register({
        definition: {
            name: 'shopify_list_resources',
            description: 'List store resources (products, collections, pages, blogs) from the Shopify Admin API.',
            inputSchema: {
                type: 'object',
                properties: {
                    resourceType: {
                        type: 'string',
                        description: 'Resource type: "products", "collections", "pages", or "blogs"',
                    },
                },
                required: ['resourceType'],
            },
        },
        async handler(args) {
            try {
                const client = getShopifyClient(config);
                const resources = await client.listResources(args.resourceType);
                return ok({ resourceType: args.resourceType, resources });
            }
            catch (e) {
                logger.error('shopify_list_resources failed', e);
                return err(String(e));
            }
        },
    });
    logger.info('Registered local Shopify tools', { workspacePath: config.workspacePath, store: config.store });
}
//# sourceMappingURL=local-shopify.js.map