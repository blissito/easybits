import type { Route } from "../../+types/clients";
import { createReview, getReviews, updateReview } from "~/.server/reviews";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const assetId = formData.get("assetId") as string;
  const reviewId = formData.get("reviewId") as string;
  const data = JSON.parse(formData.get("data") as string);

  switch (intent) {
    case "create_review":
      return createReview({
        ...data,
        stars:undefined,
        rating:data.stars
      });
    case "update_review":
      return updateReview(reviewId, {
        ...data,
      });
    case "get_reviews":
      return getReviews(assetId);
  }

  return null;
};
