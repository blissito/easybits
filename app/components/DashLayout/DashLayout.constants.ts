import RocketIcon from "~/assets/icons/rocket.svg?url";
import StatsIcon from "~/assets/icons/stonks.svg?url";
import AssetsIcon from "~/assets/icons/magic-box.svg?url";
import StoreIcon from "~/assets/icons/laptop-and-mobile.svg?url";
import MoneyIcon from "~/assets/icons/money.svg?url";
import BagIcon from "~/assets/icons/purchase.svg?url";
import UsersIcon from "~/assets/icons/users.svg?url";
import UserIcon from "~/assets/icons/profile.svg?url";
import LogoutIcon from "~/assets/icons/log-out.svg?url";

export const ITEMS = {
  navItems: [
    { icon: RocketIcon, path: "/dash/", title: "!Empieza ya!", end: true },
    { icon: StatsIcon, path: "/dash/estadisticas", title: "Estadísticas" },
    { icon: AssetsIcon, path: "/dash/assets", title: "Assets" },
    { icon: StoreIcon, path: "/dash/tienda", title: "Mi tienda" },
    { icon: MoneyIcon, path: "/dash/ventas", title: "Ventas" },
    { icon: UsersIcon, path: "/dash/clientes", title: "Clientes" },
  ],

  sectionItems: [{ icon: BagIcon, path: "/dash/compras", title: "Compras" }],

  bottomItems: [
    { icon: UserIcon, path: "/", title: "Perfil" },
    { icon: LogoutIcon, path: "/login?signout=1", title: "Cerrar Sesión" },
  ],
};
