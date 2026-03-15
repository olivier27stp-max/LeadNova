"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordPageInner /></Suspense>;
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-10">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-foreground-secondary">Lien invalide.</p>
          <Link href="/login" className="text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 p-3 bg-primary/10 rounded-2xl border border-primary/20">
            <Logo variant="icon" size={36} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Lead</span>
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Nova</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-1">Nouveau mot de passe</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5">
          {success ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 bg-success-subtle rounded-full flex items-center justify-center">
                <CheckCircle2 className="size-6 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">Mot de passe modifié !</p>
              <p className="text-xs text-foreground-muted">Redirection vers la connexion…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
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
                <p className="text-xs text-foreground-muted mt-1">Minimum 8 caractères</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Confirmer le mot de passe
                </label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2.5">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={loading || !password || !confirm}>
                <KeyRound className="size-4" />
                {loading ? "Modification…" : "Modifier le mot de passe"}
              </Button>
            </form>
          )}

          <div className="text-center pt-1">
            <Link href="/login" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="size-3.5" />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
