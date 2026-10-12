import { previewAnswerSchema } from "@/lib/curriculum/preview/contracts";
import { gradePreviewAnswer, previewEnabled, PreviewError } from "@/lib/curriculum/preview/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers });
}
function localOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const origin = new URL(`${url.protocol}//${host}`);
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    request.headers.get("origin") === origin.origin
  );
}
export async function POST(request: Request) {
  // Production rejects even malformed/cross-origin requests before parsing or loading content.
  if (!previewEnabled()) return reply({ error: "Not found" }, 404);
  try {
    if (!localOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site")
      return reply({ error: "Preview grading requires a same-origin request on localhost." }, 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
      return reply({ error: "Send a JSON preview answer." }, 415);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing preview answer." }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        return reply({ error: "Preview answer is too large." }, 413);
      }
      chunks.push(chunk.value);
    }
    const parsed = previewAnswerSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (!parsed.success)
      return reply(
        {
          error:
            "Invalid preview answer. Submit only this draft's lesson, question revision and option.",
        },
        400,
      );
    return reply(await gradePreviewAnswer(parsed.data), 200);
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON preview answer." }, 400);
    if (error instanceof PreviewError) return reply({ error: error.message }, error.status);
    console.error(
      "Local curriculum preview could not be validated.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return reply(
      {
        error:
          "Preview draft could not be loaded or validated. Check the local 1.1.0–1.3.0 draft chain and retry. No answers were saved.",
      },
      503,
    );
  }
}
function unavailable() {
  return reply(
    { error: previewEnabled() ? "Use POST to check one preview answer." : "Not found" },
    previewEnabled() ? 405 : 404,
  );
}
export const GET = unavailable;
export const HEAD = unavailable;
export const OPTIONS = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;
