import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/curriculum/a1-preview/server", () => ({ getA1Catalog: vi.fn() }));
vi.mock("@/lib/curriculum/manuscript-preview/server", () => ({ getManuscriptCatalog: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
}));
import { getA1Catalog } from "@/lib/curriculum/a1-preview/server";
import { getManuscriptCatalog } from "@/lib/curriculum/manuscript-preview/server";
import Picker from "@/app/dev/a1/page";
afterEach(() => vi.unstubAllEnvs());
it("keeps Chapters 1–3 usable when optional later drafts cannot load", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.mocked(getA1Catalog).mockResolvedValue(
    [1, 2, 3].map((n) => ({
      id: `chapter-${n}`,
      order: n,
      title: { en: `Chapter ${n}`, my: "အခန်း" },
      lessonCount: n === 1 ? 8 : 7,
      path: `/dev/chapter-${n}`,
      version: "1.5.0",
    })),
  );
  vi.mocked(getManuscriptCatalog).mockRejectedValue(new Error("missing optional draft"));
  render(await Picker());
  expect(screen.getByRole("link", { name: /Start learning/ })).toHaveAttribute(
    "href",
    "/dev/chapters/a1-chapter-1",
  );
  expect(screen.getByRole("link", { name: "Chapter 3" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(/Chapters 1–3 remain available/);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("keeps the picker disabled in production before reading content", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(getA1Catalog).mockClear();
  await expect(Picker()).rejects.toThrow("404");
  expect(getA1Catalog).not.toHaveBeenCalled();
});
