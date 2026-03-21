"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = Math.min(cities.length * 36 + 44, 284); // estimate
    const openAbove = spaceBelow < menuHeight && rect.top > menuHeight;
    setPos({
      top: openAbove ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 180),
    });
  }, [cities.length]);

  // Position the menu when opening
  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  // Isolate scroll: attach native wheel listener with { passive: false }
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) {
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
              ref={scrollRef}
              className="max-h-[240px] overflow-y-auto overscroll-contain"
            >
              {cities.map((city) => (
                <div
                  key={city}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors",
                    "hover:bg-primary-subtle",
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
