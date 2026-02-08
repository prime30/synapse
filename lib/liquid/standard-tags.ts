export interface LiquidTagDefinition {
  name: string;
  requiresClosing: boolean;
  syntax: string;
}

export const STANDARD_TAGS: LiquidTagDefinition[] = [
  // Control flow
  {
    name: "if",
    requiresClosing: true,
    syntax: "{% if condition %}...{% endif %}",
  },
  {
    name: "elsif",
    requiresClosing: false,
    syntax: "{% elsif condition %}",
  },
  {
    name: "else",
    requiresClosing: false,
    syntax: "{% else %}",
  },
  {
    name: "endif",
    requiresClosing: false,
    syntax: "{% endif %}",
  },
  {
    name: "unless",
    requiresClosing: true,
    syntax: "{% unless condition %}...{% endunless %}",
  },
  {
    name: "endunless",
    requiresClosing: false,
    syntax: "{% endunless %}",
  },
  {
    name: "case",
    requiresClosing: true,
    syntax: "{% case variable %}{% when value %}...{% endcase %}",
  },
  {
    name: "when",
    requiresClosing: false,
    syntax: "{% when value %}",
  },
  {
    name: "endcase",
    requiresClosing: false,
    syntax: "{% endcase %}",
  },

  // Iteration
  {
    name: "for",
    requiresClosing: true,
    syntax: "{% for item in collection %}...{% endfor %}",
  },
  {
    name: "endfor",
    requiresClosing: false,
    syntax: "{% endfor %}",
  },
  {
    name: "tablerow",
    requiresClosing: true,
    syntax: "{% tablerow item in collection %}...{% endtablerow %}",
  },
  {
    name: "endtablerow",
    requiresClosing: false,
    syntax: "{% endtablerow %}",
  },
  {
    name: "paginate",
    requiresClosing: true,
    syntax: "{% paginate collection by number %}...{% endpaginate %}",
  },
  {
    name: "endpaginate",
    requiresClosing: false,
    syntax: "{% endpaginate %}",
  },

  // Variable
  {
    name: "assign",
    requiresClosing: false,
    syntax: "{% assign variable = value %}",
  },
  {
    name: "capture",
    requiresClosing: true,
    syntax: "{% capture variable %}...{% endcapture %}",
  },
  {
    name: "endcapture",
    requiresClosing: false,
    syntax: "{% endcapture %}",
  },
  {
    name: "increment",
    requiresClosing: false,
    syntax: "{% increment variable %}",
  },
  {
    name: "decrement",
    requiresClosing: false,
    syntax: "{% decrement variable %}",
  },

  // Theme
  {
    name: "comment",
    requiresClosing: true,
    syntax: "{% comment %}...{% endcomment %}",
  },
  {
    name: "endcomment",
    requiresClosing: false,
    syntax: "{% endcomment %}",
  },
  {
    name: "raw",
    requiresClosing: true,
    syntax: "{% raw %}...{% endraw %}",
  },
  {
    name: "endraw",
    requiresClosing: false,
    syntax: "{% endraw %}",
  },

  // Shopify-specific
  {
    name: "form",
    requiresClosing: true,
    syntax: '{% form "form_type" %}...{% endform %}',
  },
  {
    name: "endform",
    requiresClosing: false,
    syntax: "{% endform %}",
  },
  {
    name: "section",
    requiresClosing: false,
    syntax: "{% section 'section-name' %}",
  },
  {
    name: "style",
    requiresClosing: true,
    syntax: "{% style %}...{% endstyle %}",
  },
  {
    name: "schema",
    requiresClosing: true,
    syntax: "{% schema %}...{% endschema %}",
  },
  {
    name: "endschema",
    requiresClosing: false,
    syntax: "{% endschema %}",
  },
  {
    name: "javascript",
    requiresClosing: true,
    syntax: "{% javascript %}...{% endjavascript %}",
  },
  {
    name: "endjavascript",
    requiresClosing: false,
    syntax: "{% endjavascript %}",
  },
  {
    name: "stylesheet",
    requiresClosing: true,
    syntax: "{% stylesheet %}...{% endstylesheet %}",
  },
  {
    name: "endstylesheet",
    requiresClosing: false,
    syntax: "{% endstylesheet %}",
  },
  {
    name: "layout",
    requiresClosing: false,
    syntax: "{% layout 'layout-name' %}",
  },
  {
    name: "render",
    requiresClosing: false,
    syntax: "{% render 'snippet-name' %}",
  },
  {
    name: "include",
    requiresClosing: false,
    syntax: "{% include 'snippet-name' %}",
  },
];
