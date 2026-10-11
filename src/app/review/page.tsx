import type { Metadata } from "next";
import { PageHeading } from "@/components/shared/page-heading";
import { DemoNotice } from "@/components/shared/demo-notice";
import { ReviewHistory } from "@/components/progress/review-history";
export const metadata: Metadata = { title: "Review history" };
export default function ReviewPage() {
  return (
    <>
      <PageHeading
        eyebrow="LOOK BACK. MOVE FORWARD."
        title="Every try teaches you something."
        description="Revisit your quiz attempts and the explanations behind each answer."
      />
      <DemoNotice />
      <ReviewHistory />
    </>
  );
}
