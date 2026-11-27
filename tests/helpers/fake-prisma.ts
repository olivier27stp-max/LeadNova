/**
 * Faux client Prisma en mémoire pour les tests d'intégration (aucune base de données).
 * Couvre seulement ce que le code des réponses et de Slack utilise : where simples (égalité, in, notIn, lt, not,
 * relation « prospect »), orderBy sur une clé, take, contraintes uniques (erreur P2002).
 */
type Row = Record<string, unknown>;

const UNIQUES: Record<string, string[][]> = {
  slackNotification: [["workspaceId", "dedupeKey"]],
  blacklist: [["workspaceId", "email"]],
  appSettings: [["workspaceId"]],
  workspaceMember: [["workspaceId", "userId"]],
};

const COMPOUND: Record<string, string[]> = {
  workspaceId_userId: ["workspaceId", "userId"],
  workspaceId_email: ["workspaceId", "email"],
  workspaceId_dedupeKey: ["workspaceId", "dedupeKey"],
};

let seq = 0;

export function createFakePrisma() {
  const tables: Record<string, Row[]> = {};
  const t = (name: string) => (tables[name] ??= []);

  function matchValue(v: unknown, cond: unknown): boolean {
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if ("notIn" in c && (c.notIn as unknown[]).includes(v)) return false;
      if ("lt" in c && !((v as Date) < (c.lt as Date))) return false;
      if ("gte" in c && !((v as Date) >= (c.gte as Date))) return false;
      if ("not" in c && v === c.not) return false;
      return true;
    }
    return (v ?? null) === (cond ?? null);
  }

  function match(model: string, row: Row, where: Row = {}): boolean {
    for (const [k, cond] of Object.entries(where)) {
      if (COMPOUND[k]) {
        for (const f of COMPOUND[k]) if (!matchValue(row[f], (cond as Row)[f])) return false;
      } else if (k === "prospect" && model !== "prospect") {
        const p = t("prospect").find((x) => x.id === row.prospectId);
        if (!p || !match("prospect", p, cond as Row)) return false;
      } else if (k === "campaign" && model !== "campaign") {
        const c = t("campaign").find((x) => x.id === row.campaignId);
        if (!c || !match("campaign", c, cond as Row)) return false;
      } else if (!matchValue(row[k], cond)) return false;
    }
    return true;
  }

  function checkUnique(model: string, row: Row, ignore?: Row) {
    for (const fields of UNIQUES[model] ?? []) {
      const clash = t(model).find((x) => x !== ignore && fields.every((f) => x[f] === row[f]));
      if (clash) throw Object.assign(new Error(`Unique constraint failed on ${fields.join(",")}`), { code: "P2002" });
    }
  }

  function model(name: string) {
    const findMany = async (args: { where?: Row; orderBy?: Row; take?: number } = {}) => {
      let rows = t(name).filter((r) => match(name, r, args.where));
      if (args.orderBy) {
        const [[key, dir]] = Object.entries(args.orderBy);
        rows = [...rows].sort((a, b) => ((a[key] as number) > (b[key] as number) ? 1 : -1) * (dir === "desc" ? -1 : 1));
      }
      return args.take ? rows.slice(0, args.take) : rows;
    };
    const applyData = (row: Row, data: Row) => {
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in (v as Row)) row[k] = ((row[k] as number) ?? 0) + ((v as Row).increment as number);
        else row[k] = v;
      }
      row.updatedAt = new Date();
    };
    return {
      findMany,
      findFirst: async (args: { where?: Row; orderBy?: Row } = {}) => (await findMany(args))[0] ?? null,
      findUnique: async (args: { where: Row }) => t(name).find((r) => match(name, r, args.where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: `${name}_${++seq}`, createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...data };
        if (name === "slackNotification") {
          row.status ??= "PENDING";
          row.attempts ??= 0;
        }
        checkUnique(name, row);
        t(name).push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = t(name).find((r) => match(name, r, where));
        if (!row) throw new Error(`${name}.update : introuvable`);
        applyData(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = t(name).filter((r) => match(name, r, where));
        rows.forEach((r) => applyData(r, data));
        return { count: rows.length };
      },
      upsert: async ({ where, update, create }: { where: Row; update: Row; create: Row }) => {
        const row = t(name).find((r) => match(name, r, where));
        if (row) {
          applyData(row, update);
          return row;
        }
        const created: Row = { id: `${name}_${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...create };
        checkUnique(name, created);
        t(name).push(created);
        return created;
      },
      delete: async ({ where }: { where: Row }) => {
        const i = t(name).findIndex((r) => match(name, r, where));
        return t(name).splice(i, 1)[0];
      },
    };
  }

  const client = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop === "_tables") return tables;
      if (prop === "then") return undefined;
      return model(prop);
    },
  });
  return client as unknown as Record<string, ReturnType<typeof model>> & { _tables: Record<string, Row[]> };
}

/** Installe le faux client : le proxy de src/lib/db.ts lit globalThis.prisma au premier accès. */
export function installFakePrisma() {
  const fake = createFakePrisma();
  (globalThis as unknown as { prisma: unknown }).prisma = fake;
  return fake;
}
