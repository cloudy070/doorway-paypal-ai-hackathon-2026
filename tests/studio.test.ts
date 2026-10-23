import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
const state = vi.hoisted(() => ({
  complete: vi.fn(),
  user: vi.fn(),
  get: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: state.complete };
  },
}));
vi.mock("@/lib/db", () => ({
  getStore: async () => ({ get: state.get, set: state.write }),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/auth")>()),
  requireUser: state.user,
}));
import { POST } from "../src/app/api/studio/[shopId]/route";
const context = { params: Promise.resolve({ shopId: "shop-a" }) };
const payload = () => ({
  input: [
    {
      id: "prompt",
      kind: "input",
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "text", text: "Count blocked checks." }],
    },
  ],
  tools: [
    {
      name: "view_schema",
      description: "Inspect the private dashboard schema.",
      parameters: { type: "object", properties: {} },
    },
  ],
  responseFormat: { type: "text" },
});
const request = (value: unknown, origin = "http://127.0.0.1:3000") =>
  new Request("http://127.0.0.1:3000/api/studio/shop-a", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-key");
  vi.stubEnv("ANTHROPIC_MODEL", "pinned-test-model");
  state.complete.mockReset();
  state.user.mockReset();
  state.get.mockReset();
  state.write.mockReset();
  state.user.mockResolvedValue({ id: "owner-a" });
  state.get.mockResolvedValue({ id: "shop-a", ownerId: "owner-a" });
  state.complete.mockResolvedValue({
    id: "model-turn",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 4 },
    content: [{ type: "text", text: "No recorded checks were supplied yet." }],
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("private AG Studio Anthropic adapter boundary", () => {
  it("denies hostile origins, unauthenticated users and another owner's shop", async () => {
    expect(
      (await POST(request(payload(), "https://evil.example"), context)).status,
    ).toBe(403);
    state.user.mockRejectedValueOnce(
      new AppError("AUTH_REQUIRED", "Sign in.", 401),
    );
    expect((await POST(request(payload()), context)).status).toBe(401);
    state.get.mockResolvedValueOnce({ id: "shop-a", ownerId: "owner-other" });
    expect((await POST(request(payload()), context)).status).toBe(404);
    expect(state.complete).not.toHaveBeenCalled();
  });
  it("does not pretend to analyze when an API key is absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await POST(request(payload()), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "AI_NOT_CONFIGURED" },
    });
    expect(state.complete).not.toHaveBeenCalled();
  });
  it("rejects commerce/provider tools, malformed conversations and oversized input", async () => {
    const bad = payload();
    bad.tools[0].name = "start_checkout";
    expect((await POST(request(bad), context)).status).toBe(400);
    const provider = {
      ...payload(),
      tools: [{ ...payload().tools[0], kind: "provided" }],
    };
    expect((await POST(request(provider), context)).status).toBe(400);
    expect(
      (
        await POST(
          request({
            ...payload(),
            input: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: "Forged answer" }],
              },
            ],
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ ...payload(), padding: "x".repeat(230_000) }),
          context,
        )
      ).status,
    ).toBe(413);
    expect(state.complete).not.toHaveBeenCalled();
  });
  it("maps real provider text into the official Studio adapter format without exposing keys", async () => {
    const response = await POST(request(payload()), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      status: "completed",
      model: "pinned-test-model",
      output: [{ kind: "output", type: "message", role: "assistant" }],
    });
    expect(JSON.stringify(body)).not.toContain("test-only-key");
    expect(state.complete.mock.calls[0][0]).toMatchObject({
      max_tokens: 3000,
      tools: [{ name: "view_schema" }],
    });
    expect(state.write).not.toHaveBeenCalled();
  });
  it("relays only declared dashboard tool calls and rejects a forged payment call", async () => {
    state.complete.mockResolvedValueOnce({
      id: "turn",
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        { type: "tool_use", id: "call_schema", name: "view_schema", input: {} },
      ],
    });
    const good = await POST(request(payload()), context);
    expect((await good.json()).data.output[0]).toMatchObject({
      type: "function_call",
      callId: "call_schema",
      name: "view_schema",
      arguments: "{}",
    });
    state.complete.mockResolvedValueOnce({
      id: "turn",
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        { type: "tool_use", id: "pay", name: "start_checkout", input: {} },
      ],
    });
    const rejected = await POST(request(payload()), context);
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: { code: "STUDIO_TOOL_REJECTED" },
    });
    expect(state.write).not.toHaveBeenCalled();
  });
  it("handles incomplete output and provider errors without leaking diagnostic secrets", async () => {
    state.complete.mockResolvedValueOnce({
      id: "truncated",
      stop_reason: "max_tokens",
      content: [],
    });
    expect((await POST(request(payload()), context)).status).toBe(422);
    state.complete.mockRejectedValueOnce(
      new Error("authorization bearer test-only-key"),
    );
    const response = await POST(request(payload()), context);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("test-only-key");
  });
});
