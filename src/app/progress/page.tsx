import type { Metadata } from "next";
import { PageHeading } from "@/components/shared/page-heading";
import { DemoNotice } from "@/components/shared/demo-notice";
import { ProgressOverview } from "@/components/progress/progress-overview";
export const metadata: Metadata = { title: "My progress" };
export default function ProgressPage() {
  return (
    <>
      <PageHeading
        eyebrow="NOTICE THE SMALL WINS"
        title="See how far you’ve come."
        description="Your completed lessons, study activity, and the evidence from your quiz answers."
      />
      <DemoNotice />
      <ProgressOverview />
    </>
  );
}
