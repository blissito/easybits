import RocketIcon from "/icons/rocket.svg?url";
import StatsIcon from "/icons/stonks.svg?url";
import AssetsIcon from "/icons/magic-box.svg?url";
import StoreIcon from "/icons/laptop-and-mobile.svg?url";
import MoneyIcon from "/icons/moneybag.svg?url";
import BagIcon from "/icons/purchase.svg?url";
import UsersIcon from "/icons/users.svg?url";
import UserIcon from "/icons/profile.svg?url";
import LogoutIcon from "/icons/log-out.svg?url";
import FilesIcon from "/icons/storage.svg";
import { Rocket } from "~/components/icons/rocket";
import { Stonks } from "../icons/stonks";
import { MagicBox } from "../icons/magic-box";
import { Money } from "../icons/money";
import { Clients } from "../icons/clients";
import { Logout } from "../icons/logout";
import { Storage } from "../icons/storage";
import { Profile } from "../icons/profile";
import { Purchase } from "../icons/purchase";

export const ITEMS = {
  navItems: [
    {
      icon: <Rocket />,
      path: "/dash/",
      title: "¡Empieza ya!",
      end: true,
      index: 9,
    },
    {
      icon: <Stonks />,
      path: "/dash/estadisticas",
      title: "Estadísticas",
      index: 8,
    },
    { icon: <MagicBox />, path: "/dash/assets", title: "Assets", index: 7 },
    { icon: <Money />, path: "/dash/tienda", title: "Mi tienda", index: 6 },
    { icon: <Money />, path: "/dash/ventas", title: "Ventas", index: 5 },
    { icon: <Clients />, path: "/dash/clientes", title: "Clientes", index: 4 },
  ],

  sectionItems: [
    { icon: <Storage />, path: "/dash/archivos", title: "Archivos", index: 3 },
    { icon: <Purchase />, path: "/dash/compras", title: "Compras", index: 2 },
  ],

  bottomItems: [
    { icon: <Profile />, path: "/dash/perfil", title: "Perfil", index: 1 },
    {
      icon: <Logout />,
      path: "/login?signout=1",
      title: "Cerrar Sesión",
      index: 0,
    },
  ],
};
