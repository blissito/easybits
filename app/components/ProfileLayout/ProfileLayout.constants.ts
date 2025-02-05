import RocketIcon from "~/assets/icons/rocket.svg";
import StatsIcon from "~/assets/icons/stonks.svg";
import AssetsIcon from "~/assets/icons/magic-box.svg";
import StoreIcon from "~/assets/icons/laptop-and-mobile.svg";
import MoneyIcon from "~/assets/icons/money.svg";
import BagIcon from "~/assets/icons/purchase.svg";
import UsersIcon from "~/assets/icons/users.svg";
import UserIcon from "~/assets/icons/profile.svg";
import LogoutIcon from "~/assets/icons/log-out.svg";

export const ITEMS = {
  navItems: [
    { icon: RocketIcon, path: "/dash/start", title: "!Empieza ya!" },
    { icon: StatsIcon, path: "/dash/stats", title: "Estadísticas" },
    { icon: AssetsIcon, path: "/dash/assets", title: "Assets" },
    { icon: StoreIcon, path: "/dash/store", title: "Mi tienda" },
    { icon: MoneyIcon, path: "/dash/sales", title: "Ventas" },
    { icon: UsersIcon, path: "/dash/clients", title: "Clientes" },
  ],

  sectionItems: [{ icon: BagIcon, path: "/dash/purchases", title: "Compras" }],

  bottomItems: [
    { icon: UserIcon, path: "/", title: "Perfil" },
    { icon: LogoutIcon, path: "/", title: "Cerrar Sesión" },
  ],
};
