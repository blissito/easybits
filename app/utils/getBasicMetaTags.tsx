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
  others?: Others;
};

export default function getBasicMetaTags({
  title,
  description = "Convierte esas ilustraciones, ese libro, ese cuento o esas conferencias en assets digitales", // description should be at least 100 chars
  image = "https://brendiwebsite.fly.storage.tigris.dev/metaImage-easybits.webp",
  twitterCard = "summary_large_image",
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
    {
      property: "og:title",
      content: title,
    },
    {
      name: "description",
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
      content: "www.easybits.cloud",
    },
    {
      name: "twitter:card",
      content: twitterCard,
    },
    {
      name: "twitter:image",
      content: image,
    },
    ...others,
  ];
}
