import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import StatsComponent from "~/components/stats/StatsComponent";
import type { Route } from "../+types/root";
import { getUserOrRedirect } from "~/.server/getters";
import Logo from "/icons/easybits-logo.svg";

export const loader = async ({ request }: Route.LoaderArgs) => ({
  user: await getUserOrRedirect(request),
});

export default function Stats({ loaderData }) {
  const { user } = loaderData;
  const mostSoldProducts = [
    {
      imageUrl: Logo,
      title: "Salsas Mexas",
      soldTimes: 2,
      unitPrice: 250,
    },
    {
      imageUrl: Logo,
      title: "Recetario JapoMexa",
      soldTimes: 1,
      unitPrice: 350,
    },
    {
      imageUrl: Logo,
      title: "Comida oaxaqueña secrets",
      soldTimes: 8,
      unitPrice: 150,
    },
    {
      imageUrl: Logo,
      title: "Moles y otros misterios",
      soldTimes: 99,
      unitPrice: 100,
    },
  ];
  const salesData = {
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

  return (
    <>
      <section className="py-20 px-10 w-full relative h-screen">
        <GridBackground />
        <div className="relative z-10 w-full h-full">
          <StatsComponent
            user={user}
            mostSoldProducts={mostSoldProducts}
            salesData={salesData}
          />
        </div>
      </section>
    </>
  );
}
