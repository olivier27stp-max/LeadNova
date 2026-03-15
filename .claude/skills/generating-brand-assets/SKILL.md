---
name: generating-brand-assets
description: Use this skill when generating SVG branding assets for SaaS products, including logos, app icons, monochrome versions, and favicon variants. Trigger when users ask to create a logo, brand identity, icon set, or visual branding for a software product. Produces production-ready SVG files optimized for frontend use, dark mode compatibility, and multiple sizes.
---

# Generating Brand Assets

Create professional, production-ready SVG branding assets for SaaS and tech products.

## What This Skill Produces

1. **Main logo** — Full logo with icon + wordmark
2. **Square app icon** — Standalone icon for favicons, app stores, social
3. **Monochrome version** — Single-color variant for watermarks, footers, embossing
4. **SVG exports** — Clean, optimized SVGs ready for `<img>`, React components, or CSS

## Process

### 1. Gather Brand Context

Before designing, understand:
- Product name and tagline
- Industry / domain (SaaS, fintech, devtools, etc.)
- Visual keywords (minimal, bold, geometric, organic, etc.)
- Color preferences or existing palette from the project's design system
- Where assets will be used (navbar, favicon, OG images, etc.)

Check the project for existing design tokens:
- `globals.css` or `tailwind.config.*` for color variables
- Any existing brand colors in the codebase

### 2. Design Principles

Follow these rules for SaaS-grade branding:

- **Simplicity**: Maximum 2-3 geometric shapes. No gradients in the base icon.
- **Scalability**: Must look sharp at 16px (favicon) and 512px (app store).
- **Dark mode**: Design for both light and dark backgrounds. Use `currentColor` where possible.
- **Consistency**: Match the product's existing design system (border radius, color palette).
- **Legibility**: Wordmark must be readable at small sizes. Use system or widely available fonts.

### 3. SVG Construction Rules

Write SVGs by hand following these constraints:

```
viewBox="0 0 SIZE SIZE"     — Use clean integer viewBoxes (32, 64, 128, 256)
No inline styles             — Use attributes (fill, stroke) not <style> blocks
No raster images             — Pure vector only
No external refs             — No xlink:href to external files
Minimal path data            — Prefer <rect>, <circle>, <path> with clean coordinates
Round coordinates            — No sub-pixel values (use integers or .5 increments)
```

### 4. File Organization

Place assets in the project's public directory:

```
public/
├── logo.svg              — Main logo (icon + wordmark)
├── logo-icon.svg         — Square icon only
├── logo-mono.svg         — Monochrome version
└── favicon.svg           — Favicon-optimized (16x16 viewBox)
```

### 5. React Component (Optional)

If the project uses React, also create a component:

```
src/components/ui/logo.tsx — React component with size/variant props
```

The component should support:
- `variant`: "full" | "icon" | "mono"
- `size`: number (default 32)
- `className`: for custom styling
- Inline SVG for best performance and CSS control

### 6. Output Checklist

Before finishing, validate:
- [ ] All SVGs render correctly in browser
- [ ] Icon is legible at 16px
- [ ] Dark mode: works on both `#ffffff` and `#09090b` backgrounds
- [ ] No hardcoded colors that break in dark mode (use `currentColor` for text)
- [ ] Files are in `public/` directory
- [ ] SVGs are clean (no editor metadata, no unnecessary groups)
- [ ] Wordmark font is either embedded as paths or uses the project's font stack

## Design Patterns by Industry

Reference `./saas-logo-patterns.md` for industry-specific icon concepts:
- **Lead gen / CRM**: Nodes, connections, magnifying glass, target, radar
- **DevTools**: Terminal brackets, code symbols, geometric abstractions
- **Analytics**: Chart elements, data points, upward arrows
- **Communication**: Chat bubbles, envelope, signal waves
- **Security**: Shield, lock, key abstractions

## Tips

- Start with the square icon — it's the hardest to get right at small sizes
- The wordmark should use the product's existing font or a clean geometric sans
- Test your SVGs by embedding them in the actual app navbar before finalizing
- Use HSL values from the design system, not arbitrary hex codes
