"use client";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Tailwind classes for the icon pill, e.g. "bg-primary-subtle text-primary" */
  iconColor?: string;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  iconColor,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card-hover",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-foreground-muted tracking-wide">
          {label}
        </p>
        {icon && (
          iconColor ? (
            <span className={cn("p-1.5 rounded-md", iconColor)}>{icon}</span>
          ) : (
            <span className="text-foreground-muted">{icon}</span>
          )
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums text-foreground tracking-tight">
          {value}
        </p>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend.positive ? "text-success" : "text-danger"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-foreground-muted">{subtitle}</p>
      )}
    </div>
  );
}
