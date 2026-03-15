"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import ActivityBell from "@/components/ActivityBell";
import AccountButton from "@/components/AccountButton";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";

const NAV_ITEMS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/prospects", label: "Prospects", icon: Users },
  { href: "/campaigns", label: "Campagnes", icon: Megaphone },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export default function Header() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [unsubscribeCount, setUnsubscribeCount] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/blacklist?count=true")
      .then((r) => r.json())
      .then((d) => { if (d.count != null) setUnsubscribeCount(d.count); })
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
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-40 bg-card/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-12 px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <Logo variant="icon" size={24} />
            <span className="text-sm font-semibold text-foreground tracking-tight">
              Free Leads
            </span>
          </Link>

          <div className="flex items-center gap-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors",
                  isActive(href)
                    ? "text-foreground bg-background-muted"
                    : "text-foreground-muted hover:text-foreground hover:bg-background-subtle"
                )}
              >
                <span className="relative inline-flex">
                  <Icon className="size-3.5" />
                  {href === "/settings" && unsubscribeCount > 0 && (
                    <span className="absolute -top-[5px] -right-[7px] min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none ring-[1.5px] ring-card/80 pointer-events-none">
                      {unsubscribeCount > 9 ? "9+" : unsubscribeCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <WorkspaceSwitcher />
          <button
            onClick={cycleTheme}
            className="p-2 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
            title={
              mounted
                ? `Thème: ${theme === "system" ? "Auto" : theme === "light" ? "Clair" : "Sombre"}`
                : "Thème"
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
