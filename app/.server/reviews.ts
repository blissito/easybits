import { db } from "./db";

type ReviewType = {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  comment: string;
};

export const createReview = async (review: ReviewType) => {
  return await db.review.create({
    data: {
      ...review,
    },
  });
};

export const updateReview = async (
  reviewId: string,
  review: Partial<ReviewType>
) => {
  return await db.review.update({
    where: {
      id: reviewId,
    },
    data: {
      ...review,
    },
  });
};

export const getReviews = async (assetId: string) => {
  return await db.review.findMany({
    where: {
      assetId,
    },
    include: {
      user: true,
    },
  });
};
