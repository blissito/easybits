import { db } from "../db";

export async function createBook(data: {
  assetId: string;
  userId: string;
  sourceText?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  theme?: string;
}) {
  // Verify asset belongs to user
  const asset = await db.asset.findUnique({ where: { id: data.assetId } });
  if (!asset || asset.userId !== data.userId) throw new Error("Asset not found");

  return db.book.create({
    data: {
      assetId: data.assetId,
      sourceText: data.sourceText,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage || "es",
      theme: data.theme || "default",
    },
    include: { chapters: true },
  });
}

export async function getBook(assetId: string, userId: string) {
  const book = await db.book.findUnique({
    where: { assetId },
    include: { chapters: { orderBy: { order: "asc" } }, asset: true },
  });
  if (!book || book.asset.userId !== userId) return null;
  return book;
}

export async function getChapter(chapterId: string, userId: string) {
  const chapter = await db.bookChapter.findUnique({
    where: { id: chapterId },
    include: { book: { include: { asset: true } } },
  });
  if (!chapter || chapter.book.asset.userId !== userId) return null;
  return chapter;
}

export async function updateChapter(
  chapterId: string,
  userId: string,
  data: {
    title?: string;
    order?: number;
    sections?: any;
    sectionVersions?: any;
    status?: string;
    sourceText?: string;
  }
) {
  const chapter = await getChapter(chapterId, userId);
  if (!chapter) throw new Error("Chapter not found");
  return db.bookChapter.update({
    where: { id: chapterId },
    data,
  });
}

export async function deleteChapter(chapterId: string, userId: string) {
  const chapter = await getChapter(chapterId, userId);
  if (!chapter) throw new Error("Chapter not found");
  await db.bookChapter.delete({ where: { id: chapterId } });
  // Reorder remaining chapters
  const remaining = await db.bookChapter.findMany({
    where: { bookId: chapter.bookId },
    orderBy: { order: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].order !== i) {
      await db.bookChapter.update({
        where: { id: remaining[i].id },
        data: { order: i },
      });
    }
  }
}

export async function createChaptersFromChunks(
  bookId: string,
  chapters: { title: string; text: string }[]
) {
  const created = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = await db.bookChapter.create({
      data: {
        bookId,
        title: chapters[i].title,
        order: i,
        sourceText: chapters[i].text,
        sections: [],
        status: "draft",
      },
    });
    created.push(ch);
  }
  return created;
}

export async function updateBook(
  assetId: string,
  userId: string,
  data: {
    theme?: string;
    customColors?: any;
    metadata?: any;
    targetLanguage?: string;
  }
) {
  const book = await getBook(assetId, userId);
  if (!book) throw new Error("Book not found");
  return db.book.update({
    where: { id: book.id },
    data,
  });
}

export async function addChapter(
  bookId: string,
  userId: string,
  data: { title: string; sourceText?: string }
) {
  // Verify ownership
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { asset: true },
  });
  if (!book || book.asset.userId !== userId) throw new Error("Book not found");
  const maxOrder = await db.bookChapter.findFirst({
    where: { bookId },
    orderBy: { order: "desc" },
  });
  return db.bookChapter.create({
    data: {
      bookId,
      title: data.title,
      order: (maxOrder?.order ?? -1) + 1,
      sourceText: data.sourceText,
      sections: [],
      status: "draft",
    },
  });
}

export async function reorderChapters(
  bookId: string,
  userId: string,
  chapterIds: string[]
) {
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { asset: true },
  });
  if (!book || book.asset.userId !== userId) throw new Error("Book not found");
  for (let i = 0; i < chapterIds.length; i++) {
    await db.bookChapter.update({
      where: { id: chapterIds[i] },
      data: { order: i },
    });
  }
}
