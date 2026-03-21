"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityDropdownProps {
  value: string;
  onChange: (value: string) => void;
  cities: string[];
  placeholder?: string;
  className?: string;
}

export function CityDropdown({ value, onChange, cities, placeholder = "Ville", className }: CityDropdownProps) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  // ── Compute position from trigger rect ──
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    const pop = popoverRef.current;
    if (!el || !pop) return;
    const r = el.getBoundingClientRect();
    const h = pop.scrollHeight;
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const goUp = below < h + 8 && above > below;
    setStyle({
      position: "fixed",
      left: r.left,
      top: goUp ? r.top - h - 4 : r.bottom + 4,
      minWidth: Math.max(r.width, 200),
      zIndex: 9999,
    });
    setReady(true);
  }, []);

  // ── Open lifecycle ──
  useEffect(() => {
    if (!open) { setReady(false); return; }
    // Wait one frame for the popover to mount, then measure
    const id = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(id);
  }, [open, reposition]);

  // ── Reposition on scroll or resize ──
  useEffect(() => {
    if (!open) return;
    const onScroll = () => requestAnimationFrame(reposition);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, reposition]);

  // ── Close on outside click ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // ── Prevent wheel from leaking to page/table ──
  useEffect(() => {
    if (!open) return;
    const el = popoverRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Find the scrollable list inside
      const list = el.querySelector("[data-citylist]") as HTMLElement | null;
      if (!list) { e.preventDefault(); e.stopPropagation(); return; }

      const max = list.scrollHeight - list.clientHeight;
      if (max <= 0) { e.preventDefault(); e.stopPropagation(); return; }

      // Only block at boundaries
      if (e.deltaY < 0 && list.scrollTop <= 0) e.preventDefault();
      else if (e.deltaY > 0 && list.scrollTop >= max - 1) e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [open]);

  function pick(city: string) { onChange(city); setOpen(false); }
  function clear(e: React.MouseEvent) { e.stopPropagation(); onChange(""); }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-flex items-center gap-1 font-medium text-xs uppercase tracking-wide",
          "cursor-pointer transition-colors select-none",
          value ? "text-primary hover:text-primary/80" : "text-foreground-muted hover:text-foreground",
          className
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        {value ? (
          <X className="size-3.5 shrink-0 hover:text-danger transition-colors" onClick={clear} />
        ) : (
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150", open && "rotate-180")} />
        )}
      </button>

      {open && createPortal(
        <div ref={popoverRef} style={ready ? style : { position: "fixed", top: -9999, left: -9999, zIndex: 9999, minWidth: 200 }}>
          <div className="rounded-md border border-border bg-card shadow-lg overflow-hidden">
            {/* Reset */}
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm cursor-pointer",
                "hover:bg-primary-subtle transition-colors",
                !value && "text-primary font-medium"
              )}
              onMouseDown={(e) => { e.preventDefault(); pick(""); }}
            >
              <span>Toutes les villes</span>
              {!value && <Check className="size-3.5 text-primary" />}
            </div>

            {cities.length > 0 && <div className="border-t border-border" />}

            {/* List */}
            <div data-citylist className="max-h-[240px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
              {cities.map(city => (
                <div
                  key={city}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-sm cursor-pointer",
                    "hover:bg-primary-subtle transition-colors",
                    value === city && "text-primary font-medium bg-primary-subtle/50"
                  )}
                  onMouseDown={(e) => { e.preventDefault(); pick(city); }}
                >
                  <span className="truncate">{city}</span>
                  {value === city && <Check className="size-3.5 shrink-0 text-primary" />}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
