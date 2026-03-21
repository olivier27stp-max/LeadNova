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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Position + constrain to viewport ──
  const applyPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    const list = listRef.current;
    if (!trigger || !popover || !list) return;

    const r = trigger.getBoundingClientRect();
    const pad = 12;
    const headerH = 37;
    const maxListH = 240;

    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;
    const goUp = spaceBelow < headerH + 80 && spaceAbove > spaceBelow;

    const available = goUp ? spaceAbove : spaceBelow;
    const listH = Math.max(60, Math.min(maxListH, available - headerH));

    // Apply directly to DOM — no re-render, no timing issues
    list.style.maxHeight = `${listH}px`;
    popover.style.left = `${r.left}px`;
    popover.style.minWidth = `${Math.max(r.width, 200)}px`;

    if (goUp) {
      const totalH = headerH + listH;
      popover.style.top = `${r.top - totalH - 4}px`;
    } else {
      popover.style.top = `${r.bottom + 4}px`;
    }

    popover.style.opacity = "1";
  }, []);

  // On open: position immediately
  useEffect(() => {
    if (!open) return;
    // Double rAF to ensure portal is painted
    const id = requestAnimationFrame(() => requestAnimationFrame(applyPosition));
    return () => cancelAnimationFrame(id);
  }, [open, applyPosition]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const h = () => applyPosition();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, applyPosition]);

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
        <div
          ref={popoverRef}
          style={{ position: "fixed", zIndex: 9999, opacity: 0 }}
        >
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
              style={{ overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
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
