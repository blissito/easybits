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
          <Link to="/inicio" className="font-bold text-xl">
            EasyBits
          </Link>
          <Link
            to="/docs"
            className="text-sm font-medium hover:underline"
          >
            API Docs
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Platform Status</h1>
        <p className="text-gray-500 mb-8">
          Real-time status of EasyBits services.
        </p>

        {/* Overall status */}
        <div
          className={`border-2 border-black rounded-xl p-6 mb-8 ${
            isOk ? "bg-green-50" : "bg-red-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full ${
                isOk ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xl font-bold">
              {isOk ? "All Systems Operational" : "Service Disruption"}
            </span>
          </div>
        </div>

        {/* Individual services */}
        <div className="space-y-4">
          <ServiceRow
            name="API"
            status={health ? (health.status === "ok" ? "operational" : "degraded") : (error ? "down" : "checking")}
          />
          <ServiceRow
            name="Database"
            status={health ? (health.db === "connected" ? "operational" : "down") : (error ? "down" : "checking")}
          />
          <ServiceRow
            name="Storage (Tigris)"
            status={health ? "operational" : (error ? "unknown" : "checking")}
          />
        </div>

        {/* Details */}
        {health && (
          <div className="mt-8 border-2 border-black rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4">Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Uptime</span>
                <p className="font-mono font-bold">{formatUptime(health.uptime)}</p>
              </div>
              <div>
                <span className="text-gray-500">Version</span>
                <p className="font-mono font-bold">{health.version}</p>
              </div>
              <div>
                <span className="text-gray-500">Last check</span>
                <p className="font-mono font-bold">
                  {lastCheck?.toLocaleTimeString() ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Region</span>
                <p className="font-mono font-bold">DFW (Dallas)</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </section>
  );
}

function ServiceRow({
  name,
  status,
}: {
  name: string;
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

  return (
    <div className="flex items-center justify-between border-2 border-black rounded-xl px-6 py-4">
      <span className="font-medium">{name}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">{labels[status]}</span>
        <div className={`w-3 h-3 rounded-full ${colors[status]}`} />
      </div>
    </div>
  );
}
