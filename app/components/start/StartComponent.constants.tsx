import NewAccount from "/icons/new-accounts.png";
import ItemsList from "/icons/items-list.svg";
import ShoppingShare from "/icons/shopping-share.svg";
import AddWallet from "/icons/add-wallet.svg";
import Website from "/icons/website.svg";
import { useOpenLink } from "~/hooks/useOpenLink";

export const STRINGS = {
  title: "¡Tu website está casi listo!",
  subtitle: "Estás a unos pasos de empezar a vender tus productos digitales",
  anyQuestion: "¿Tienes alguna duda?",
  contactUs: "Escríbenos",
  steps: [
    {
      title: "Crea tu cuenta",
      subtitle: "El primer paso ya está hecho",
      image: NewAccount,
      cta: "Picale",
      isCompleted: true,
      path: "/dash/profile",
    },
    {
      title: "Agrega tu primer asset digital",
      subtitle: "Agrega uno o más productos",
      image: ItemsList,
      cta: "Agregar",
      isCompleted: false,
      path: "/dash/assets",
    },
    {
      title: "Da de alta tu cuenta de pagos",
      subtitle: "Crea tu cuenta de Stripe y vincúlala a EasyBits",
      image: AddWallet,
      cta: "Ir",
      isCompleted: false,
      path: "/dash/ventas",
    },
    {
      title: "Conoce tu landing page",
      subtitle: "Échale un ojo a tu landing page y pruébala",
      image: Website,
      cta: "Visitar",
      isCompleted: false,
      path: "/dash/tienda",
    },
    {
      title: "Comparte el link con tus seguidores o clientes",
      subtitle: "¡Tu primer venta esta en camino!",
      image: ShoppingShare,
      cta: "Copiar",
      isCompleted: false,
      path: "", //easybits url
    },
  ],
};
