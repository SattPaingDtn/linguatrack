import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocalStudyEntry } from "@/components/preview/local-study-entry";
afterEach(() => vi.unstubAllEnvs());
it("links the development dashboard to the chapter picker with an unsaved notice", () => {
  vi.stubEnv("NODE_ENV", "development");
  render(<LocalStudyEntry />);
  expect(screen.getByRole("link", { name: "Study A1 lessons" })).toHaveAttribute("href", "/dev/a1");
  expect(screen.getByText(/Preview answers and progress are not saved/)).toBeVisible();
});
it("renders no preview entry in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  const { container } = render(<LocalStudyEntry />);
  expect(container).toBeEmptyDOMElement();
});
