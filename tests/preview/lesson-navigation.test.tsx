import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { buildLessonNavigation } from "@/lib/curriculum/preview/lesson-navigation";
import { LessonAvailability } from "@/components/preview/lesson-availability";
const lessons = ["one", "two", "three"].map((id) => ({
  id,
  slug: `lesson-${id}`,
  title: { en: id, my: "သင်ခန်းစာ" },
}));
it("uses exact public catalog order and slugs for previous/next links", () => {
  expect(buildLessonNavigation(lessons, "two", "/dev/a1/chapter")).toEqual({
    position: 2,
    total: 3,
    previous: { href: "/dev/a1/chapter/lesson-one", title: "one" },
    next: { href: "/dev/a1/chapter/lesson-three", title: "three" },
  });
});
it("does not fabricate lessons at either chapter boundary", () => {
  expect(buildLessonNavigation(lessons, "one", "/dev/chapter").previous).toBeUndefined();
  expect(buildLessonNavigation(lessons, "three", "/dev/chapter").next).toBeUndefined();
  expect(buildLessonNavigation(lessons.slice(0, 1), "one", "/dev/chapter")).toMatchObject({
    position: 1,
    total: 1,
    previous: undefined,
    next: undefined,
  });
});
it("rejects a missing lesson rather than directing a learner to unrelated content", () => {
  expect(() => buildLessonNavigation(lessons, "unknown", "/dev/chapter")).toThrow(/missing/);
});
it("projects only navigation metadata even if supplied extra fields", () => {
  const input = lessons.map((l) => ({ ...l, privateAnswer: "NEVER_SEND", revision: 4 }));
  expect(JSON.stringify(buildLessonNavigation(input, "two", "/dev/chapter"))).not.toMatch(
    /NEVER_SEND|revision|privateAnswer/,
  );
});
it.each(["a1-c1-meet-colleagues", "a1-c2-family-scripts", "a1-c3-routine-scripts"])(
  "labels %s as studyable with unavailable listening checks",
  (id) => {
    render(<LessonAvailability id={id} areas={["listening"]} />);
    expect(screen.getByText(/Available to study/)).toBeVisible();
    expect(screen.getByText(/Audio pending/)).toHaveTextContent(/checks unavailable/);
  },
);
it("does not call the original introduction audio pending", () => {
  render(<LessonAvailability id="a1-c1-introductions" areas={["listening"]} />);
  expect(screen.queryByText(/Audio pending/)).not.toBeInTheDocument();
});
it("labels writing and speaking as ungraded without completion claims", () => {
  render(<LessonAvailability id="writing" areas={["writing"]} />);
  expect(screen.getByText(/ungraded self-practice/)).toBeVisible();
});
