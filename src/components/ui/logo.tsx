import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "icon" | "mono";
  size?: number;
  className?: string;
}

function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <rect width="128" height="128" rx="28" fill="#2563eb" />
      <text x="64" y="82" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="52" fontWeight="700" fill="white" textAnchor="middle" letterSpacing="-2">FLS</text>
    </svg>
  );
}

function LogoFull({ size = 32, className }: { size?: number; className?: string }) {
  const width = (440 / 128) * size;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 440 128"
      fill="none"
      width={width}
      height={size}
      className={className}
    >
      <rect width="128" height="128" rx="28" fill="#2563eb" />
      <text x="64" y="82" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="52" fontWeight="700" fill="white" textAnchor="middle" letterSpacing="-2">FLS</text>
      <text x="152" y="58" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="32" fontWeight="600" fill="currentColor" letterSpacing="-0.5">Free Leads</text>
      <text x="152" y="84" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="15" fontWeight="400" fill="currentColor" opacity="0.45" letterSpacing="2">SCRAPER</text>
    </svg>
  );
}

function LogoMono({ size = 32, className }: { size?: number; className?: string }) {
  const width = (440 / 128) * size;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 440 128"
      fill="none"
      width={width}
      height={size}
      className={className}
    >
      <rect width="128" height="128" rx="28" fill="currentColor" opacity="0.08" />
      <rect x="1.5" y="1.5" width="125" height="125" rx="26.5" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.15" />
      <text x="64" y="82" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="52" fontWeight="700" fill="currentColor" textAnchor="middle" letterSpacing="-2">FLS</text>
      <text x="152" y="58" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="32" fontWeight="600" fill="currentColor" letterSpacing="-0.5">Free Leads</text>
      <text x="152" y="84" fontFamily="'Geist', system-ui, -apple-system, sans-serif" fontSize="15" fontWeight="400" fill="currentColor" opacity="0.35" letterSpacing="2">SCRAPER</text>
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
