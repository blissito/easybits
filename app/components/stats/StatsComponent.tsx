import clsx from "clsx";
import { STRINGS } from "./StatsComponent.constants";
import { HiOutlineInformationCircle } from "react-icons/hi";
import LineChart from "../charts/LineChart";

export default function StatsComponent() {
  const data = {
    // last 12 months from now
    labels: Array.from({ length: 12 }, (_, i) =>
      new Date(
        new Date().setMonth(new Date().getMonth() - 11 + i)
      ).toLocaleString("en-US", { month: "short" })
    ),
    datasets: [
      {
        label: null,
        data: [
          1000, 2000, 5000, 2000, 5500, 3500, 8000, 8500, 3000, 5500, 3500,
          8000, 8500,
        ], // Sample data
        borderColor: "#9870ED", // Line color
        borderWidth: 1,
        pointBorderColor: "#9870ED", // Point border color
        pointBackgroundColor: "#9870ED", // Point border color
        tension: 0.1, // Smooth curve
      },
    ],
  };

  //:TODO get these insights and format them
  return (
    <div className="mt-7">
      <div className="w-1/2">
        <p className="text-4xl font-semibold">{STRINGS.title}</p>
        <p className="text-brand-gray text-md">{STRINGS.subtitle}</p>
      </div>
      <div className="flex justify-end">
        {/* improve thissss */}
        <select className="bg-black text-white rounded-xl p-3">
          <option>último año</option>
        </select>
      </div>
      <div className="grid grid-cols-12 gap-6 w-full mt-6">
        {STRINGS.stats.map(({ bgColor, title, amount }) => (
          <div className="relative group col-span-3">
            <div className="absolute w-full inset-0 bg-black rounded-xl transition-transform duration-300 scale-100 group-hover:translate-x-1 group-hover:translate-y-1 opacity-0 group-hover:opacity-100" />
            <div
              className={clsx(
                `rounded-xl z-10 text-black text-lg w-full border-black border-2 cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 bg-white`,
                `bg-${bgColor}`
              )}
            >
              <div className="p-6 pb-10">
                <p className="text-xs text-start mb-2 flex gap-1">
                  {title} <HiOutlineInformationCircle />
                </p>
                <p className="text-3xl">{amount}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="w-full grid grid-cols-12 gap-6 mt-10">
        <div className="col-span-8 rounded-xl border border-black p-6 bg-white">
          <p className="mb-10">Ventas</p>
          <div className="w-full h-[440px]">
            <LineChart data={data} />
          </div>
        </div>
        <div className="col-span-4 rounded-xl border border-black p-6 bg-white">
          ranking WIP
        </div>
      </div>
    </div>
  );
}
