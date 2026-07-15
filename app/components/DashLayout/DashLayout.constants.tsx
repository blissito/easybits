import type { ReactNode } from "react";

export interface SidebarItem {
  icon: ReactNode;
  path: string;
  title: string;
  end?: boolean;
  index?: number;
}

export interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

export const ITEMS = {
  /** Primer ítem suelto — el "home" del dash */
  inicioItem: {
    icon: <img className="scale" src="/images/rocket.svg" />,
    path: "/dash",
    title: "Inicio",
    end: true,
  } as SidebarItem,

  /** Secciones agrupadas con micro-label */
  sections: [
    {
      label: "Crear",
      items: [
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
        },
        {
          icon: (
            <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M9 7h6" />
              <path d="M9 11h6" />
              <path d="M9 15h3" />
            </svg>
          ),
          path: "/dash/forms",
          title: "Formularios",
        },
        {
          icon: (
            <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          ),
          path: "/dash/landings4",
          title: "Landings",
        },
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
        },
        {
          icon: (
            <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          ),
          path: "/dash/videos",
          title: "Videos",
        },
      ],
    },
    {
      label: "Biblioteca",
      items: [
        {
          icon: <img className="scale" src="/images/storage.svg" />,
          path: "/dash/archivos",
          title: "Archivos",
        },
        {
          icon: (
            <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
          ),
          path: "/dash/characters",
          title: "Personajes",
        },
        {
          icon: (
            <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="16" r="2" />
              <path d="M15.5 8.5L17 14" />
              <path d="M8.5 13.5L12 16" />
            </svg>
          ),
          path: "/dash/brand-kits",
          title: "Brand Kits",
        },

      ],
    },

  ] as SidebarSection[],

  /** Ítems sueltos entre las secciones y el bottom — cuenta + tools */
  middleItems: [
    {
      icon: <img className="scale" src="/images/stats.svg" />,
      path: "/dash/estadisticas",
      title: "Estadísticas",
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
      path: "/dash/packs",
      title: "Créditos AI",
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 4v4" />
          <circle cx="12" cy="3" r="1" />
          <path d="M2 13h2" />
          <path d="M20 13h2" />
          <circle cx="9" cy="13" r="1" />
          <circle cx="15" cy="13" r="1" />
          <path d="M9 17h6" />
        </svg>
      ),
      path: "/dash/flota",
      title: "Flota",
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 12h.01M12 12h.01M16 12h.01" />
          <path d="M21 12c0 4.418-4.03 8-9 8a9.8 9.8 0 0 1-4-.83l-4 1.83 1.3-3.9A7.6 7.6 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      // URL completa → SideBar lo detecta como external y abre en pestaña nueva
      // (<a target="_blank">). Directo al ingress estable con revive/provisión.
      path: "https://teams.formmy.app",
      title: "Ghosty Teams",
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      ),
      path: "/dash/email",
      title: "Email",
    },
    {
      icon: (
        <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      path: "/dash/developer",
      title: "Developer",
    },
  ] as SidebarItem[],

  /** Cuentas de clientes — "operar como"; se inserta para admins junto a Admin */
  cuentasItem: {
    icon: (
      <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    path: "/dash/cuentas",
    title: "Cuentas",
  } as SidebarItem,

  /** Admin — se inserta al inicio de middleItems cuando el usuario es admin */
  adminItem: {
    icon: (
      <svg className="scale" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    path: "/dash/admin",
    title: "Admin",
  } as SidebarItem,

  /** Ítems fijos al fondo */
  bottomItems: [
    {
      icon: <img className="scale" src="/images/profile.svg" />,
      path: "/dash/perfil",
      title: "Perfil",
    },
    {
      icon: <img className="scale" src="/images/out.svg" />,
      path: "/logout",
      title: "Cerrar Sesión",
    },
  ] as SidebarItem[],
};
