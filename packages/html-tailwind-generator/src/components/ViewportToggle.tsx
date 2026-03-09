import React from "react";

export type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORTS: { id: Viewport; label: string; icon: React.ReactElement }[] = [
  {
    id: "desktop",
    label: "Desktop",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v8.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-8.5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    id: "tablet",
    label: "Tablet",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M5 1a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2H5zm0 1.5h10a.5.5 0 01.5.5v14a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5zm4 14a1 1 0 112 0 1 1 0 01-2 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    id: "mobile",
    label: "Mobile",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm0 1.5h8a.5.5 0 01.5.5v12a.5.5 0 01-.5.5H6a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5zm3 13a1 1 0 112 0 1 1 0 01-2 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

export function ViewportToggle({
  value,
  onChange,
  activeClass = "bg-blue-100 text-blue-700",
  inactiveClass = "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
}: {
  value: Viewport;
  onChange: (v: Viewport) => void;
  activeClass?: string;
  inactiveClass?: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1 py-2 shrink-0 bg-gray-50 border-b border-gray-200">
      {VIEWPORTS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          title={v.label}
          className={`p-1.5 rounded-lg transition-colors ${
            value === v.id ? activeClass : inactiveClass
          }`}
        >
          {v.icon}
        </button>
      ))}
    </div>
  );
}
