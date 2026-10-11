import type { Metadata } from "next";
import { ArrowUpRight, BriefcaseBusiness, GraduationCap } from "lucide-react";
import { courses } from "@/lib/curriculum";
import { CourseCard } from "@/components/courses/course-card";
import { PageHeading } from "@/components/shared/page-heading";
import { DemoNotice } from "@/components/shared/demo-notice";
export const metadata: Metadata = { title: "My courses" };
export default function CoursesPage() {
  return (
    <>
      <PageHeading
        eyebrow="A PATH FOR EVERY POSSIBILITY"
        title="Make English part of your world."
        description="A clear path from A1 to C1. Practical English, thoughtfully explained in Burmese."
      />
      <DemoNotice />
      <div className="mb-5 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="section-title">General English</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Your foundation across all four skills.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          5 CEFR levels · 1 sample chapter available
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
      <section className="mt-8" aria-labelledby="future-tracks">
        <h2 id="future-tracks" className="section-title mb-4">
          New horizons, ahead
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "TOEIC preparation",
              description: "Focused listening and reading for your next career step.",
              icon: GraduationCap,
            },
            {
              title: "IT Business English",
              description: "Communicate clearly in standups, emails, and technical discussions.",
              icon: BriefcaseBusiness,
            },
          ].map(({ title, description, icon: Icon }) => (
            <div key={title} className="flex gap-4 rounded-xl border border-dashed p-5">
              <Icon size={23} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="eyebrow text-[9px]">FUTURE COURSE</p>
                <h3 className="mt-2 text-sm font-semibold">
                  {title}{" "}
                  <ArrowUpRight
                    size={12}
                    className="ml-1 inline text-muted-foreground"
                    aria-hidden="true"
                  />
                </h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
