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

const HEADER_HEIGHT = 37; // "Toutes les villes" row + border
const MAX_LIST_HEIGHT = 240;
const VIEWPORT_PADDING = 12;

export function CityDropdown({ value, onChange, cities, placeholder = "Ville", className }: CityDropdownProps) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [listMaxH, setListMaxH] = useState(MAX_LIST_HEIGHT);

  // ── Position popover + constrain list height to available space ──
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_PADDING;
    const spaceAbove = r.top - VIEWPORT_PADDING;

    // Decide direction: prefer below, go above only if significantly more room
    const idealHeight = HEADER_HEIGHT + Math.min(cities.length * 36, MAX_LIST_HEIGHT);
    const goUp = spaceBelow < idealHeight && spaceAbove > spaceBelow;

    const available = goUp ? spaceAbove : spaceBelow;
    const constrainedListH = Math.max(80, Math.min(MAX_LIST_HEIGHT, available - HEADER_HEIGHT));

    setListMaxH(constrainedListH);
    setStyle({
      position: "fixed",
      left: r.left,
      top: goUp ? r.top - Math.min(idealHeight, available) - 4 : r.bottom + 4,
      minWidth: Math.max(r.width, 200),
      zIndex: 9999,
    });
    setReady(true);
  }, [cities.length]);

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

  // ── Scroll isolation on the list ──
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const h = (e: WheelEvent) => {
      const max = list.scrollHeight - list.clientHeight;
      if (max <= 0) {
        e.preventDefault();
      } else if (e.deltaY < 0 && list.scrollTop <= 0) {
        e.preventDefault();
      } else if (e.deltaY > 0 && list.scrollTop >= max - 1) {
        e.preventDefault();
      }
      e.stopPropagation();
    };
    list.addEventListener("wheel", h, { passive: false });
    return () => list.removeEventListener("wheel", h);
  }, [open]);

  // Block wheel on header area
  useEffect(() => {
    if (!open) return;
    const pop = popoverRef.current;
    if (!pop) return;
    const h = (e: WheelEvent) => {
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

            {/* Scrollable list — height constrained to available viewport space */}
            <div
              ref={listRef}
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: listMaxH, WebkitOverflowScrolling: "touch" }}
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
