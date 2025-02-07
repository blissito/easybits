import NewAccount from "~/assets/icons/new-account.svg";
import ItemsList from "~/assets/icons/list.svg";
import ShoppingShare from "~/assets/icons/shopping-share.svg";
import AddWallet from "~/assets/icons/add-wallet.svg";
import Website from "~/assets/icons/website.svg";

export const STRINGS = {
  title: "¡Ya casi está lista tu página!",
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
      path: "/dash/payments",
    },
    {
      title: "Conoce tu landing page",
      subtitle: "Échale un ojo a tu landing page y pruébala",
      image: Website,
      cta: "Visitar",
      isCompleted: false,
      path: "/dash/profile",
    },
    {
      title: "Comparte el link con tus seguidores o clientes",
      subtitle: "¡Tu primer venta esta en camino!",
      image: ShoppingShare,
      cta: "Copiar",
      isCompleted: false,
    },
  ],
};
