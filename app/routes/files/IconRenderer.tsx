import type { ReactNode } from "react";

export const IconRenderer = ({
  icons,
  type,
}: {
  icons: { other: ReactNode; [x: string]: ReactNode };
  type: string;
}) => {
  let icon = icons.other;
  for (let k in icons) {
    if (type.includes(k)) {
      icon = icons[k];
    }
  }
  return (
    <span className="border border-black w-6 h-6 grid place-content-center rounded-full">
      {icon}
    </span>
  );
};
