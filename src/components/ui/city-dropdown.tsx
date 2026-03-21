"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // ── Position: measure real menu, pick above/below ──
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const tr = trigger.getBoundingClientRect();
    const mh = menu.offsetHeight;
    const spaceBelow = window.innerHeight - tr.bottom - 8;
    const spaceAbove = tr.top - 8;
    const above = spaceBelow < mh && spaceAbove > spaceBelow;

    setPos({
      top: above ? tr.top - mh - 4 : tr.bottom + 4,
      left: tr.left,
      width: Math.max(tr.width, 200),
    });
  }, []);

  // First paint: invisible render → measure → show in right spot
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    requestAnimationFrame(updatePosition);
  }, [open, updatePosition]);

  // Reposition on any scroll / resize
  useEffect(() => {
    if (!open) return;
    const handler = () => requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  // ── Scroll isolation on the list ──
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;

    function onWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = list!;
      const maxScroll = scrollHeight - clientHeight;

      // If not scrollable at all, just block everything
      if (maxScroll <= 0) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Clamp at top/bottom so scroll doesn't leak to page
      const goingUp = e.deltaY < 0;
      const goingDown = e.deltaY > 0;
      if ((goingUp && scrollTop <= 0) || (goingDown && scrollTop >= maxScroll - 1)) {
        e.preventDefault();
      }
      e.stopPropagation();
    }

    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, [open]);

  // Also block wheel on the header ("Toutes les villes") from leaking
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    function onWheel(e: WheelEvent) {
      // If event came from the list itself, let the list handler deal with it
      if (listRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
    }
    menu.addEventListener("wheel", onWheel, { passive: false });
    return () => menu.removeEventListener("wheel", onWheel);
  }, [open]);

  // ── Close on outside click ──
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Mobile: isolate touch scroll ──
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    function onTouch(e: TouchEvent) {
      if (!listRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
      e.stopPropagation();
    }
    menu.addEventListener("touchmove", onTouch, { passive: false });
    return () => menu.removeEventListener("touchmove", onTouch);
  }, [open]);

  function handleSelect(city: string) {
    onChange(city);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 font-medium text-xs uppercase tracking-wide",
          "cursor-pointer transition-colors select-none",
          value ? "text-primary hover:text-primary/80" : "text-foreground-muted hover:text-foreground",
          className
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        {value ? (
          <X
            className="size-3.5 shrink-0 hover:text-danger transition-colors"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-150",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: pos?.width ?? 200,
            zIndex: 9999,
            opacity: pos ? 1 : 0,
            pointerEvents: pos ? "auto" : "none",
          }}
        >
          <div className="rounded-md border border-border bg-card shadow-lg overflow-hidden">
            {/* Reset option */}
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors",
                "hover:bg-primary-subtle",
                !value && "text-primary font-medium"
              )}
              onClick={() => handleSelect("")}
            >
              <span>Toutes les villes</span>
              {!value && <Check className="size-3.5 text-primary" />}
            </div>

            {cities.length > 0 && <div className="border-t border-border" />}

            {/* Scrollable city list */}
            <div
              ref={listRef}
              className="max-h-[240px] overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {cities.map((city) => (
                <div
                  key={city}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors",
                    "hover:bg-primary-subtle active:bg-primary-subtle/70",
                    value === city && "text-primary font-medium bg-primary-subtle/50"
                  )}
                  onClick={() => handleSelect(city)}
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
