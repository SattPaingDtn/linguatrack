import type { Metadata } from "next";
import { PageHeading } from "@/components/shared/page-heading";
import { DemoNotice } from "@/components/shared/demo-notice";
import { PracticeStudio } from "@/components/exercises/practice-studio";
export const metadata: Metadata = { title: "Practice studio" };
export default function PracticePage() {
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE PRACTICE GOES A LONG WAY"
        title="Make it second nature."
        description="Choose a skill and revisit a small exercise from the A1 sample chapter."
      />
      <DemoNotice />
      <PracticeStudio />
    </>
  );
}
