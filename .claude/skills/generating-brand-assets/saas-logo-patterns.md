# SaaS Logo Design Patterns

## Lead Generation / CRM / Prospecting

Icon concepts that communicate data discovery and business connections:

- **Network nodes**: 3-4 circles connected by lines — represents lead networks
- **Magnifying glass + data**: Search lens over a grid or node — discovery
- **Radar / target**: Concentric rings with a focal point — targeting leads
- **Funnel**: Abstract funnel shape — sales pipeline
- **Arrow + person**: Upward arrow or person silhouette — growth, acquisition
- **Data flow**: Parallel lines converging to a point — data aggregation

### Recommended approach for lead gen:
Combine a **node/connection motif** with a **directional element** (arrow, ray).
This communicates both "data" and "discovery" — the two core concepts.

## Color Strategies

### Single-brand-color approach (recommended for SaaS):
- Use the primary brand color for the icon
- Use neutral foreground color for the wordmark
- Monochrome: single neutral color for everything

### Two-color approach:
- Primary color for the main shape
- Accent or lighter tint for a secondary element
- Keep it to max 2 colors in the icon

## Sizing Reference

| Use case        | Recommended viewBox | Min detail |
|-----------------|-------------------|------------|
| Favicon         | 32x32             | 2px stroke |
| Navbar          | 24-32px display   | 1.5px stroke |
| App icon        | 128x128           | Full detail |
| OG image        | 256x256+          | Full detail |
| Print           | 512x512+          | Full detail |

## Typography for Wordmarks

For SaaS products, prefer:
- **Geometric sans**: Inter, Geist, Satoshi, General Sans
- **Weight**: Semibold (600) for the brand name
- **Tracking**: Slight negative tracking (-0.02em) for tightness
- **Case**: Title case or all lowercase — avoid ALL CAPS unless it's a very short name

When embedding text in SVG, convert to `<path>` for portability,
or use `<text>` with the project's font-family for dev/preview.
