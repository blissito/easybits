import { Link } from "react-router";
import type { Route } from "./+types/status";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { useEffect, useState } from "react";

export const meta = () =>
  getBasicMetaTags({
    title: "EasyBits — Status",
    description: "EasyBits platform status and uptime",
  });

interface HealthData {
  status: string;
  db: string;
  uptime: number;
  version: string;
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ApiIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function StorageIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
      setError(false);
    } catch {
      setError(true);
    }
    setLastCheck(new Date());
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const isOk = health?.status === "ok" && !error;

  return (
    <section className="min-h-screen bg-white">
      <nav className="border-b-2 border-black px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="flex items-center gap-2">
            <img src="/icons/easybits-logo.svg" alt="EasyBits" className="w-8 h-8" />
            <span className="font-bold text-xl">EasyBits</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/docs" className="text-sm font-medium hover:underline">
              Docs
            </Link>
            <Link to="/developers" className="text-sm font-medium hover:underline">
              Developers
            </Link>
            <Link to="/blog" className="text-sm font-medium hover:underline">
              Blog
            </Link>
            <Link
              to="/login"
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold border-2 border-black hover:translate-y-[-2px] transition-transform"
            >
              Iniciar sesion
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Platform Status</h1>
        <p className="text-gray-500 mb-8">
          Real-time status of EasyBits services.
        </p>

        {/* Overall status */}
        <div
          className={`border-2 border-black rounded-xl p-8 mb-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
            isOk ? "bg-green-100 border-green-600" : "bg-red-100 border-red-600"
          }`}
        >
          <div className="flex items-center gap-4">
            {isOk ? (
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            <div>
              <span className={`text-2xl font-bold ${isOk ? "text-green-800" : "text-red-800"}`}>
                {isOk ? "All Systems Operational" : "Service Disruption"}
              </span>
              <p className={`text-sm mt-1 ${isOk ? "text-green-600" : "text-red-600"}`}>
                {isOk ? "Everything is running smoothly." : "Some services may be affected."}
              </p>
            </div>
          </div>
        </div>

        {/* Individual services */}
        <div className="space-y-4">
          <ServiceRow
            name="API"
            icon={<ApiIcon />}
            status={health ? (health.status === "ok" ? "operational" : "degraded") : (error ? "down" : "checking")}
          />
          <ServiceRow
            name="Database"
            icon={<DatabaseIcon />}
            status={health ? (health.db === "connected" ? "operational" : "down") : (error ? "down" : "checking")}
          />
          <ServiceRow
            name="Storage (Tigris)"
            icon={<StorageIcon />}
            status={health ? "operational" : (error ? "unknown" : "checking")}
          />
        </div>

        {/* Details */}
        {health && (
          <div className="mt-8 border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="bg-gray-50 border-b-2 border-black px-6 py-3">
              <h2 className="font-bold text-lg">Details</h2>
            </div>
            <div className="divide-y-2 divide-black">
              <DetailRow icon={<ClockIcon />} label="Uptime" value={formatUptime(health.uptime)} />
              <DetailRow icon={<TagIcon />} label="Version" value={health.version} />
              <DetailRow icon={<RefreshIcon />} label="Last check" value={lastCheck?.toLocaleTimeString() ?? "—"} />
              <DetailRow icon={<GlobeIcon />} label="Region" value="DFW (Dallas)" />
            </div>
          </div>
        )}
      </main>
    </section>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3 text-gray-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-mono font-bold text-sm">{value}</span>
    </div>
  );
}

function ServiceRow({
  name,
  icon,
  status,
}: {
  name: string;
  icon: React.ReactNode;
  status: "operational" | "degraded" | "down" | "checking" | "unknown";
}) {
  const colors = {
    operational: "bg-green-500",
    degraded: "bg-yellow-500",
    down: "bg-red-500",
    checking: "bg-gray-300 animate-pulse",
    unknown: "bg-gray-400",
  };
  const labels = {
    operational: "Operational",
    degraded: "Degraded",
    down: "Down",
    checking: "Checking...",
    unknown: "Unknown",
  };
  const labelColors = {
    operational: "text-green-700 font-semibold",
    degraded: "text-yellow-700 font-semibold",
    down: "text-red-700 font-semibold",
    checking: "text-gray-500",
    unknown: "text-gray-500",
  };

  return (
    <div className="flex items-center justify-between border-2 border-black rounded-xl px-6 py-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center gap-3">
        <span className="text-gray-600">{icon}</span>
        <span className="font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${labelColors[status]}`}>{labels[status]}</span>
        <div className={`w-3 h-3 rounded-full ${colors[status]}`} />
      </div>
    </div>
  );
}
