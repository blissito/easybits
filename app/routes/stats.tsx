import StatsComponent from "~/components/stats/StatsComponent";
import { getUserOrRedirect } from "~/.server/getters";
import Logo from "/icons/easybits-logo.svg";
import { db } from "~/.server/db";
import type { Route } from "./+types/stats";
import type { User, Order } from "@prisma/client";
import { startOfMonth, subMonths } from "date-fns";
import { getVisitsChartData } from "~/.server/telemetry";

type StatsLoaderData = {
  user: User;
  orders: Order[];
  visits: number;
  chartData: any;
};

type OrdersByAsset = {
  [assetId: string]: {
    asset: Order["asset"];
    orders: Order[];
  };
};

type GroupedByMonth = {
  [month: string]: {
    total: number;
    count: number;
  };
};

type MostSoldProduct = {
  imageUrl: string;
  title: string;
  soldTimes: number;
  unitPrice: number;
};

export const loader = async ({
  request,
}: Route.LoaderArgs): Promise<StatsLoaderData> => {
  const user = await getUserOrRedirect(request);

  // Contar visitas a la tienda del usuario y a los detalles de asset
  const visits = await db.telemetryEvent.count({
    where: {
      ownerId: user.id,
      eventType: "visit",
      OR: [{ linkType: "store" }, { linkType: "assetDetail" }],
    },
  });

  // Usar función auxiliar para obtener datos de la gráfica de visitas
  const chartData = await getVisitsChartData(user.id);

  const orders = await db.order.findMany({
    where: {
      merchantId: user.id,
    },
    include: {
      asset: true,
    },
  });

  return { user, orders, visits, chartData };
};

export default function Stats({ loaderData }: { loaderData: StatsLoaderData }) {
  const { user, orders, visits, chartData } = loaderData;

  // --- Group orders by asset ---
  const ordersByAsset: OrdersByAsset = orders.reduce((acc, order) => {
    const key = order.assetId;
    if (!acc[key]) {
      acc[key] = {
        asset: order["asset"],
        orders: [],
      };
    }
    acc[key].orders.push(order);
    return acc;
  }, {} as OrdersByAsset);

  const listOfOrdersByAsset: MostSoldProduct[] = Object.values(ordersByAsset)
    .map(({ asset, orders }) => ({
      imageUrl: asset?.gallery?.[0] || Logo,
      title: asset?.title || "",
      soldTimes: orders.length,
      unitPrice: asset?.price || 0,
    }))
    .sort((a, b) => b.soldTimes - a.soldTimes);

  // --- Group orders by month ---
  const groupedByMonth: GroupedByMonth = orders.reduce((acc, order) => {
    const date = new Date(order.createdAt);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
    if (!acc[monthKey]) {
      acc[monthKey] = { total: 0, count: 0 };
    }
    acc[monthKey].total += Number(order.total);
    acc[monthKey].count += 1;
    return acc;
  }, {} as GroupedByMonth);

  const getCurrentMonthTotal = () => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    const formatted = new Intl.NumberFormat("es", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(groupedByMonth[currentMonthKey]?.total || 0);
    return formatted;
  };

  const getGrandTotal = () => {
    const total = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const formatted = new Intl.NumberFormat("es", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(total);
    return formatted;
  };

  // Usar chartData del loader para la gráfica de visitas
  // const chartData = ... (eliminado para evitar redeclaración)

  const currentMonthTotal = getCurrentMonthTotal();
  const grandTotal = getGrandTotal();

  return (
    <div className="relative z-10 w-full h-full">
      <StatsComponent
        user={user}
        mostSoldProducts={listOfOrdersByAsset}
        chartData={chartData} // Ahora muestra visitas, no ventas
        currentMonthTotal={currentMonthTotal}
        grandTotal={grandTotal}
        visits={visits}
      />
    </div>
  );
}
