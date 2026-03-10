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
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      ),
      path: "/dash/presentations",
      title: "Presentaciones",
      index: 5,
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      ),
      path: "/dash/landings",
      title: "Landings",
      index: 4,
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M12 3v18" />
        </svg>
      ),
      path: "/dash/landings2",
      title: "Landings v2",
      index: 3.5,
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h6" />
          <path d="M7 16h8" />
        </svg>
      ),
      path: "/dash/landings3",
      title: "Landings v3",
      index: 3.4,
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      path: "/dash/documents",
      title: "Documentos",
      index: 3.3,
    },
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

  externalItems: [
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      ),
      path: "https://mailmask.studio",
      title: "Email",
      index: 0,
    },
  ],

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
