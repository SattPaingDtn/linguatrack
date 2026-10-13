// Public routing metadata only. Each chapter remains pinned to its own inactive draft.
export const MANUSCRIPT_CHAPTERS = [
  {
    number: 4,
    id: "a1-chapter-4",
    slug: "home-neighborhood",
    version: "1.6.0",
    lessonIds: [
      "a1-c4-home-words",
      "a1-c4-there-is-and-place",
      "a1-c4-home-scripts",
      "a1-c4-describe-your-home",
      "a1-c4-my-new-room",
      "a1-c4-write-about-home",
      "a1-c4-review",
    ],
  },
  {
    number: 5,
    id: "a1-chapter-5",
    slug: "food-drinks-shopping",
    version: "1.7.0",
    lessonIds: [
      "a1-c5-food-words",
      "a1-c5-quantities-and-orders",
      "a1-c5-shopping-scripts",
      "a1-c5-order-and-shop",
      "a1-c5-a-shopping-list",
      "a1-c5-write-an-order",
      "a1-c5-review",
    ],
  },
  {
    number: 6,
    id: "a1-chapter-6",
    slug: "work-study",
    version: "1.8.0",
    lessonIds: [
      "a1-c6-work-words",
      "a1-c6-can-and-requests",
      "a1-c6-work-scripts",
      "a1-c6-talk-about-work",
      "a1-c6-my-workday",
      "a1-c6-write-a-work-update",
      "a1-c6-review",
    ],
  },
] as const;
export function manuscriptAwaitsAudio(id: string) {
  return /^a1-c[456]-l[12]-[12]$/.test(id);
}
