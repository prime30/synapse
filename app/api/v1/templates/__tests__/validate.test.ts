import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock requireAuth before importing the route handler
vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue("user-123"),
}));

import { POST } from "../validate/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/templates/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response) {
  return response.json();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/v1/templates/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when template is missing", async () => {
    const req = buildRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);

    const json = await parseResponse(res);
    expect(json.error).toContain("template is required");
  });

  it("returns 400 when template is an empty string", async () => {
    const req = buildRequest({ template: "   " });
    const res = await POST(req);

    expect(res.status).toBe(400);

    const json = await parseResponse(res);
    expect(json.error).toContain("template is required");
  });

  it("returns valid: true for a correct Liquid template", async () => {
    const req = buildRequest({
      template: "{% if product %}{{ product.title | escape }}{% endif %}",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);

    const json = await parseResponse(res);
    expect(json.data.valid).toBe(true);
    expect(json.data.errors).toHaveLength(0);
  });

  it("returns valid: false for a template with syntax errors", async () => {
    const req = buildRequest({
      template: "{% if product %}{{ product.title }}",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);

    const json = await parseResponse(res);
    expect(json.data.valid).toBe(false);
    expect(json.data.errors.length).toBeGreaterThan(0);
  });

  it("accepts an optional project_id", async () => {
    const req = buildRequest({
      template: "{{ product.title }}",
      project_id: "proj-abc",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);

    const json = await parseResponse(res);
    expect(json.data).toBeDefined();
    expect(json.data.valid).toBeDefined();
  });
});
