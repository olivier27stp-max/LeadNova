"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Eye, EyeOff, UserPlus, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Redirect if already logged in
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) router.replace("/"); })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la création du compte");
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

  if (checkingAuth) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const passwordStrong = password.length >= 8;

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-10">
      <div className="w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 p-3 bg-primary/10 rounded-2xl border border-primary/20">
            <Logo variant="icon" size={36} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Lead</span>
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Nova</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-1">Créez votre compte gratuitement</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Nom complet
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Tremblay"
                required
                autoFocus
                autoComplete="name"
              />
            </div>

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
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
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
              <div className="flex items-center gap-1.5 mt-1.5">
                {password.length === 0 ? (
                  <p className="text-xs text-foreground-muted">Minimum 8 caractères</p>
                ) : passwordStrong ? (
                  <p className="text-xs text-success flex items-center gap-1">
                    <CheckCircle2 className="size-3" />Mot de passe valide
                  </p>
                ) : (
                  <p className="text-xs text-warning">Encore {8 - password.length} caractère(s) requis</p>
                )}
              </div>
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
              disabled={loading || !email || !password || !name || !passwordStrong}
            >
              <UserPlus className="size-4" />
              {loading ? "Création du compte…" : "Créer mon compte"}
            </Button>
          </form>

          <div className="text-center pt-1 border-t border-border">
            <p className="text-sm text-foreground-muted">
              Déjà un compte ?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Se connecter
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-foreground-muted mt-6">
          LeadNova — Plateforme de prospection B2B
        </p>
      </div>
    </div>
  );
}
