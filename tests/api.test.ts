// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { POST as authPOST } from "@/app/api/auth/route";
import { POST } from "@/app/api/learning/answer/route";
import { input, canonicalQuiz } from "./fixtures";
import { getSupabaseConfig } from "@/lib/supabase/config";
const clientMock = vi.mocked(createSupabaseServerClient);
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/learning/answer", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("trusted answer API", () => {
  it("rejects forged scores, invalid options, cross-origin posts and malformed JSON", async () => {
    clientMock.mockResolvedValue(null);
    expect((await POST(request({ ...input, score: 100, isCorrect: true }))).status).toBe(400);
    expect((await POST(request({ ...input, optionId: "missing-option" }))).status).toBe(400);
    expect((await POST(request(input, "https://other.example"))).status).toBe(403);
    const malformed = new Request("http://localhost:3000/api/learning/answer", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: "{",
    });
    expect((await POST(malformed)).status).toBe(400);
  });
  it("grades preview on the server and reveals only the submitted question answer key", async () => {
    clientMock.mockResolvedValue(null);
    const response = await POST(request(input));
    const result = await response.json();
    expect(result).toMatchObject({
      mode: "preview",
      response: { isCorrect: true, questionId: input.questionId, correctOptionId: input.optionId },
    });
    expect(JSON.stringify(result)).not.toContain(canonicalQuiz.questions[1]!.explanation.en);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("does not downgrade an authentication outage to preview or discard the submission", async () => {
    clientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: { name: "AuthRetryableFetchError" } }),
      },
    } as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("not been discarded"),
    });
  });
  it("accepts the browser host when Next normalizes the internal request URL", async () => {
    clientMock.mockResolvedValue(null);
    const local = new Request("http://localhost:3000/api/learning/answer", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    expect((await POST(local)).status).toBe(200);
  });
  it("allows reauthentication after an invalid session without hiding a network outage", async () => {
    clientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { name: "AuthApiError", code: "session_not_found" },
        }),
      },
    } as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);
    const result = await POST(request(input));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ mode: "preview" });
  });
  it("validates authentication submissions and creates a confirmation callback on the actual app host", async () => {
    const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
    clientMock.mockResolvedValue({ auth: { signUp } } as unknown as NonNullable<
      Awaited<ReturnType<typeof createSupabaseServerClient>>
    >);
    expect(
      (
        await authPOST(
          request({ action: "signup", email: "learner@example.test", password: "short" }),
        )
      ).status,
    ).toBe(400);
    expect(signUp).not.toHaveBeenCalled();
    const signup = new Request("http://localhost:3000/api/auth", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "signup",
        email: "learner@example.test",
        password: "a-test-password",
      }),
    });
    const result = await authPOST(signup);
    expect(await result.json()).toMatchObject({ signedIn: false, confirmationRequired: true });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: "http://127.0.0.1:3000/auth/callback" },
      }),
    );
  });
  it("requires both configuration variables and allows explicit no-credentials preview", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabaseConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    expect(() => getSupabaseConfig()).toThrow("both");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
    expect(getSupabaseConfig()).toMatchObject({ url: "https://test.supabase.co" });
  });
});
