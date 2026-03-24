"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, Bot, UserRound, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/LanguageProvider";

type SupportView = "menu" | "ai-chat" | "human";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function SupportButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SupportView>("menu");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function handleOpen() {
    setOpen(!open);
    if (!open) setView("menu");
  }

  async function handleSendChat() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
      } else {
        setChatMessages([...newMessages, { role: "assistant", content: t("support", "chatError") }]);
      }
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: t("support", "chatError") }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="p-2 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
        title={t("support", "title")}
      >
        <HelpCircle className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-card border border-border rounded-xl shadow-lg animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              {view === "menu" && t("support", "title")}
              {view === "ai-chat" && t("support", "aiChat")}
              {view === "human" && t("support", "talkToHuman")}
            </h3>
            <div className="flex items-center gap-1">
              {view !== "menu" && (
                <button
                  onClick={() => setView("menu")}
                  className="p-1 rounded text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors text-xs"
                >
                  {t("common", "back")}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Menu view */}
          {view === "menu" && (
            <div className="p-3 space-y-2">
              <button
                onClick={() => {
                  setView("ai-chat");
                  if (chatMessages.length === 0) {
                    setChatMessages([{ role: "assistant", content: t("support", "aiWelcome") }]);
                  }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-background-subtle transition-colors text-left group"
              >
                <div className="flex items-center justify-center size-10 rounded-lg bg-primary-subtle text-primary group-hover:scale-105 transition-transform">
                  <Bot className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t("support", "aiChat")}</p>
                  <p className="text-xs text-foreground-muted">{t("support", "aiChatDesc")}</p>
                </div>
              </button>

              <button
                onClick={() => setView("human")}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-background-subtle transition-colors text-left group"
              >
                <div className="flex items-center justify-center size-10 rounded-lg bg-success-subtle text-success group-hover:scale-105 transition-transform">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t("support", "talkToHuman")}</p>
                  <p className="text-xs text-foreground-muted">{t("support", "talkToHumanDesc")}</p>
                </div>
              </button>
            </div>
          )}

          {/* AI Chat view */}
          {view === "ai-chat" && (
            <div className="flex flex-col h-80">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "ml-auto bg-primary text-white"
                        : "bg-background-subtle text-foreground"
                    )}
                  >
                    {msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="bg-background-subtle text-foreground-muted rounded-lg px-3 py-2 text-sm max-w-[85%] animate-pulse">
                    {t("support", "thinking")}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-border p-2 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                  placeholder={t("support", "chatPlaceholder")}
                  className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-2 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Human contact view */}
          {view === "human" && (
            <div className="p-4 space-y-4">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center size-12 rounded-full bg-success-subtle text-success mx-auto">
                  <UserRound className="size-6" />
                </div>
                <p className="text-sm text-foreground">{t("support", "humanMessage")}</p>
              </div>
              <a
                href="mailto:support@leadnova.io"
                className="flex items-center justify-center w-full text-sm font-medium py-2.5 rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                {t("support", "emailUs")}
              </a>
              <p className="text-xs text-foreground-muted text-center">{t("support", "responseTime")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
