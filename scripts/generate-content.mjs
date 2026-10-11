import { readFile, writeFile } from "node:fs/promises";
const canonical = JSON.parse(
  await readFile(new URL("../src/content/v1/curriculum.json", import.meta.url), "utf8"),
);
const safe = structuredClone(canonical);
for (const course of safe.courses)
  for (const chapter of course.chapters)
    for (const lesson of chapter.lessons)
      for (const block of lesson.blocks)
        if (block.type === "quiz")
          for (const question of block.questions) {
            delete question.correctOptionId;
            delete question.explanation;
          }
const output = JSON.stringify(safe, null, 2) + "\n";
const publicPath = new URL("../src/content/public/v1/curriculum.json", import.meta.url);
const rows = canonical.courses.flatMap((course) =>
  course.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({
      version: canonical.contentVersion,
      lessonId: lesson.id,
      href: `/courses/${course.slug}/chapters/${chapter.slug}/lessons/${lesson.slug}`,
      blockIds: lesson.blocks.map((b) => b.id),
      quizzes: lesson.blocks.filter((b) => b.type === "quiz"),
    })),
  ),
);
const escaped = JSON.stringify(rows).replaceAll("'", "''");
const sql = `-- Generated immutable curriculum release ${canonical.contentVersion}. Do not edit published versions.\ninsert into private.lesson_catalog(content_version, lesson_id, href, block_ids, quizzes)\nselect '${canonical.contentVersion}', item->>'lessonId', item->>'href',\n  array(select jsonb_array_elements_text(item->'blockIds')), item->'quizzes'\nfrom jsonb_array_elements('${escaped}'::jsonb) item;\n`;
const seedPath = new URL(
  "../supabase/migrations/20261011000200_curriculum_v1.sql",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if ((await readFile(publicPath, "utf8")) !== output || (await readFile(seedPath, "utf8")) !== sql)
    throw new Error("Generated curriculum drift. Run npm run content:generate.");
} else {
  await writeFile(publicPath, output);
  await writeFile(seedPath, sql);
}
