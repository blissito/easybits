import { NavLink, Outlet } from "react-router";

export const meta = () => [
  { title: "Developer — EasyBits" },
  { name: "robots", content: "noindex" },
];

const tabs = [
  { to: "/dash/developer", label: "API Keys", end: true },
  { to: "/dash/developer/files", label: "Files" },
  { to: "/dash/developer/websites", label: "Websites" },
  { to: "/dash/developer/setup", label: "Setup" },
];

export default function DeveloperLayout() {
  return (
    <article className="pt-20 px-8 md:pl-36 w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6 uppercase">
        Developer Dashboard
      </h1>
      <nav className="flex gap-2 mb-8" aria-label="Secciones de desarrollador">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              isActive
                ? "group rounded-xl bg-black"
                : "group rounded-xl bg-transparent"
            }
          >
            {({ isActive }) => (
              <span
                className={`block px-4 py-2 text-sm font-bold rounded-xl border-2 border-black transition-all ${
                  isActive
                    ? "bg-brand-500 text-white -translate-x-1 -translate-y-1"
                    : "bg-white hover:-translate-x-1 hover:-translate-y-1"
                }`}
              >
                {tab.label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </article>
  );
}
