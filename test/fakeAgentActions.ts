// Tabla AgentAction en memoria con justo los filtros que usa agentActions.ts
// (igualdad, `lte`/`gt`/`gte` sobre createdAt). El reclamo condicionado de updateMany es
// lo que se prueba: tiene que comportarse como el de Mongo.
type Row = {
  id: string;
  ownerId: string;
  tool: string;
  args: unknown;
  summary: string;
  status: string;
  result?: unknown;
  error?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
};

function matches(row: Row, where: Record<string, any>): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = (row as any)[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("lte" in cond && !(v <= cond.lte)) return false;
      if ("gt" in cond && !(v > cond.gt)) return false;
      if ("gte" in cond && !(v >= cond.gte)) return false;
    } else if (v !== cond) return false;
  }
  return true;
}

export function fakeAgentActionTable() {
  const rows: Row[] = [];
  let n = 0;
  const table = {
    rows,
    async create({ data }: { data: Partial<Row> }) {
      const row: Row = {
        id: (++n).toString(16).padStart(24, "a"),
        status: "pending",
        createdAt: new Date(),
        ...(data as Partial<Row>),
      } as Row;
      rows.push(row);
      return { ...row };
    },
    async findMany({ where = {} }: { where?: Record<string, any> } = {}) {
      return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
    },
    async findFirst({ where = {} }: { where?: Record<string, any> }) {
      const r = rows.find((x) => matches(x, where));
      return r ? { ...r } : null;
    },
    async findUnique({ where }: { where: { id: string } }) {
      const r = rows.find((x) => x.id === where.id);
      return r ? { ...r } : null;
    },
    async updateMany({ where, data }: { where: Record<string, any>; data: Partial<Row> }) {
      let count = 0;
      for (const r of rows) {
        if (matches(r, where)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    },
    async update({ where, data }: { where: { id: string }; data: Partial<Row> }) {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return { ...r };
    },
  };
  return table;
}
