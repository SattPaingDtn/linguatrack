import {
  BookOpen,
  Headphones,
  Mic,
  PenLine,
  Languages,
  SpellCheck,
  type LucideIcon,
} from "lucide-react";
import type { LearningArea } from "@/lib/curriculum/schema";
import { cn } from "@/lib/utils";
export const areaIcons: Record<LearningArea, LucideIcon> = {
  listening: Headphones,
  speaking: Mic,
  reading: BookOpen,
  writing: PenLine,
  grammar: SpellCheck,
  vocabulary: Languages,
};
export const areaColors: Record<LearningArea, string> = {
  listening: "bg-[#e9edf9] text-[#4f6295]",
  speaking: "bg-[#f7e9de] text-[#97582e]",
  reading: "bg-[#e4efdf] text-[#426438]",
  writing: "bg-[#eee7f5] text-[#71548d]",
  grammar: "bg-[#e6ece5] text-[#466348]",
  vocabulary: "bg-[#faf0d8] text-[#796023]",
};
export function SkillBadge({ area }: { area: LearningArea }) {
  const Icon = areaIcons[area];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium capitalize",
        areaColors[area],
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {area}
    </span>
  );
}
