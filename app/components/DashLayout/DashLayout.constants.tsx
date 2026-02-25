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

  adminItem: {
    icon: (
      <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    path: "/dash/admin",
    title: "Admin",
    index: 3,
  },

  bottomItems: [
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      path: "/dash/developer",
      title: "Developer",
      index: 2,
    },
    {
      icon: <img className="scale" src="/images/profile.svg" />,
      path: "/dash/perfil",
      title: "Perfil",
      index: 1,
    },
    {
      icon: <img className="scale" src="/images/out.svg" />,
      path: "/logout",
      title: "Cerrar Sesión",
      index: 0,
    },
  ],
};
