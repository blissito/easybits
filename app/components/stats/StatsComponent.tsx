import { STRINGS } from "./StatsComponent.constants";
import { HiOutlineInformationCircle } from "react-icons/hi";
import LineChart from "../charts/LineChart";
import { cn } from "~/utils/cn";

export default function StatsComponent({ user, salesData, mostSoldProducts }) {
  //:TODO get these insights and format them
  return (
    <div className="min-h-screen lg:h-screen  px-4 md:pr-[5%] md:pl-[10%]   xl:px-0">
      <div className="max-w-7xl mx-auto flex flex-col h-full pt-16 pb-0 md:pt-10 box-border  ">
        <div className="flex justify-between items-end flex-wrap">
          <div className="w-full md:w-2/3">
            <p className="text-3xl md:text-4xl font-semibold pt-1 md:pt-0">
              {STRINGS.title}
              {user.displayName || user.email?.split("@")[0]}
            </p>
            <p className="text-iron text-md whitespace-normal lg:whitespace-pre-line mt-4">
              {STRINGS.subtitle}
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            {/* improve thissss */}
            <select className="bg-black text-white rounded-xl p-3">
              <option>último año</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-6 w-full mt-6">
          {STRINGS.stats.map(({ className, title, amount }) => (
            <div className="relative group col-span-3">
              <div className="absolute w-full inset-0 bg-black rounded-xl transition-transform duration-300 scale-100 group-hover:translate-x-1 group-hover:translate-y-1 opacity-0 group-hover:opacity-100" />
              <div
                className={cn(
                  "rounded-xl z-10 text-black text-lg w-full border-black border cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 bg-white",
                  className
                )}
              >
                <div className="p-4 lg:p-6 ">
                  <p className="text-base text-start mb-2 gap-1 flex items-center">
                    {title} <HiOutlineInformationCircle />
                  </p>
                  <p className="text-3xl lg:text-4xl font-bold mt-3">
                    {amount}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="w-full grid grid-cols-12 gap-6 py-6 md:py-10 h-full   ">
          <div className="col-span-12 lg:col-span-8 rounded-xl border border-black p-4 md:p-6 bg-white h-full flex flex-col justify-between ">
            <p className="mb-10">Ventas</p>
            <div className="w-full h-full  min-h-[200px]">
              <LineChart data={salesData} />
            </div>
          </div>
          <div
            className="col-span-12 lg:col-span-4 rounded-xl border border-black p-4 md:p-6 bg-white order-first lg:order-2
"
          >
            <p className="mb-2 font-semibold text-lg">Productos mas vendidos</p>
            {mostSoldProducts.map(
              ({ imageUrl, title, soldTimes, unitPrice }) => (
                <div className="flex justify-between gap-4 items-start py-4 border-b border-li">
                  <img
                    className="w-[48px] h-[48px] rounded-xl"
                    src={imageUrl}
                  />
                  <div className="w-full">
                    <p className="text-sm text-start">{title}</p>
                    <p className="text-xs text-brand-gray">
                      {soldTimes} venta{soldTimes > 1 ? "s" : null}
                    </p>
                  </div>
                  <p className="text-base text-brand-gray">
                    ${soldTimes * unitPrice}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
