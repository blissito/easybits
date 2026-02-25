import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/providers";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const providers = await db.storageProvider.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      type: true,
      region: true,
      isDefault: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return { providers };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const body = await request.json();

  if (request.method === "POST") {
    // If setting as default, unset others first
    if (body.isDefault) {
      await db.storageProvider.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }
    const provider = await db.storageProvider.create({
      data: {
        name: body.name,
        type: body.type,
        region: body.region,
        isDefault: body.isDefault || false,
        config: {
          endpoint: body.endpoint,
          bucket: body.bucket,
          accessKeyId: body.accessKeyId,
          secretAccessKey: body.secretAccessKey,
        },
        userId: user.id,
      },
    });
    return { provider };
  }

  return null;
};

export default function ProvidersPage() {
  const { providers } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">Storage Providers</h2>
        <span className="text-xs font-bold px-3 py-1 bg-brand-aqua border-2 border-black rounded-lg">
          Default: Tigris (platform)
        </span>
      </div>

      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Region</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Default</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody>
            {/* Platform default row */}
            <tr className="border-t-2 border-black bg-brand-100">
              <td className="px-4 py-3 font-bold">Platform default</td>
              <td className="px-4 py-3">
                <span className="bg-brand-yellow text-xs font-bold px-2 py-0.5 rounded-md border border-black">
                  TIGRIS
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs">Auto</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${providers.length === 0 ? "bg-lime" : "bg-white"}`}>
                  {providers.length === 0 ? "YES" : "FALLBACK"}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs">—</td>
            </tr>
            {providers.map((p) => (
              <tr key={p.id} className="border-t-2 border-black hover:bg-brand-100 transition-colors">
                <td className="px-4 py-3 font-bold">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="bg-brand-aqua text-xs font-bold px-2 py-0.5 rounded-md border border-black">
                    {p.type}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{p.region}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${p.isDefault ? "bg-lime" : "bg-white"}`}>
                    {p.isDefault ? "YES" : "NO"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
