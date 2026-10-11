"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Compass,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Sprout,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSession } from "@/components/progress/session-provider";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "My courses", icon: BookOpen },
  { href: "/practice", label: "Practice studio", icon: Compass },
  { href: "/review", label: "Review history", icon: RotateCcw },
  { href: "/progress", label: "My progress", icon: TrendingUp },
];
function Brand() {
  return (
    <Link href="/" aria-label="LinguaTrack Academy home" className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
        <Sprout size={23} aria-hidden="true" />
      </span>
      <span className="text-xl font-bold tracking-tight">
        LinguaTrack
        <span className="mt-0.5 block text-[9px] font-semibold tracking-[0.27em] text-muted-foreground">
          A C A D E M Y
        </span>
      </span>
    </Link>
  );
}
function SidebarContent({ close }: { close?: () => void }) {
  const { user, mode } = useSession();
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-8">
      <div className="px-2">
        <Brand />
      </div>
      <p className="eyebrow mb-3 mt-12 px-4">Your learning space</p>
      <nav aria-label="Main navigation" className="space-y-1.5">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={close}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-medium transition-colors hover:bg-[#e3e9dd]",
                active ? "bg-primary text-white hover:bg-primary/90" : "text-[#637064]",
              )}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
              {active && <span className="ml-auto size-1.5 rounded-full bg-[#bbd7a9]" />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-10">
        <div className="rounded-2xl border border-[#d5dfcf] bg-[#e6eddf] p-4">
          <span className="flex size-8 items-center justify-center rounded-full bg-white/70">
            <GraduationCap size={18} aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold">Small steps. Real growth.</p>
          <p className="mt-2 text-xs leading-relaxed text-[#56684e]">
            Make a little room for English in your everyday.
          </p>
          <Link
            href="/courses"
            onClick={close}
            className="mt-4 flex items-center gap-2 text-xs font-bold"
          >
            Explore your path <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <Link
          href="/account"
          onClick={close}
          className="mt-6 flex items-center gap-3 border-t border-[#dbe2d5] pt-5"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-[#d6e2cd] text-xs font-bold">
            YL
          </span>
          <div>
            <p className="text-xs font-semibold">Your learning journey</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {user
                ? "Account · saved progress"
                : mode === "loading"
                  ? "Loading account…"
                  : "Preview · sign in"}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mode } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current =
    navigation.find((item) => item.href !== "/" && pathname.startsWith(item.href))?.label ??
    (pathname.startsWith("/account") ? "Your account" : "Dashboard");
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 text-white focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[244px] border-r border-[#dce3d5] bg-[#eef2e8] lg:block">
        <SidebarContent />
      </aside>
      <div className="lg:ml-[244px]">
        <header className="flex h-[78px] items-center justify-between gap-3 border-b bg-background px-5 sm:px-9 xl:px-12">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  className="lg:hidden"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-[#eef2e8] p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  Your LinguaTrack learning pages
                </SheetDescription>
                <SidebarContent close={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="hidden text-xs text-muted-foreground sm:block">My workspace</span>
            <ChevronRight
              size={13}
              className="hidden text-muted-foreground sm:block"
              aria-hidden="true"
            />
            <span className="truncate text-xs font-medium">{current}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="rounded-full border bg-white px-3 py-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-orange" />
              PHASE 02 ·{" "}
              {mode === "persistent" ? "SAVED" : mode === "loading" ? "LOADING" : "PREVIEW"}
            </span>
            <span
              className="hidden size-8 items-center justify-center rounded-full bg-[#e5ebdc] text-[10px] font-bold sm:flex"
              aria-label="Your account"
            >
              YL
            </span>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1530px] px-5 pb-10 pt-8 outline-none sm:px-9 sm:pt-10 xl:px-12"
        >
          {children}
        </main>
        <footer className="mx-auto flex max-w-[1530px] flex-wrap justify-between gap-2 px-5 pb-6 text-[10px] text-muted-foreground sm:px-9 xl:px-12">
          <span>LinguaTrack Academy · A little English, every day.</span>
          <span>
            English + <span lang="my">မြန်မာ</span> · Content v1.0.0
          </span>
        </footer>
      </div>
    </div>
  );
}
