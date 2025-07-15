import type { Route } from "../../+types/clients";
import { createReview, getReviews, updateReview } from "~/.server/reviews";
import { censorBadWords } from "~/utils/censorBadWords";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const assetId = formData.get("assetId") as string;
  const reviewId = formData.get("reviewId") as string;
  const data = JSON.parse(formData.get("data") as string);

  switch (intent) {
    case "create_review":
      data.comment = censorBadWords(data.comment);
      return createReview({
        ...data,
        stars: undefined,
        rating: data.stars,
      });
    case "update_review":
      data.comment = censorBadWords(data.comment);
      return updateReview(reviewId, {
        ...data,
      });
    case "get_reviews":
      return getReviews(assetId);
  }

  return null;
};
