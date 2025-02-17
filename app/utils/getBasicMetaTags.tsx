export type GetBasicMetaTagsPros = {
  title?: string;
  description?: string;
  image?: string;
  twitterCard?: "summary" | "summary_large_image";
};

export default function getBasicMetaTags({
  title,
  description = "Vende tus assets digitales en línea con EasyBits", // description should be at least 100 chars
  image = "https://i.imgur.com/dnVOAkI.png",
  twitterCard = "summary",
}: GetBasicMetaTagsPros) {
  if (!title) {
    return [
      {
        title: "EasyBits",
      },
      {
        name: "description",
        content: "Vende tus assets digitales en línea con EasyBits",
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
  ];
}
