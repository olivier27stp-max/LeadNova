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

  const applyPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const r = trigger.getBoundingClientRect();
    const pad = 12;

    // Temporarily remove maxHeight to measure natural content height
    popover.style.maxHeight = "none";
    const popH = popover.scrollHeight;

    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;
    const goUp = spaceBelow < popH && spaceAbove > spaceBelow;
    const maxAvailable = goUp ? spaceAbove : spaceBelow;

    // Always constrain to available viewport space
    popover.style.maxHeight = `${maxAvailable}px`;
    popover.style.left = `${r.left}px`;
    popover.style.minWidth = `${Math.max(r.width, 200)}px`;
    popover.style.top = goUp ? `${r.top - Math.min(popH, maxAvailable) - 4}px` : `${r.bottom + 4}px`;
    popover.style.opacity = "1";
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(applyPosition));
    return () => cancelAnimationFrame(id);
  }, [open, applyPosition]);

  useEffect(() => {
    if (!open) return;
    const h = (e: Event) => {
      // Ignore scroll events from the popover itself — don't reposition while user scrolls the list
      if (popoverRef.current?.contains(e.target as Node)) return;
      applyPosition();
    };
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", applyPosition);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", applyPosition); };
  }, [open, applyPosition]);

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
          className="rounded-md border border-border bg-card shadow-lg"
          style={{ position: "fixed", zIndex: 9999, opacity: 0, overflowY: "auto", overscrollBehavior: "contain" }}
        >
          {/* Reset option */}
          <div
            className={cn(
              "flex items-center justify-between px-3 py-2 text-sm cursor-pointer rounded-t-md",
              "hover:bg-primary-subtle transition-colors",
              !value && "text-primary font-medium"
            )}
            onMouseDown={(e) => { e.preventDefault(); pick(""); }}
          >
            <span>Toutes les villes</span>
            {!value && <Check className="size-3.5 text-primary" />}
          </div>

          {cities.length > 0 && <div className="border-t border-border" />}

          {cities.map(city => (
            <div
              key={city}
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm cursor-pointer",
                "hover:bg-primary-subtle transition-colors last:rounded-b-md",
                value === city && "text-primary font-medium bg-primary-subtle/50"
              )}
              onMouseDown={(e) => { e.preventDefault(); pick(city); }}
            >
              <span className="truncate">{city}</span>
              {value === city && <Check className="size-3.5 shrink-0 text-primary" />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
