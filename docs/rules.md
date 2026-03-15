# Development Rules — Free Leads

## TypeScript
- Strict mode enabled
- No `any` unless absolutely unavoidable (prefer `unknown`)
- Type all API route params, request bodies, and response shapes
- Use `interface` for object shapes, `type` for unions/aliases
- Zod not used — validate manually at API route entry points

## Naming Conventions
| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `email-sender.ts` |
| Components | PascalCase | `ProspectCard.tsx` |
| Functions | camelCase | `enrichProspect()` |
| DB models | PascalCase | `Prospect`, `Campaign` |
| API routes | Next.js convention | `src/app/api/[route]/route.ts` |
| CSS classes | Tailwind utilities | no custom classes unless in globals.css |

## Folder Structure (enforced)
```
src/
  app/           — Pages + API routes only
  components/    — Reusable React components
    ui/          — Design system primitives
  lib/           — Business logic, utilities, integrations
  types/         — Global TypeScript types
  generated/     — DO NOT EDIT (Prisma auto-generated)
prisma/          — schema.prisma + migrations + seed
docs/            — Architecture documentation
```

## Component Rules
- All interactive pages use `"use client"` directive
- No server components with data fetching (all data fetched client-side via `fetch()`)
- Use `src/components/ui/` primitives — do not create duplicate components
- `className` merging via `cn()` from `src/lib/utils.ts`
- Animations: Motion (`motion/react`) — see pattern in existing pages

## Database Rules
- **NEVER use `Promise.all` for DB queries** — Prisma pg pool is sequential
- Always use `prisma` singleton from `src/lib/db.ts`
- Soft delete for prospects: set `archivedAt`, do not hard-delete
- Unique constraint on `(companyName, city)` — handle upsert with `@@unique`
- All new models need `createdAt DateTime @default(now())`
- Run `npx prisma migrate dev` after schema changes
- Run `npx prisma generate` to refresh client

## API Route Rules
- Return `NextResponse.json()` with explicit status codes
- 200: success, 201: created, 400: bad input, 404: not found, 500: server error
- Log activity with `logActivity()` after every significant user action
- Validate required fields explicitly — no Zod, no schema validation library
- Never expose internal error details in responses (use generic messages in prod)

## State Management Rules
- No global state library (no Redux, no Zustand)
- Page state: `useState` + `useEffect` with `fetch()`
- Cross-component state: React Context (see EnrichmentProvider pattern)
- Form state: controlled inputs with `useState`

## Styling Rules
- Tailwind CSS 4 utility classes only
- Use CSS custom properties from `globals.css` for semantic colors:
  `bg-card`, `bg-background`, `text-foreground`, `text-foreground-muted`, `border-border`, `text-primary`, `bg-primary-subtle`, etc.
- No inline styles unless dynamic values (e.g. progress bar widths)
- Responsive: mobile-first, `sm:`, `md:`, `lg:` breakpoints

## Logging Rules
- Call `logActivity()` after: imports, enrichment, discovery, email sends, campaign changes
- Use correct `type`: `"info"` | `"success"` | `"warning"` | `"error"`
- Include `metadata` with counts for bulk operations

## Security Rules
- No hardcoded credentials or API keys — env vars only
- Never log or return sensitive env vars in API responses
- Blacklist checked before sending any email
- `emailGuessed` flag on Prospect when email is guessed (not scraped)

---

## What AI Must NEVER Do

- **Never rewrite an entire file** when a 5-line patch is sufficient
- **Never modify unrelated files** — stay in scope of the request
- **Never add untested features** — if unsure, ask first
- **Never introduce `Promise.all` for DB queries**
- **Never hardcode env vars**
- **Never remove existing error handling** unless replacing it
- **Never change the Prisma schema** without being explicitly asked
- **Never add new npm packages** without being explicitly asked
- **Never create new pages** if an existing page can be extended
- **Never add English text** to the UI — French only
- **Never skip `logActivity()`** after significant actions
