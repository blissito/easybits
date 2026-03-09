import { useLoaderData } from "react-router";
import { data, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/metrics";

export const meta = () => [
  { title: "Métricas — Admin — EasyBits" },
  { name: "robots", content: "noindex" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isSuperAdmin = adminEmails.includes(user.email?.toLowerCase() || "");
  const isRoleAdmin = user.roles.includes("Admin");
  if (!isSuperAdmin && !isRoleAdmin) return redirect("/dash");

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeFiles,
    storageAgg,
    totalWebsites,
    newUsers7d,
    newUsers30d,
    newFiles7d,
    newFiles30d,
    usersWithFiles,
    usersWithWebsites,
    usersWithApiKeys,
    usersWithWebhooks,
    usersWithPresentations,
    usersWithLandings,
    topUsers,
  ] = await Promise.all([
    db.user.count(),
    db.file.count({ where: { status: { not: "DELETED" } } }),
    db.file.aggregate({ _sum: { size: true }, where: { status: { not: "DELETED" } } }),
    db.website.count({ where: { deletedAt: null } }),
    db.user.count({ where: { createdAt: { gte: d7 } } }),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.file.count({ where: { createdAt: { gte: d7 }, status: { not: "DELETED" } } }),
    db.file.count({ where: { createdAt: { gte: d30 }, status: { not: "DELETED" } } }),
    db.file.findMany({ distinct: ["ownerId"], select: { ownerId: true } }),
    db.website.findMany({ distinct: ["ownerId"], select: { ownerId: true }, where: { deletedAt: null } }),
    db.apiKey.findMany({ distinct: ["userId"], select: { userId: true } }),
    db.webhook.findMany({ distinct: ["userId"], select: { userId: true } }),
    db.presentation.findMany({ distinct: ["ownerId"], select: { ownerId: true } }),
    db.landing.findMany({ distinct: ["ownerId"], select: { ownerId: true } }),
    db.file.groupBy({
      by: ["ownerId"],
      _sum: { size: true },
      _count: true,
      where: { status: { not: "DELETED" } },
      orderBy: { _sum: { size: "desc" } },
      take: 10,
    }),
  ]);

  // Lookup emails for top users
  const topUserIds = topUsers.map((u) => u.ownerId);
  const topUserRecords = await db.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, email: true },
  });
  const emailMap = Object.fromEntries(topUserRecords.map((u) => [u.id, u.email]));

  return data({
    totalUsers,
    activeFiles,
    totalStorage: storageAgg._sum.size || 0,
    totalWebsites,
    newUsers7d,
    newUsers30d,
    newFiles7d,
    newFiles30d,
    adoption: {
      files: usersWithFiles.length,
      websites: usersWithWebsites.length,
      apiKeys: usersWithApiKeys.length,
      webhooks: usersWithWebhooks.length,
      presentations: usersWithPresentations.length,
      landings: usersWithLandings.length,
    },
    topUsers: topUsers.map((u) => ({
      email: emailMap[u.ownerId] || u.ownerId,
      files: u._count,
      storage: u._sum.size || 0,
    })),
  });
};

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-black rounded-xl p-4 bg-white">
      <p className="text-sm text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
}

export default function AdminMetrics() {
  const d = useLoaderData<typeof loader>();

  const adoptionItems = [
    { label: "Files", count: d.adoption.files },
    { label: "Websites", count: d.adoption.websites },
    { label: "API Keys", count: d.adoption.apiKeys },
    { label: "Webhooks", count: d.adoption.webhooks },
    { label: "Presentations", count: d.adoption.presentations },
    { label: "Landings", count: d.adoption.landings },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Summary */}
      <section>
        <h2 className="text-lg font-bold mb-3">Resumen</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Total Usuarios" value={d.totalUsers} />
          <Card label="Archivos Activos" value={d.activeFiles} />
          <Card label="Storage Usado" value={formatBytes(d.totalStorage)} />
          <Card label="Websites" value={d.totalWebsites} />
        </div>
      </section>

      {/* Growth */}
      <section>
        <h2 className="text-lg font-bold mb-3">Crecimiento</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Usuarios 7d" value={`+${d.newUsers7d}`} />
          <Card label="Usuarios 30d" value={`+${d.newUsers30d}`} />
          <Card label="Archivos 7d" value={`+${d.newFiles7d}`} />
          <Card label="Archivos 30d" value={`+${d.newFiles30d}`} />
        </div>
      </section>

      {/* Adoption */}
      <section>
        <h2 className="text-lg font-bold mb-3">Adopción de Features</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {adoptionItems.map((item) => (
            <div key={item.label} className="border-2 border-black rounded-xl p-4 bg-white">
              <p className="text-sm text-gray-500 uppercase tracking-wide">{item.label}</p>
              <p className="text-2xl font-black mt-1">{item.count}</p>
              <p className="text-xs text-gray-400">
                {d.totalUsers > 0
                  ? `${((item.count / d.totalUsers) * 100).toFixed(0)}% de usuarios`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Top Users */}
      <section>
        <h2 className="text-lg font-bold mb-3">Top 10 Usuarios por Storage</h2>
        <div className="border-2 border-black rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black bg-gray-50">
                <th className="text-left p-3 font-bold">#</th>
                <th className="text-left p-3 font-bold">Email</th>
                <th className="text-right p-3 font-bold">Archivos</th>
                <th className="text-right p-3 font-bold">Storage</th>
              </tr>
            </thead>
            <tbody>
              {d.topUsers.map((u, i) => (
                <tr key={u.email} className={i < d.topUsers.length - 1 ? "border-b border-gray-200" : ""}>
                  <td className="p-3 text-gray-400">{i + 1}</td>
                  <td className="p-3 font-mono text-xs">{u.email}</td>
                  <td className="p-3 text-right">{u.files}</td>
                  <td className="p-3 text-right">{formatBytes(u.storage)}</td>
                </tr>
              ))}
              {d.topUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-gray-400">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
