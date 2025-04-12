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
      icon: <img className="scale" src="/images/rocket.svg" />,
      path: "/dash",
      title: "¡Empieza ya!",
      end: true,
      index: 9,
    },
    {
      icon: <img className="scale" src="/images/stats.svg" />,
      path: "/dash/estadisticas",
      title: "Estadísticas",
      index: 8,
    },
    {
      icon: <img className="scale" src="/images/assets.svg" />,
      path: "/dash/assets",
      title: "Assets",
      index: 7,
    },
    {
      icon: <img className="scale" src="/images/website.svg" />,
      path: "/dash/tienda",
      title: "Mi tienda",
      index: 6,
    },
    {
      icon: <img className="scale" src="/images/money.svg" />,
      path: "/dash/ventas",
      title: "Ventas",
      index: 5,
    },
    {
      icon: <img className="scale" src="/images/clients.svg" />,
      path: "/dash/clientes",
      title: "Clientes",
      index: 4,
    },
  ],

  sectionItems: [
    {
      icon: <img className="scale" src="/images/storage.svg" />,
      path: "/dash/archivos",
      title: "Archivos",
      index: 3,
    },
    {
      icon: <img className="scale" src="/images/bag.svg" />,
      path: "/dash/compras",
      title: "Compras",
      index: 2,
    },
  ],

  bottomItems: [
    {
      icon: <img className="scale" src="/images/profile.svg" />,
      path: "/dash/perfil",
      title: "Perfil",
      index: 1,
    },
    {
      icon: <img className="scale" src="/images/out.svg" />,
      path: "/login?signout=1",
      title: "Cerrar Sesión",
      index: 0,
    },
  ],
};
