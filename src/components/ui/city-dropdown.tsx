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
  const listRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  // ── Position popover relative to trigger ──
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

  // Mount → measure → show
  useEffect(() => {
    if (!open) { setReady(false); return; }
    const id = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(id);
  }, [open, reposition]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const h = () => requestAnimationFrame(reposition);
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, reposition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // ── Scroll isolation: handler directly on the scrollable list ──
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const h = (e: WheelEvent) => {
      const max = list.scrollHeight - list.clientHeight;
      if (max <= 0) {
        // List not scrollable — block so page doesn't scroll
        e.preventDefault();
      } else if (e.deltaY < 0 && list.scrollTop <= 0) {
        // At top, scrolling up — block
        e.preventDefault();
      } else if (e.deltaY > 0 && list.scrollTop >= max - 1) {
        // At bottom, scrolling down — block
        e.preventDefault();
      }
      // Always stop propagation so table/page never gets the event
      e.stopPropagation();
    };
    list.addEventListener("wheel", h, { passive: false });
    return () => list.removeEventListener("wheel", h);
  }, [open]);

  // Block wheel on the header area (outside the list)
  useEffect(() => {
    if (!open) return;
    const pop = popoverRef.current;
    if (!pop) return;
    const h = (e: WheelEvent) => {
      // If event is from inside the list, the list handler already dealt with it
      if (listRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    pop.addEventListener("wheel", h, { passive: false });
    return () => pop.removeEventListener("wheel", h);
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

            {/* Scrollable list */}
            <div
              ref={listRef}
              className="max-h-[240px] overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
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
