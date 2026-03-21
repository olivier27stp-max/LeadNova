"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useTranslation } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CalendarDays,
  Megaphone,
  Settings,
  StickyNote,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import ActivityBell from "@/components/ActivityBell";
import AccountButton from "@/components/AccountButton";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";

const NAV_KEYS = [
  { href: "/", labelKey: "dashboard" as const, icon: LayoutDashboard },
  { href: "/prospects", labelKey: "prospects" as const, icon: Users },
  { href: "/email-verifier", labelKey: "emailVerifier" as const, icon: ShieldCheck },
  { href: "/calendar", labelKey: "calendar" as const, icon: CalendarDays },
  { href: "/campaigns", labelKey: "campaigns" as const, icon: Megaphone },
  { href: "/settings", labelKey: "settings" as const, icon: Settings },
];

export default function Header() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [unsubscribeCount, setUnsubscribeCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/blacklist?count=true")
      .then((r) => r.json())
      .then((d) => { if (d.count != null) setUnsubscribeCount(d.count); })
      .catch(() => {});
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user?.role === "ADMIN") setIsAdmin(true); })
      .catch(() => {});
  }, []);

  function cycleTheme() {
    const next =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const ThemeIcon =
    !mounted || theme === "system"
      ? Monitor
      : resolvedTheme === "dark"
        ? Sun
        : Moon;

  // Hide header on auth pages
  if (["/login", "/register", "/forgot-password", "/reset-password"].some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  return (
    <nav className="sticky top-0 z-40 bg-card/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-12 px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <Logo variant="icon" size={22} />
            <span className="text-[15px] font-semibold tracking-tight">
              <span className="text-foreground">Lead</span>
              <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Nova</span>
            </span>
          </Link>

          <div className="flex items-center gap-0.5">
            {NAV_KEYS.map(({ href, labelKey, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors",
                  isActive(href)
                    ? "text-foreground bg-background-muted"
                    : "text-foreground-muted hover:text-foreground hover:bg-background-subtle"
                )}
              >
                <Icon className="size-3.5" />
                {t("nav", labelKey)}
                {href === "/settings" && unsubscribeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none ring-2 ring-card/80 pointer-events-none">
                    {unsubscribeCount > 99 ? "99+" : unsubscribeCount}
                  </span>
                )}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/notes"
                className={cn(
                  "relative flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors",
                  isActive("/notes")
                    ? "text-foreground bg-background-muted"
                    : "text-foreground-muted hover:text-foreground hover:bg-background-subtle"
                )}
              >
                <StickyNote className="size-3.5" />
                Notes
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <WorkspaceSwitcher />
          <button
            onClick={cycleTheme}
            className="p-2 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
            title={
              mounted
                ? `${t("nav", "theme")}: ${theme === "system" ? t("nav", "themeAuto") : theme === "light" ? t("nav", "themeLight") : t("nav", "themeDark")}`
                : t("nav", "theme")
            }
          >
            <ThemeIcon className="size-4" />
          </button>
          <ActivityBell />
          <div className="w-px h-5 bg-border mx-1" />
          <AccountButton />
        </div>
      </div>
    </nav>
  );
}
