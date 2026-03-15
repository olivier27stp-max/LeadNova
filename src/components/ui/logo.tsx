import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "icon" | "mono";
  size?: number;
  className?: string;
}

function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  const id = "lg-grad";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      {/* Stylized "N" — two verticals + diagonal */}
      <path
        d="M9 22V10h2.4l7.2 8.4V10H21v12h-2.4L11.4 13.6V22H9Z"
        fill="white"
      />
    </svg>
  );
}

function LogoFull({ size = 32, className }: { size?: number; className?: string }) {
  const w = Math.round((168 / 32) * size);
  const id = "lgf-grad";
  const id2 = "nova-grad";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 168 32"
      fill="none"
      width={w}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id={id2} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Icon */}
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <path
        d="M9 22V10h2.4l7.2 8.4V10H21v12h-2.4L11.4 13.6V22H9Z"
        fill="white"
      />
      {/* Wordmark */}
      <text
        x="44"
        y="22.5"
        fontFamily="'Geist', 'Inter', system-ui, -apple-system, sans-serif"
        fontSize="18"
        fontWeight="500"
        letterSpacing="-0.3"
        fill="currentColor"
      >
        Lead
      </text>
      <text
        x="93"
        y="22.5"
        fontFamily="'Geist', 'Inter', system-ui, -apple-system, sans-serif"
        fontSize="18"
        fontWeight="700"
        letterSpacing="-0.3"
        fill={`url(#${id2})`}
      >
        Nova
      </text>
    </svg>
  );
}

function LogoMono({ size = 32, className }: { size?: number; className?: string }) {
  const w = Math.round((168 / 32) * size);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 168 32"
      fill="none"
      width={w}
      height={size}
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.2" />
      <path
        d="M9 22V10h2.4l7.2 8.4V10H21v12h-2.4L11.4 13.6V22H9Z"
        fill="currentColor"
        opacity="0.8"
      />
      <text
        x="44"
        y="22.5"
        fontFamily="'Geist', 'Inter', system-ui, -apple-system, sans-serif"
        fontSize="18"
        fontWeight="500"
        letterSpacing="-0.3"
        fill="currentColor"
      >
        Lead
      </text>
      <text
        x="93"
        y="22.5"
        fontFamily="'Geist', 'Inter', system-ui, -apple-system, sans-serif"
        fontSize="18"
        fontWeight="700"
        letterSpacing="-0.3"
        fill="currentColor"
      >
        Nova
      </text>
    </svg>
  );
}

export function Logo({ variant = "icon", size = 32, className }: LogoProps) {
  switch (variant) {
    case "full":
      return <LogoFull size={size} className={cn(className)} />;
    case "mono":
      return <LogoMono size={size} className={cn(className)} />;
    case "icon":
    default:
      return <LogoIcon size={size} className={cn(className)} />;
  }
}
