import type { Metadata } from "next";
import { AccountForm } from "@/components/auth/account-form";
import { PageHeading } from "@/components/shared/page-heading";
export const metadata: Metadata = { title: "Your account" };
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeading
        eyebrow="YOUR LEARNING SPACE"
        title="A little progress, kept for you."
        description="One account for your learning history, wherever you practise."
      />
      <AccountForm confirmationFailed={params.confirmation === "failed"} />
    </>
  );
}
