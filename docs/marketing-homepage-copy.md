# Synapse Marketing Homepage Copy

## Section 1: HERO

**Badge text:** Built for the way you actually ship

**H1 headline:** The Shopify theme IDE that thinks alongside you

**Subtitle:** Open a template, type `{{ product.` and watch `.title`, `.price`, `.variants` appear before you finish the thought. Five AI specialists, full Liquid intelligence, live preview — all in the browser, no setup.

**Primary CTA button text:** Start building free

**Secondary CTA text:** See it in action

**Below-CTA trust line:** No credit card. Connect your store or start from a blank theme.

---

## Section 2: LOGO BAR

**Intro text above logos:** The stack you already trust

**Logos/brands to show (and why):**
- Shopify — the platform Synapse is built for
- Supabase — powers auth, real-time comments, and offline queue
- Claude / OpenAI / Gemini — the models behind the specialist agents (or "Powered by Claude, GPT-4o, Gemini")
- Vercel — if hosting/edge is used; otherwise skip
- Next.js — if the app is built on it; technical audience appreciates seeing the stack

**Rationale:** "Powered by" and "built with" signals to the developer audience that Synapse sits on solid, modern infrastructure. It's not vapor — it's built on the same tools they use daily.

---

## Section 3: PROBLEM

**Badge text:** Sound familiar?

**Headline:** You shouldn't have to context-switch to figure out what's in `product`

**Pain point 1:**
- **Before:** You're in VS Code, mid-flow. You type `{{ product.` and... nothing. You cmd+click, no go-to-definition. You open the Shopify docs in another tab, scroll for the object reference, switch back. The flow is gone.
- **After:** You type `{{ product.` and the IDE knows. `.title`, `.price`, `.variants`, `.available` — completions appear as you type. Cmd+click takes you to the object reference. No tab switch.

**Pain point 2:**
- **Before:** You tweak a section in `sections/hero.liquid`. Save. Open your store in a new tab. Hard refresh. Wrong locale. Wrong viewport. Oh, and you forgot to test with a sold-out product. Ten minutes later, you're still clicking around.
- **After:** Change the file. The preview updates in the same window. Toggle locale. Resize to 375, 768, 1024. Swap in mock cart data, a discount, or a sold-out variant. All without leaving the IDE.

**Pain point 3:**
- **Before:** You're about to deploy. You hope you didn't break anything. You push to the theme, cross your fingers, and wait for the first bug report. Or worse — you spend an hour manually spotting potential issues before you even hit publish.
- **After:** You hit deploy. A quick rule-based scan runs first. Passes. Then the AI review agent reads your changes, checks for Liquid gotchas, performance hits, accessibility. You get a clear go/no-go. If you're on a team, the request goes to an admin. You ship with confidence.

---

## Section 4: SOLUTION / VALUE PROPS

**Badge text:** Built for the flow

**Headline:** An IDE that meets you where you work

**Subtitle:** Every feature is designed for one thing: keep you in the zone. No context switches, no hunting for docs, no guessing.

**Value prop 1:**
- **Icon suggestion:** Code bracket or completion cursor
- **Title:** Liquid that actually understands Liquid
- **Description:** Type `{{ product.` and watch object-aware completions appear — `.title`, `.price`, `.variants`, `.available`. Go-to-definition works. The IDE knows which variables are unused. Auto-close tags and formatting handle the busywork. It's not a generic text editor with syntax highlighting; it's Liquid-aware.

**Value prop 2:**
- **Icon suggestion:** Split pane or preview window
- **Title:** Preview that matches reality
- **Description:** Change a file and the preview updates instantly. Toggle locale. Resize to 375, 768, 1024, or full. Drop in mock customer data, cart contents, discounts — test edge cases without leaving the editor. What you see is what you ship.

**Value prop 3:**
- **Icon suggestion:** Robot or agent icon
- **Title:** Five specialists, one chat
- **Description:** A PM agent for scope, a Liquid specialist for templates, CSS and JS specialists for styling and behavior, and a Review agent before deploy. Each routes to the right model — Claude, GPT-4o, Gemini. You ask in plain English; you get answers that know Shopify.

---

## Section 5: FEATURE DEEP-DIVE

**Badge text:** Under the hood

**Headline:** Built for the way you actually ship themes

**Feature pillar 1: Template Composer**
- Drag and reorder sections and blocks directly from `templates/*.json`
- No more hand-editing JSON to fix section order — it's a visual map of your template
- Add, remove, or reorder blocks without touching raw JSON
- See the structure of your theme at a glance, then tweak it in place

**Feature pillar 2: Quality & Deploy**
- Get a 0–100 performance score before you ship
- Run an accessibility scanner (8 rules) and fix issues inline
- Image optimization detector catches heavy assets before they hit production
- Two-tier deploy: quick rule-based scan, then full AI review — plus role-based approval for teams

**Feature pillar 3: Asset Browser & Metafields**
- Upload, delete, and drag-to-insert Liquid references from the asset browser
- Metafield CRUD with 16 type-aware form inputs — no guessing field types
- See what's in your theme, insert it where you need it, and move on
- Metafields stay in sync with your schema

**Feature pillar 4: Ambient Intelligence**
- Proactive nudges before you open chat — "This section might conflict with your responsive breakpoint"
- Spatial canvas: dependency graph with AI suggestion nodes
- Chromatic IDE: UI tints based on your theme's color palette
- Batch operations: fix all similar across files, batch undo — built for scale

---

## Section 6: HOW IT WORKS

**Headline:** From zero to shipped in three steps

**Step 1: Connect or start fresh**
- Open Synapse in your browser. Connect your Shopify store or start from a blank theme. No local env, no CLI, no config. You're in the IDE in seconds.

**Step 2: Build with intelligence**
- Edit Liquid, CSS, and JS with completions that know Shopify objects. Use the template composer to reorder sections. Tweak in the preview. Ask the specialists when you're stuck. Everything stays in one place.

**Step 3: Deploy with confidence**
- Run the pre-flight: quick scan, then AI review. If you're on a team, request deploy; an admin approves. Push to your theme. Done.

---

## Section 7: SOCIAL PROOF / METRICS

**Metric cards (product facts, not testimonials):**

1. **5 specialist agents** — PM, Liquid, CSS, JS, Review — each routed to the right model
2. **40+ Shopify object completions** — product, collection, cart, customer, and more
3. **16 metafield input types** — type-aware forms for every metafield definition
4. **8 accessibility rules** — scanned before you deploy
5. **0–100 performance score** — know where you stand before publish

---

## Section 8: FAQ (Objection Handling)

**Headline:** Questions we get a lot

**Q: Do I need to install anything?**
A: No. Synapse runs in the browser. Connect your store, open a theme, and start editing. No local setup, no CLI, no Node version to manage.

**Q: What about my existing theme?**
A: Import it. Synapse works with any Shopify theme. Connect your store, pick the theme, and you're editing the same files you'd edit in the Shopify admin — with Liquid intelligence and live preview.

**Q: Is my store data safe?**
A: We use Shopify's official APIs. We don't store your product or customer data. Theme files sync through secure OAuth. Your data stays in your store.

**Q: Can my team use this?**
A: Yes. Role-based deploy approval lets members request deploys and admins approve. Inline comments with threaded replies live in Supabase — discussions stay next to the code.

**Q: What if I go offline?**
A: Changes queue locally. When you're back online, they sync. You keep working.

**Q: How does the AI compare to Cursor or Copilot?**
A: Synapse's agents are built for Shopify. They know Liquid objects, theme structure, and Shopify conventions. A generic AI can suggest code; our specialists suggest the right code for your store.

---

## Section 9: FINAL CTA

**Headline:** Stop context-switching. Start shipping.

**Subtitle:** The Shopify theme IDE that thinks alongside you. Five specialists, full Liquid intelligence, live preview — all in the browser.

**Primary CTA button text:** Start building free

**Trust line below button:** No credit card. Connect your store or start from a blank theme.

---

## Section 10: FOOTER

**Tagline:** The Shopify theme IDE that thinks alongside you.
