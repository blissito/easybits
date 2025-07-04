import StatsComponent from "~/components/stats/StatsComponent";
import type { Route } from "../+types/root";
import { getUserOrRedirect } from "~/.server/getters";
import Logo from "/icons/easybits-logo.svg";
import { db } from "~/.server/db";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);

  const orders = await db.order.findMany({
    where: {
      userId: user.id,
    },
    include: {
      asset: true,
    },
  });

  return { user, orders };
};

export default function Stats({ loaderData }: Route.ComponentProps) {
  const { user, orders } = loaderData;

  // --- Group orders by asset ---
  const ordersByAsset = orders.reduce((acc, order) => {
    const key = order.assetId;

    if (!acc[key]) {
      acc[key] = {
        asset: order.asset,
        orders: [],
      };
    }

    acc[key].orders.push(order);
    return acc;
  }, {});

  const listOfOrdersByAsset = Object.values(ordersByAsset)
    .map(({ asset, orders }) => ({
      imageUrl: asset.gallery?.[0] || Logo,
      title: asset.title,
      soldTimes: orders.length,
      unitPrice: asset.price,
    }))
    .sort((a, b) => b.soldTimes - a.soldTimes);

  // --- Group orders by month ---
  const groupedByMonth = orders.reduce((acc, order) => {
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
  }, {});

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

  const ordersDataFormattedByMonth = Object.entries(groupedByMonth)
    .map(([month, data]) => ({
      month,
      totalSales: data.total,
    }))
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

  // --- Format chart data ---
  const chartData = {
    labels: ordersDataFormattedByMonth.map(({ month }) => {
      const [year, monthNum] = month.split("-").map(Number);
      const date = new Date(Date.UTC(year, monthNum));
      const raw = new Intl.DateTimeFormat("es", { month: "short" }).format(
        date
      );
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }),
    datasets: [
      {
        label: "Total Sales",
        data: ordersDataFormattedByMonth.map((item) => item.totalSales),
        borderColor: "#9870ED",
        backgroundColor: "rgba(152, 112, 237, 0.1)",
        borderWidth: 2,
        pointBorderColor: "#9870ED",
        pointBackgroundColor: "#9870ED",
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const currentMonthTotal = getCurrentMonthTotal();
  const grandTotal = getGrandTotal();

  return (
    <div className="relative z-10 w-full h-full">
      <StatsComponent
        user={user}
        mostSoldProducts={listOfOrdersByAsset}
        chartData={chartData}
        currentMonthTotal={currentMonthTotal}
        grandTotal={grandTotal}
      />
    </div>
  );
}
