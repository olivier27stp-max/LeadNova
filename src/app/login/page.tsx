"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  // "login" or "setup" (first-time account creation)
  const [mode, setMode] = useState<"login" | "setup" | "loading">("loading");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) { router.replace("/"); return; }
        // Check if any users exist
        return fetch("/api/auth/setup").then((r) => r.json());
      })
      .then((d) => {
        if (d) setMode(d.hasUsers ? "login" : "setup");
      })
      .catch(() => setMode("login"));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = mode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const body = mode === "setup"
        ? { name, email, password }
        : { email, password };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "loading") {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isSetup = mode === "setup";

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-10">
      <div className="w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 p-3 bg-primary/10 rounded-2xl border border-primary/20">
            <Logo variant="icon" size={36} />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Free Leads</h1>
          <p className="text-sm text-foreground-muted mt-1">
            {isSetup ? "Créez votre compte administrateur" : "Connectez-vous à votre compte"}
          </p>
        </div>

        {/* Setup notice */}
        {isSetup && (
          <div className="mb-4 flex items-start gap-2 bg-primary-subtle border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
            <UserPlus className="size-4 shrink-0 mt-0.5" />
            <span>Aucun compte détecté. Créez le premier compte — il sera administrateur.</span>
          </div>
        )}

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSetup && (
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Nom complet
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Olivier Tremblay"
                  required
                  autoFocus
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Adresse email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                autoFocus={!isSetup}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                {isSetup ? "Mot de passe" : "Mot de passe"}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {isSetup && (
                <p className="text-xs text-foreground-muted mt-1">Minimum 8 caractères</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2.5">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loading || !email || !password || (isSetup && !name)}
            >
              {isSetup ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
              {loading
                ? isSetup ? "Création…" : "Connexion…"
                : isSetup ? "Créer mon compte" : "Se connecter"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-foreground-muted mt-6">
          Vision Lavage Inc. — Accès réservé au personnel autorisé
        </p>
      </div>
    </div>
  );
}
