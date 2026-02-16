/**
 * Synapse Preview Bridge v1
 *
 * Injected into the Shopify preview iframe by the proxy.
 * Communicates with the Synapse IDE via postMessage.
 *
 * Protocol:
 *   IDE → Bridge:  { type: 'synapse-bridge', id, action, payload }
 *   Bridge → IDE:  { type: 'synapse-bridge-response', id, action, data }
 */
(function () {
  'use strict';

  if (window.__SYNAPSE_BRIDGE__) return;
  window.__SYNAPSE_BRIDGE__ = { version: 1 };

  var BRIDGE_TYPE = 'synapse-bridge';
  var RESPONSE_TYPE = 'synapse-bridge-response';

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  /** Build a short, unique CSS selector path for an element */
  function selectorPath(el) {
    if (!el || el === document.documentElement) return 'html';
    var parts = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      var seg = cur.tagName.toLowerCase();
      if (cur.id) {
        seg += '#' + cur.id;
        parts.unshift(seg);
        break;
      }
      var cls = Array.from(cur.classList || [])
        .filter(function (c) { return !/^shopify-|^js-/.test(c); })
        .slice(0, 2)
        .join('.');
      if (cls) seg += '.' + cls;
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  /** Extract key computed styles for an element */
  function extractStyles(el) {
    var cs = window.getComputedStyle(el);
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      padding: cs.padding,
      margin: cs.margin,
      border: cs.border,
      display: cs.display,
      position: cs.position,
      width: cs.width,
      height: cs.height,
      zIndex: cs.zIndex,
      opacity: cs.opacity,
    };
  }

  /** Get bounding box relative to viewport */
  function boundingBox(el) {
    var r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  }

  /** Summarize an element for inspection results */
  function summarizeElement(el) {
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList || []),
      selector: selectorPath(el),
      dataAttributes: extractDataAttributes(el),
      textPreview: (el.textContent || '').trim().slice(0, 120),
      styles: extractStyles(el),
      rect: boundingBox(el),
    };
  }

  /** Extract all data-* attributes */
  function extractDataAttributes(el) {
    var result = {};
    Array.from(el.attributes || []).forEach(function (attr) {
      if (attr.name.startsWith('data-')) {
        result[attr.name] = attr.value;
      }
    });
    return result;
  }

  /* Known app containers and patterns */
  var APP_SELECTORS = [
    '#shopify-section-apps',
    '[data-shopify-block-type]',
    '.shopify-app-block',
    '[id*="shopify-app"]',
    '.spo-product-reviews', // Shopify Product Reviews
    '.yotpo', '.yotpo-widget', // Yotpo
    '.stamped-reviews', // Stamped
    '.loox', // Loox
    '.judge-me', '.jdgm-widget', // Judge.me
    '.klaviyo', // Klaviyo
    '.privy-popup', // Privy
    '[data-recharge]', // ReCharge
    '.bold-', // Bold apps
    '.rebuy', // Rebuy
    '.zipify', // Zipify
  ];

  /** Check if an element is likely from a third-party app */
  function isAppElement(el) {
    var sel = selectorPath(el);
    // Inside a known app container
    if (el.closest('#shopify-section-apps') ||
        el.closest('.shopify-app-block') ||
        el.closest('[data-shopify-block-type]')) {
      return true;
    }
    // Matches known app selectors
    for (var i = 0; i < APP_SELECTORS.length; i++) {
      try {
        if (el.matches(APP_SELECTORS[i])) return true;
      } catch (e) { /* invalid selector, skip */ }
    }
    return false;
  }

  /**
   * Resolve the nearest Shopify section ancestor and return the Liquid file path.
   * e.g. "sections/main-product.liquid". Returns null if outside any section.
   */
  function getSectionLiquidPath(el) {
    var sectionEl =
      el.closest('[data-section-type]') ||
      el.closest('[data-section-id]') ||
      el.closest('[id^="shopify-section-"]') ||
      el.closest('[data-shopify]');
    if (!sectionEl) return null;

    var sectionType = sectionEl.getAttribute('data-section-type') ||
                      sectionEl.getAttribute('data-shopify') || '';

    if (!sectionType) {
      var rawId = sectionEl.getAttribute('data-section-id') || sectionEl.id || '';
      rawId = rawId.replace(/^shopify-section-/, '');
      var tplMatch = rawId.match(/^template--\d+__(.+)$/);
      if (tplMatch) rawId = tplMatch[1];
      sectionType = rawId;
    }

    if (!sectionType || /[\/\\]/.test(sectionType)) return null;
    return 'sections/' + sectionType + '.liquid';
  }

  /** Detect the source of an element (theme or app name guess) */
  function detectSource(el) {
    // Check data attributes for app identifiers
    var attrs = extractDataAttributes(el);
    if (attrs['data-shopify-block-type']) return 'shopify-app: ' + attrs['data-shopify-block-type'];
    if (attrs['data-app-id']) return 'app-id: ' + attrs['data-app-id'];

    // Check class-based heuristics
    var cls = (el.className || '').toString().toLowerCase();
    if (/yotpo/.test(cls)) return 'Yotpo';
    if (/stamped/.test(cls)) return 'Stamped';
    if (/loox/.test(cls)) return 'Loox';
    if (/judge-?me|jdgm/.test(cls)) return 'Judge.me';
    if (/klaviyo/.test(cls)) return 'Klaviyo';
    if (/privy/.test(cls)) return 'Privy';
    if (/recharge/.test(cls)) return 'ReCharge';
    if (/bold-/.test(cls)) return 'Bold';
    if (/rebuy/.test(cls)) return 'Rebuy';

    return 'unknown-app';
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  var actions = {};

  /** inspect(selector) -- find elements matching a CSS selector */
  actions.inspect = function (payload) {
    var selector = payload && payload.selector;
    if (!selector) return { error: 'selector is required' };
    try {
      var els = Array.from(document.querySelectorAll(selector)).slice(0, 50);
      return {
        count: els.length,
        elements: els.map(summarizeElement),
      };
    } catch (e) {
      return { error: 'Invalid selector: ' + e.message };
    }
  };

  /** listAppElements() -- find all third-party/app-injected elements */
  actions.listAppElements = function () {
    var found = [];
    var seen = new Set();

    APP_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          if (seen.has(el)) return;
          seen.add(el);
          var info = summarizeElement(el);
          info.source = detectSource(el);
          info.isApp = true;
          found.push(info);
        });
      } catch (e) { /* skip invalid selectors */ }
    });

    // Also scan for script tags from apps
    var appScripts = [];
    document.querySelectorAll('script[src]').forEach(function (s) {
      var src = s.getAttribute('src') || '';
      // Skip Shopify core, theme, and common CDN scripts
      if (/cdn\.shopify\.com\/(s\/files|shopifycloud\/web)/.test(src)) return;
      if (/assets\//.test(src) && !/app/.test(src)) return;
      appScripts.push(src);
    });

    return {
      count: found.length,
      elements: found,
      appScripts: appScripts,
    };
  };

  /** getStylesheets() -- list all loaded stylesheets */
  actions.getStylesheets = function () {
    var sheets = [];
    Array.from(document.styleSheets).forEach(function (ss) {
      var href = ss.href || null;
      var isTheme = href && /cdn\.shopify\.com\/s\/files/.test(href);
      var isApp = href && !isTheme && !/cdn\.shopify\.com\/(shopifycloud|web)/.test(href || '');
      var ruleCount = 0;
      try { ruleCount = ss.cssRules ? ss.cssRules.length : 0; } catch (e) { /* cross-origin */ }

      sheets.push({
        href: href,
        isTheme: !!isTheme,
        isApp: !!isApp,
        isInline: !href,
        ruleCount: ruleCount,
        media: ss.media ? Array.from(ss.media).join(', ') : '',
      });
    });
    return { count: sheets.length, stylesheets: sheets };
  };

  /** getPageSnapshot() -- lightweight DOM tree of the visible viewport */
  actions.getPageSnapshot = function () {
    var maxNodes = 300;
    var count = 0;

    function walk(el, depth) {
      if (count >= maxNodes || depth > 8) return null;
      count++;
      var tag = el.tagName.toLowerCase();
      // Skip script, style, svg internals, noscript
      if (['script', 'style', 'noscript', 'link', 'meta'].indexOf(tag) >= 0) return null;

      var node = {
        tag: tag,
        selector: selectorPath(el),
      };
      if (el.id) node.id = el.id;
      var cls = Array.from(el.classList || []).slice(0, 4);
      if (cls.length) node.classes = cls;
      var da = extractDataAttributes(el);
      if (Object.keys(da).length) node.data = da;
      if (isAppElement(el)) node.isApp = true;

      // Only recurse into elements with children
      var children = Array.from(el.children || []);
      if (children.length > 0 && depth < 8) {
        var childNodes = children.map(function (c) { return walk(c, depth + 1); }).filter(Boolean);
        if (childNodes.length) node.children = childNodes;
      } else if (!children.length) {
        var text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 80) node.text = text;
      }

      return node;
    }

    var root = walk(document.body, 0);
    return { nodeCount: count, tree: root };
  };

  /** querySelector(selector) -- detailed info about a single element */
  actions.querySelector = function (payload) {
    var selector = payload && payload.selector;
    if (!selector) return { error: 'selector is required' };
    try {
      var el = document.querySelector(selector);
      if (!el) return { found: false };

      var detail = summarizeElement(el);
      detail.found = true;
      detail.isApp = isAppElement(el);
      if (detail.isApp) detail.source = detectSource(el);

      // Parent chain (up to 5 levels)
      detail.parents = [];
      var p = el.parentElement;
      var pCount = 0;
      while (p && p !== document.body && pCount < 5) {
        detail.parents.push({
          tag: p.tagName.toLowerCase(),
          selector: selectorPath(p),
          id: p.id || null,
          classes: Array.from(p.classList || []).slice(0, 3),
        });
        p = p.parentElement;
        pCount++;
      }

      // Siblings
      detail.siblings = [];
      if (el.parentElement) {
        Array.from(el.parentElement.children).forEach(function (sib) {
          if (sib === el) return;
          detail.siblings.push({
            tag: sib.tagName.toLowerCase(),
            selector: selectorPath(sib),
            classes: Array.from(sib.classList || []).slice(0, 3),
          });
        });
        detail.siblings = detail.siblings.slice(0, 10);
      }

      // Full computed styles (more comprehensive than summarize)
      var cs = window.getComputedStyle(el);
      detail.allStyles = {};
      var props = [
        'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
        'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecoration',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'border', 'borderRadius', 'boxShadow',
        'display', 'position', 'top', 'right', 'bottom', 'left',
        'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight',
        'overflow', 'zIndex', 'opacity', 'visibility',
        'flexDirection', 'justifyContent', 'alignItems', 'gap',
        'gridTemplateColumns', 'gridTemplateRows',
        'backgroundImage', 'backgroundSize', 'backgroundPosition',
        'transition', 'transform',
      ];
      props.forEach(function (prop) {
        var val = cs.getPropertyValue(prop.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }));
        if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)') {
          detail.allStyles[prop] = val;
        }
      });

      return detail;
    } catch (e) {
      return { error: 'Invalid selector: ' + e.message };
    }
  };

  /** injectCSS(css) -- inject CSS into the page for live preview */
  actions.injectCSS = function (payload) {
    var css = payload && payload.css;
    if (!css) return { error: 'css is required' };
    var id = 'synapse-live-css';
    var existing = document.getElementById(id);
    if (existing) {
      existing.textContent = css;
    } else {
      var style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    }
    return { injected: true };
  };

  /** clearCSS() -- remove injected live preview CSS */
  actions.clearCSS = function () {
    var el = document.getElementById('synapse-live-css');
    if (el) el.remove();
    return { cleared: true };
  };

  /** injectHTML(selector, html) -- inject HTML into an element for live preview */
  actions.injectHTML = function (payload) {
    var selector = payload && payload.selector;
    var html = payload && payload.html;
    if (!selector) return { error: 'selector is required' };
    if (!html) return { error: 'html is required' };
    try {
      var el = document.querySelector(selector);
      if (!el) {
        return { injected: false, error: 'Element not found: ' + selector };
      }
      // Store original innerHTML only if not already stored
      if (!el.hasAttribute('data-synapse-original')) {
        el.setAttribute('data-synapse-original', el.innerHTML);
      }
      el.innerHTML = html;
      return { injected: true, selector: selector };
    } catch (e) {
      return { injected: false, error: 'Error injecting HTML: ' + e.message };
    }
  };

  /** clearHTML() -- restore original HTML for all injected elements */
  actions.clearHTML = function () {
    var elements = document.querySelectorAll('[data-synapse-original]');
    var count = elements.length;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var original = el.getAttribute('data-synapse-original');
      if (original !== null) {
        el.innerHTML = original;
        el.removeAttribute('data-synapse-original');
      }
    }
    return { cleared: true, count: count };
  };

  /** detectConflicts(selector) -- check if a CSS selector conflicts with app stylesheets */
  actions.detectConflicts = function (payload) {
    var selector = payload && payload.selector;
    if (!selector) return { error: 'selector is required' };

    var conflicts = [];
    try {
      var el = document.querySelector(selector);
      if (!el) return { selector: selector, found: false, conflicts: [] };

      // Check all stylesheets for rules that match this selector
      Array.from(document.styleSheets).forEach(function (ss) {
        var href = ss.href || '(inline)';
        var isTheme = href !== '(inline)' && /cdn\.shopify\.com\/s\/files/.test(href);
        var isApp = href !== '(inline)' && !isTheme;
        if (!isApp) return; // Only report app conflicts

        try {
          Array.from(ss.cssRules || []).forEach(function (rule) {
            if (rule.type !== 1) return; // CSSStyleRule only
            var styleRule = rule;
            try {
              if (el.matches(styleRule.selectorText)) {
                conflicts.push({
                  stylesheet: href,
                  selector: styleRule.selectorText,
                  properties: styleRule.style.cssText.split(';').filter(Boolean).map(function (p) { return p.trim(); }).slice(0, 10),
                });
              }
            } catch (e) { /* invalid selector in stylesheet */ }
          });
        } catch (e) { /* cross-origin stylesheet */ }
      });
    } catch (e) {
      return { error: 'Invalid selector: ' + e.message };
    }

    return { selector: selector, found: true, conflicts: conflicts };
  };

  /* ------------------------------------------------------------------ */
  /*  Interactive Inspect Mode                                           */
  /* ------------------------------------------------------------------ */

  var inspectState = {
    active: false,
    locked: false,
    lockedTarget: null,
    overlay: null,
    tooltip: null,
    lastTarget: null,
    handlers: {},
  };

  function createOverlay() {
    var ov = document.createElement('div');
    ov.id = 'synapse-inspect-overlay';
    ov.setAttribute('data-synapse-inspect', '1');
    ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #3b82f6;background:rgba(59,130,246,0.08);transition:all 0.05s ease;display:none;';
    document.body.appendChild(ov);
    return ov;
  }

  function createTooltip() {
    var tt = document.createElement('div');
    tt.id = 'synapse-inspect-tooltip';
    tt.setAttribute('data-synapse-inspect', '1');
    tt.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#0f172a;color:#e2e8f0;font:11px/1.4 ui-monospace,monospace;padding:3px 8px;border-radius:4px;white-space:nowrap;display:none;border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 12px rgba(0,0,0,0.4);max-width:400px;';
    document.body.appendChild(tt);
    return tt;
  }

  function isInspectElement(el) {
    if (!el) return false;
    return el.hasAttribute && el.hasAttribute('data-synapse-inspect');
  }

  /** Position the tooltip relative to an element rect, with viewport clamping. */
  function positionTooltip(tt, rect) {
    if (!tt) return;
    var ttRect = tt.getBoundingClientRect();
    var ttW = ttRect.width || 120;
    var ttH = ttRect.height || 22;
    var vw = window.innerWidth;
    var ttTop = rect.top - ttH - 6;
    if (ttTop < 4) ttTop = rect.bottom + 4;
    var ttLeft = Math.max(4, Math.min(rect.left, vw - ttW - 4));
    tt.style.top = ttTop + 'px';
    tt.style.left = ttLeft + 'px';
    tt.style.display = 'block';
  }

  /**
   * Build tooltip DOM content.
   * When interactive is true, the Liquid path is a clickable link.
   */
  function buildTooltipContent(tt, label, dims, liquidPath, interactive) {
    tt.innerHTML = '';
    var line1 = document.createElement('div');
    line1.textContent = label + '  (' + dims + ')';
    tt.appendChild(line1);
    if (liquidPath) {
      var line2 = document.createElement('div');
      if (interactive) {
        var link = document.createElement('span');
        link.textContent = liquidPath;
        link.setAttribute('data-synapse-inspect', '1');
        link.style.cssText = 'color:#38bdf8;text-decoration:underline;cursor:pointer;';
        link.addEventListener('mouseenter', function () { link.style.color = '#7dd3fc'; });
        link.addEventListener('mouseleave', function () { link.style.color = '#38bdf8'; });
        link.addEventListener('click', function (evt) {
          evt.preventDefault();
          evt.stopPropagation();
          evt.stopImmediatePropagation();
          if (window.parent !== window) {
            window.parent.postMessage({
              type: RESPONSE_TYPE,
              id: '__open_file__',
              action: 'open-file',
              data: { filePath: liquidPath },
            }, '*');
          }
          unlockInspect();
        });
        line2.appendChild(link);
      } else {
        line2.textContent = liquidPath;
        line2.style.color = '#94a3b8';
      }
      tt.appendChild(line2);
    }
  }

  /** Unlock the inspector: restore hover mode, clean up scroll/resize listeners. */
  function unlockInspect() {
    inspectState.locked = false;
    inspectState.lockedTarget = null;
    if (inspectState.overlay) inspectState.overlay.style.borderColor = '#3b82f6';
    if (inspectState.tooltip) {
      inspectState.tooltip.style.pointerEvents = 'none';
      inspectState.tooltip.innerHTML = '';
    }
    if (inspectState.handlers.lockScroll) {
      window.removeEventListener('scroll', inspectState.handlers.lockScroll, true);
      inspectState.handlers.lockScroll = null;
    }
    if (inspectState.handlers.lockResize) {
      window.removeEventListener('resize', inspectState.handlers.lockResize);
      inspectState.handlers.lockResize = null;
    }
  }

  /** Update overlay and tooltip position for a locked element (e.g. on scroll/resize). */
  function updateLockedPosition() {
    if (!inspectState.locked || !inspectState.lockedTarget) return;
    if (!inspectState.lockedTarget.isConnected) {
      unlockInspect();
      return;
    }
    var rect = inspectState.lockedTarget.getBoundingClientRect();
    var ov = inspectState.overlay;
    if (ov) {
      ov.style.top = rect.top + 'px';
      ov.style.left = rect.left + 'px';
      ov.style.width = rect.width + 'px';
      ov.style.height = rect.height + 'px';
    }
    positionTooltip(inspectState.tooltip, rect);
  }

  function onInspectMouseMove(e) {
    // When locked, skip hover updates (overlay stays pinned)
    if (inspectState.locked) {
      if (inspectState.lockedTarget && !inspectState.lockedTarget.isConnected) {
        unlockInspect();
      }
      return;
    }

    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isInspectElement(el) || el === document.body || el === document.documentElement) {
      if (inspectState.overlay) inspectState.overlay.style.display = 'none';
      if (inspectState.tooltip) inspectState.tooltip.style.display = 'none';
      inspectState.lastTarget = null;
      return;
    }
    if (el === inspectState.lastTarget) return;
    inspectState.lastTarget = el;

    var rect = el.getBoundingClientRect();
    var ov = inspectState.overlay;
    if (ov) {
      ov.style.top = rect.top + 'px';
      ov.style.left = rect.left + 'px';
      ov.style.width = rect.width + 'px';
      ov.style.height = rect.height + 'px';
      ov.style.display = 'block';
    }

    var tt = inspectState.tooltip;
    if (tt) {
      var tag = el.tagName.toLowerCase();
      var label = tag;
      if (el.id) {
        label += '#' + el.id;
      } else {
        var cls = Array.from(el.classList || []).filter(function (c) { return !/^shopify-|^js-/.test(c); }).slice(0, 2);
        if (cls.length) label += '.' + cls.join('.');
      }
      var dims = Math.round(rect.width) + ' x ' + Math.round(rect.height);
      var liquidPath = getSectionLiquidPath(el);
      buildTooltipContent(tt, label, dims, liquidPath, false);
      positionTooltip(tt, rect);
    }
  }

  function onInspectClick(e) {
    // If the click is on the tooltip or its children (e.g. liquid link), let it through
    if (isInspectElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // If already locked, unlock and resume hover
    if (inspectState.locked) {
      unlockInspect();
      return;
    }

    var el = inspectState.lastTarget;
    if (!el || isInspectElement(el)) return;

    // Lock onto the clicked element
    inspectState.locked = true;
    inspectState.lockedTarget = el;

    // Visual indicator: amber border
    if (inspectState.overlay) inspectState.overlay.style.borderColor = '#f59e0b';

    // Rebuild tooltip as interactive (clickable Liquid path)
    var tt = inspectState.tooltip;
    if (tt) {
      var tag = el.tagName.toLowerCase();
      var label = tag;
      if (el.id) {
        label += '#' + el.id;
      } else {
        var cls = Array.from(el.classList || []).filter(function (c) { return !/^shopify-|^js-/.test(c); }).slice(0, 2);
        if (cls.length) label += '.' + cls.join('.');
      }
      var rect = el.getBoundingClientRect();
      var dims = Math.round(rect.width) + ' x ' + Math.round(rect.height);
      var liquidPath = getSectionLiquidPath(el);
      tt.style.pointerEvents = 'auto';
      buildTooltipContent(tt, label, dims, liquidPath, true);
      positionTooltip(tt, rect);
    }

    // Register scroll/resize listeners to track the locked element
    inspectState.handlers.lockScroll = updateLockedPosition;
    inspectState.handlers.lockResize = updateLockedPosition;
    window.addEventListener('scroll', inspectState.handlers.lockScroll, { capture: true, passive: true });
    window.addEventListener('resize', inspectState.handlers.lockResize);

    // Send element-selected to parent as before
    var summary = summarizeElement(el);
    summary.isApp = isAppElement(el);
    if (summary.isApp) summary.source = detectSource(el);
    var liqPath = getSectionLiquidPath(el);
    if (liqPath) summary.liquidSection = liqPath;
    if (window.parent !== window) {
      window.parent.postMessage({
        type: RESPONSE_TYPE,
        id: '__element_selected__',
        action: 'element-selected',
        data: summary,
      }, '*');
    }
  }

  actions.enableInspect = function () {
    if (inspectState.active) return { already: true };
    inspectState.active = true;
    inspectState.overlay = createOverlay();
    inspectState.tooltip = createTooltip();

    inspectState.handlers.mousemove = onInspectMouseMove;
    inspectState.handlers.click = onInspectClick;
    inspectState.handlers.keydown = function (evt) {
      if (evt.key === 'Escape' && inspectState.locked) {
        unlockInspect();
      }
    };

    document.addEventListener('mousemove', inspectState.handlers.mousemove, true);
    document.addEventListener('click', inspectState.handlers.click, true);
    document.addEventListener('keydown', inspectState.handlers.keydown, true);

    return { enabled: true };
  };

  actions.disableInspect = function () {
    if (!inspectState.active) return { already: true };
    inspectState.active = false;

    // Unlock first to clean up scroll/resize listeners
    if (inspectState.locked) unlockInspect();

    if (inspectState.handlers.mousemove) {
      document.removeEventListener('mousemove', inspectState.handlers.mousemove, true);
    }
    if (inspectState.handlers.click) {
      document.removeEventListener('click', inspectState.handlers.click, true);
    }
    if (inspectState.handlers.keydown) {
      document.removeEventListener('keydown', inspectState.handlers.keydown, true);
    }
    inspectState.handlers = {};

    if (inspectState.overlay) { inspectState.overlay.remove(); inspectState.overlay = null; }
    if (inspectState.tooltip) { inspectState.tooltip.remove(); inspectState.tooltip = null; }
    inspectState.lastTarget = null;

    return { disabled: true };
  };

  /** ping -- health check */
  actions.ping = function () {
    return { version: 1, ready: true, url: window.location.href };
  };

  /* ------------------------------------------------------------------ */
  /*  Message handler                                                    */
  /* ------------------------------------------------------------------ */

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.type !== BRIDGE_TYPE) return;

    var action = msg.action;
    var handler = actions[action];
    if (!handler) {
      event.source.postMessage({
        type: RESPONSE_TYPE,
        id: msg.id,
        action: action,
        data: { error: 'Unknown action: ' + action },
      }, '*');
      return;
    }

    try {
      var result = handler(msg.payload || {});
      event.source.postMessage({
        type: RESPONSE_TYPE,
        id: msg.id,
        action: action,
        data: result,
      }, '*');
    } catch (e) {
      event.source.postMessage({
        type: RESPONSE_TYPE,
        id: msg.id,
        action: action,
        data: { error: e.message },
      }, '*');
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Passive viewport reporter                                         */
  /*  Sends lightweight context to the parent on scroll, navigation,    */
  /*  and visibility change so the IDE knows what the user is viewing.  */
  /* ------------------------------------------------------------------ */

  var PASSIVE_TYPE = 'synapse-bridge-passive';
  var passiveDebounceTimer = null;

  /** Collect sections whose bounding rects overlap the viewport. */
  function collectVisibleSections() {
    var vh = window.innerHeight;
    var sections = [];
    // Shopify sections: [data-section-id], [data-shopify]
    var candidates = document.querySelectorAll('[data-section-id], [data-shopify], [id^="shopify-section-"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var rect = el.getBoundingClientRect();
      // Overlaps viewport?
      if (rect.bottom > 0 && rect.top < vh && rect.height > 0) {
        var sectionId = el.getAttribute('data-section-id') || el.id || null;
        var sectionType = el.getAttribute('data-section-type') ||
                          el.getAttribute('data-shopify') ||
                          el.getAttribute('class')?.split(/\s+/).find(function (c) { return /section/.test(c); }) ||
                          '';
        sections.push({
          id: sectionId,
          type: sectionType,
          tag: el.tagName.toLowerCase(),
        });
      }
    }
    return sections;
  }

  function sendPassiveContext() {
    if (window.parent === window) return;
    var pageHeight = document.documentElement.scrollHeight;
    var scrollPercent = pageHeight > 0
      ? Math.round((window.scrollY / (pageHeight - window.innerHeight)) * 100)
      : 0;

    window.parent.postMessage({
      type: PASSIVE_TYPE,
      data: {
        url: window.location.href,
        title: document.title,
        scrollY: Math.round(window.scrollY),
        viewportHeight: window.innerHeight,
        pageHeight: pageHeight,
        scrollPercent: Math.max(0, Math.min(100, scrollPercent)),
        visibleSections: collectVisibleSections(),
      },
    }, '*');
  }

  function debouncedPassive() {
    clearTimeout(passiveDebounceTimer);
    passiveDebounceTimer = setTimeout(sendPassiveContext, 500);
  }

  // Listen for scroll, navigation, and visibility changes
  window.addEventListener('scroll', debouncedPassive, { passive: true });
  window.addEventListener('resize', debouncedPassive, { passive: true });
  window.addEventListener('popstate', sendPassiveContext);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sendPassiveContext();
  });

  // Signal that the bridge is ready
  if (window.parent !== window) {
    window.parent.postMessage({
      type: RESPONSE_TYPE,
      id: '__ready__',
      action: 'ready',
      data: { version: 1, url: window.location.href },
    }, '*');

    // Send initial passive context after a brief delay (DOM settle)
    setTimeout(sendPassiveContext, 1000);
  }
})();
