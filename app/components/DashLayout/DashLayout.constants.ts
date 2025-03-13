import RocketIcon from "/icons/rocket.svg?url";
import StatsIcon from "/icons/stonks.svg?url";
import AssetsIcon from "/icons/magic-box.svg?url";
import StoreIcon from "/icons/laptop-and-mobile.svg?url";
import MoneyIcon from "/icons/money.svg?url";
import BagIcon from "/icons/purchase.svg?url";
import UsersIcon from "/icons/users.svg?url";
import UserIcon from "/icons/profile.svg?url";
import LogoutIcon from "/icons/log-out.svg?url";
import FilesIcon from "/icons/storage.svg";

export const ITEMS = {
  navItems: [
    { icon: RocketIcon, path: "/dash/", title: "¡Empieza ya!", end: true },
    { icon: StatsIcon, path: "/dash/estadisticas", title: "Estadísticas" },
    { icon: AssetsIcon, path: "/dash/assets", title: "Assets" },
    { icon: StoreIcon, path: "/dash/tienda", title: "Mi tienda" },
    { icon: MoneyIcon, path: "/dash/ventas", title: "Ventas" },
    { icon: UsersIcon, path: "/dash/clientes", title: "Clientes" },
  ],

  sectionItems: [
    { icon: FilesIcon, path: "/dash/archivos", title: "Archivos" },
    { icon: BagIcon, path: "/dash/compras", title: "Compras" },
  ],

  bottomItems: [
    { icon: UserIcon, path: "/dash/perfil", title: "Perfil" },
    { icon: LogoutIcon, path: "/login?signout=1", title: "Cerrar Sesión" },
  ],
};
