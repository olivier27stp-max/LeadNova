"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
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
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, placement: "below" as "below" | "above" });

  // Measure real menu height and position accordingly
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
    const spaceAbove = triggerRect.top - 8;
    const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    setPos({
      top: openAbove ? triggerRect.top - menuHeight - 4 : triggerRect.bottom + 4,
      left: triggerRect.left,
      width: Math.max(triggerRect.width, 200),
      placement: openAbove ? "above" : "below",
    });
  }, []);

  // Position on open + reposition on scroll/resize
  useLayoutEffect(() => {
    if (!open) return;
    // Defer to next frame so menuRef is mounted
    const raf = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, updatePosition]);

  // Capture ALL wheel events on the menu portal — prevent page/table scroll
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      // Find the scrollable container inside the menu
      const scrollable = el!.querySelector("[data-scroll]") as HTMLElement | null;
      if (!scrollable) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollable;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 0) {
        // Not scrollable — block everything
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Let the scroll happen inside, but clamp at boundaries
      if (e.deltaY < 0 && scrollTop <= 0) {
        e.preventDefault();
      } else if (e.deltaY > 0 && scrollTop >= maxScroll - 1) {
        e.preventDefault();
      }
      e.stopPropagation();
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Prevent touch move from scrolling the page when touching the dropdown
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;
    function handleTouch(e: TouchEvent) {
      e.stopPropagation();
    }
    el.addEventListener("touchmove", handleTouch, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouch);
  }, [open]);

  const handleSelect = (city: string) => {
    onChange(city);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 font-medium text-foreground-muted text-xs uppercase tracking-wide",
          "cursor-pointer hover:text-foreground transition-colors select-none",
          value && "text-primary",
          className
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
        >
          <div className="rounded-md border border-border bg-card shadow-lg overflow-hidden">
            {/* "All" option */}
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

            {cities.length > 0 && (
              <div className="border-t border-border" />
            )}

            {/* Scrollable city list */}
            <div
              data-scroll
              className="max-h-[240px] overflow-y-auto overscroll-contain scroll-smooth"
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
