type MetaTag = {
  name: string;
  content: string;
};

type Others = MetaTag[];

export type GetBasicMetaTagsPros = {
  title?: string;
  description?: string;
  image?: string;
  twitterCard?: "summary" | "summary_large_image";
  url?: string; // URL absoluta de la página (https://...). Default: home.
  others?: Others;
};

export default function getBasicMetaTags({
  title,
  description = "Convierte esas ilustraciones, ese libro, ese cuento o esas conferencias en assets digitales", // description should be at least 100 chars
  image = "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp",
  twitterCard = "summary_large_image",
  url = "https://www.easybits.cloud",
  others = [],
}: GetBasicMetaTagsPros) {
  if (!title) {
    return [
      {
        title: "Vende tu primer asset digital en línea con EasyBits",
      },
      {
        name: "description",
        content: "Vende tu primer asset digital en línea con EasyBits",
      },
    ];
  }
  return [
    { title },
    // Open Graph — usado por WhatsApp, Slack, iMessage, LinkedIn, Facebook
    {
      property: "og:title",
      content: title,
    },
    {
      property: "og:description",
      content: description,
    },
    {
      property: "og:image",
      content: image,
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      property: "og:url",
      content: url,
    },
    {
      property: "og:site_name",
      content: "EasyBits",
    },
    {
      property: "og:locale",
      content: "es_MX",
    },
    // SEO description (Google etc.)
    {
      name: "description",
      content: description,
    },
    // Twitter Card
    {
      name: "twitter:card",
      content: twitterCard,
    },
    {
      name: "twitter:title",
      content: title,
    },
    {
      name: "twitter:description",
      content: description,
    },
    {
      name: "twitter:image",
      content: image,
    },
    ...others,
  ];
}
