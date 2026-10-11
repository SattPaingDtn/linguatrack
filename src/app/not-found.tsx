import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <BookOpen className="mx-auto text-muted-foreground" size={38} aria-hidden="true" />
      <p className="eyebrow mt-6">PAGE NOT FOUND</p>
      <h1 className="mt-3 text-3xl font-semibold">Let’s find your learning path.</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This course, chapter, or lesson doesn’t exist.
      </p>
      <Button asChild className="mt-6">
        <Link href="/courses">Explore courses</Link>
      </Button>
    </div>
  );
}
