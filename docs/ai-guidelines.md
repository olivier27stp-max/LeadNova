# AI Interaction Guidelines — Free Leads

## First Step: Always Read CLAUDE.md
Before doing anything, read `CLAUDE.md`. It contains the stack, key files, constraints, and rules.
Do not scan the full repository. Read only the files needed for the task.

---

## Prompt Workflow

### For Bug Fixes
1. Read `CLAUDE.md`
2. Read the specific file mentioned by the user
3. Identify the minimal change needed
4. Return a patch (Edit tool), not a full rewrite

### For New Features
1. Read `CLAUDE.md`
2. Read relevant existing module in `docs/modules.md`
3. Check `docs/rules.md` for constraints
4. Read the files you'll modify before editing
5. Implement incrementally — one file at a time

### For DB Changes
1. Read `docs/database.md` first
2. Check existing models before adding new ones
3. Modify `prisma/schema.prisma`
4. Remind the user to run: `npx prisma migrate dev && npx prisma generate`

### For UI Changes
1. Check existing components in `src/components/ui/` first — reuse before creating
2. Follow animation patterns from existing pages (Motion)
3. Use Tailwind semantic color classes (`bg-card`, `text-foreground-muted`, etc.)
4. French UI only

---

## What To Read For Each Area

| Task | Read These Files |
|---|---|
| Prospect list | `src/app/prospects/page.tsx`, `src/app/api/prospects/route.ts` |
| Enrichment | `src/lib/enrichment.ts`, `src/app/api/prospects/enrich/route.ts` |
| Discovery | `src/lib/discovery.ts`, `src/app/api/prospects/discover/route.ts` |
| Campaigns | `src/app/campaigns/[id]/page.tsx`, `src/app/api/campaigns/[id]/route.ts` |
| Email sending | `src/lib/email-sender.ts`, `src/lib/outreach.ts` |
| Dashboard | `src/app/page.tsx`, `src/app/api/dashboard/stats/route.ts` |
| DB schema | `prisma/schema.prisma`, `docs/database.md` |
| Config | `src/lib/config.ts` |
| UI primitives | `src/components/ui/` |

---

## Minimal Patch Principle

Return the smallest possible change. If fixing a bug in 3 lines, return those 3 lines.
Do not:
- Refactor surrounding code
- Add comments to unchanged code
- Add new error handling to untouched functions
- Rename variables for "consistency"
- Add TypeScript annotations to code you didn't write

---

## Response Format

When making code changes:
1. State what file is being changed and why (1 sentence)
2. Apply the patch via Edit tool
3. If multiple files, edit them sequentially
4. Brief confirmation of what was done (1–2 sentences)

Do not summarize what you just did in detail. The user can read the diff.

---

## Critical Constraints to Always Respect

```
1. Sequential DB queries — NO Promise.all for Prisma
2. French UI — NO English strings in JSX
3. logActivity() — after every significant user action
4. cn() — for className merging (from src/lib/utils.ts)
5. DATABASE_TCP_URL — never hardcode DB connection
6. NextResponse.json() — always return proper status codes
7. No new npm packages — unless explicitly requested
```

---

## Common Patterns

### API Route Handler
```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  // ... sequential DB queries
  return NextResponse.json({ data }, { status: 200 });
}
```

### Sequential DB Query Pattern
```typescript
// Always sequential — never Promise.all
const prospects = await prisma.prospect.findMany({ where: { ... } });
const total = await prisma.prospect.count({ where: { ... } });
```

### Activity Logging Pattern
```typescript
await logActivity({
  action: "enrichment_completed",
  type: "success",
  title: "Enrichissement terminé",
  details: `${enriched} prospects enrichis sur ${total}`,
  metadata: { prospects_created: enriched, total, failed },
});
```

### Page Entry Animation
```typescript
<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
```

### Staggered List Items
```typescript
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.02 }}
>
```

---

## What AI Must Never Do

- Rewrite entire files to fix a small bug
- Add features not requested
- Add English text to the UI
- Use `Promise.all` for database queries
- Modify `src/generated/prisma/` (auto-generated)
- Introduce new global state patterns
- Create duplicate UI components
- Skip reading a file before editing it
- Add docstrings or comments to code not being changed
- Assume context without reading the relevant files first
