"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Logo } from "@/components/ui/logo";

type InviteState = "loading" | "accepting" | "success" | "already_member" | "error";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [state, setState] = useState<InviteState>("loading");
  const [workspaceName, setWorkspaceName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    acceptInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function acceptInvite() {
    setState("accepting");
    try {
      const res = await fetch("/api/workspaces/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (res.status === 401) {
        // Not logged in — redirect to login then back here
        router.push(`/login?redirect=/invite/${token}`);
        return;
      }

      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error || "Erreur inconnue");
        return;
      }

      setWorkspaceName(data.workspace?.name || "");

      if (data.alreadyMember) {
        setState("already_member");
      } else {
        setState("success");
      }

      // Redirect to dashboard after 3 seconds
      setTimeout(() => router.push("/"), 3000);
    } catch {
      setState("error");
      setErrorMsg("Impossible de contacter le serveur");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex justify-center">
          <Logo variant="icon" size={40} />
        </div>

        {state === "loading" || state === "accepting" ? (
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-foreground-secondary text-sm">
              Acceptation de l&apos;invitation en cours…
            </p>
          </div>
        ) : state === "success" ? (
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Bienvenue !
            </h2>
            <p className="text-foreground-secondary text-sm">
              Vous avez rejoint l&apos;espace de travail <span className="font-medium text-foreground">{workspaceName}</span>.
            </p>
            <p className="text-xs text-foreground-muted">Redirection automatique…</p>
          </div>
        ) : state === "already_member" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              Déjà membre
            </h2>
            <p className="text-foreground-secondary text-sm">
              Vous faites déjà partie de <span className="font-medium text-foreground">{workspaceName}</span>.
            </p>
            <p className="text-xs text-foreground-muted">Redirection automatique…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Invitation invalide
            </h2>
            <p className="text-foreground-secondary text-sm">{errorMsg}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Aller à la page de connexion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
