import { useLoaderData, useSearchParams } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/files";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const limit = 25;

  const where: Record<string, unknown> = { ownerId: user.id };
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const files = await db.file.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      size: true,
      contentType: true,
      status: true,
      storageProviderId: true,
      createdAt: true,
    },
  });

  const hasMore = files.length > limit;
  const items = hasMore ? files.slice(0, limit) : files;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return { items, nextCursor };
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DevFilesPage() {
  const { items, nextCursor } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search files..."
          defaultValue={searchParams.get("q") || ""}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams);
            if (e.target.value) params.set("q", e.target.value);
            else params.delete("q");
            params.delete("cursor");
            setSearchParams(params);
          }}
          className="border-2 border-black rounded-xl px-4 py-2 text-sm font-mono flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        />
      </div>

      <div className="border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Size</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Provider</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className="border-t-2 border-black hover:bg-brand-100 transition-colors">
                <td className="px-4 py-3 max-w-[200px] truncate font-bold">{f.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatSize(f.size)}</td>
                <td className="px-4 py-3 font-mono text-xs">{f.contentType}</td>
                <td className="px-4 py-3">
                  <span className="bg-brand-aqua text-xs font-bold px-2 py-0.5 rounded-md border border-black">
                    {f.storageProviderId ? "Custom" : "Tigris"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-black ${
                      f.status === "DONE"
                        ? "bg-lime"
                        : f.status === "ERROR"
                        ? "bg-brand-red text-white"
                        : "bg-brand-yellow"
                    }`}
                  >
                    {f.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {new Date(f.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center font-bold text-gray-400 uppercase tracking-wider">
                  No files found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set("cursor", nextCursor);
            setSearchParams(params);
          }}
          className="mt-4 group rounded-xl bg-black inline-block"
        >
          <span className="block bg-white px-4 py-2 rounded-xl border-2 border-black text-sm font-bold -translate-x-1 -translate-y-1 transition-all hover:-translate-x-1.5 hover:-translate-y-1.5 active:translate-x-0 active:translate-y-0">
            Load more
          </span>
        </button>
      )}
    </div>
  );
}
