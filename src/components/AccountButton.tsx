"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogIn, LogOut, Settings, ChevronDown, Shield } from "lucide-react";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gestionnaire",
  USER: "Utilisateur",
};

export default function AccountButton() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpen(false);
    setLoggingOut(false);
    router.push("/login");
    router.refresh();
  }

  // Still loading
  if (user === undefined) {
    return <div className="size-7 rounded-full bg-background-subtle animate-pulse" />;
  }

  // Logged out
  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
      >
        <LogIn className="size-3.5" />
        Connexion
      </Link>
    );
  }

  // Logged in
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md hover:bg-background-subtle transition-colors group"
        title={user.name}
      >
        {/* Avatar */}
        <div className="size-6 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary leading-none">
            {getInitials(user.name)}
          </span>
        </div>
        <span className="text-[13px] font-medium text-foreground max-w-[96px] truncate hidden sm:block">
          {user.name.split(" ")[0]}
        </span>
        <ChevronDown
          className={`size-3 text-foreground-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-60 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-border bg-background-subtle">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">
                  {getInitials(user.name)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-foreground-muted truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground-muted bg-background rounded-full px-2 py-0.5 border border-border">
                <Shield className="size-2.5" />
                {roleLabels[user.role] ?? user.role}
              </span>
            </div>
          </div>

          {/* Menu items */}
          <div className="p-1">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-background-subtle transition-colors"
            >
              <User className="size-4 text-foreground-muted" />
              Mon compte
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-background-subtle transition-colors"
            >
              <Settings className="size-4 text-foreground-muted" />
              Paramètres
            </Link>
          </div>

          {/* Logout */}
          <div className="p-1 border-t border-border">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger-subtle transition-colors disabled:opacity-50"
            >
              <LogOut className="size-4" />
              {loggingOut ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
