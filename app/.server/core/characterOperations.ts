/**
 * Character kits — reusable identity for video generation.
 * A Character holds 1–3 reference images whose `@slug` is injected into
 * Gen-4 Image prompts to preserve the same face/look across generations.
 */
import { db } from "../db";
import { toRunwayTag } from "../runway";

export interface CreateCharacterInput {
  name: string;
  referenceImageUrls: string[];
  referenceFileIds?: string[];
  description?: string;
}

export interface UpdateCharacterInput {
  name?: string;
  referenceImageUrls?: string[];
  referenceFileIds?: string[];
  description?: string;
}

const MIN_REFS = 1;
const MAX_REFS = 3;

async function deriveUniqueSlug(userId: string, name: string, excludeId?: string): Promise<string> {
  const base = toRunwayTag(name);
  let slug = base;
  let attempt = 0;
  while (attempt < 20) {
    const existing = await db.character.findFirst({
      where: {
        ownerId: userId,
        slug,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${base}${attempt + 1}`;
  }
  throw new Error("Could not derive a unique slug for this character");
}

function validateReferences(urls: string[]) {
  if (!Array.isArray(urls) || urls.length < MIN_REFS) {
    throw new Error(`At least ${MIN_REFS} reference image is required`);
  }
  if (urls.length > MAX_REFS) {
    throw new Error(`Maximum ${MAX_REFS} reference images allowed`);
  }
  for (const url of urls) {
    if (!/^https:\/\//i.test(url)) {
      throw new Error(`Reference image URLs must be HTTPS: ${url}`);
    }
  }
}

export async function listCharacters(userId: string) {
  return db.character.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCharacter(id: string, userId: string) {
  const char = await db.character.findUnique({ where: { id } });
  if (!char || char.ownerId !== userId) throw new Error("Character not found");
  return char;
}

export async function getCharacterBySlug(slug: string, userId: string) {
  const normalized = toRunwayTag(slug);
  return db.character.findFirst({
    where: { ownerId: userId, slug: normalized },
  });
}

/**
 * Resolves a character by either id or name/slug. Throws if not found when
 * `required` is true.
 */
export async function resolveCharacter(
  userId: string,
  identifier: string | undefined,
  required = false,
) {
  if (!identifier) return null;
  let char = null;
  if (/^[a-f0-9]{24}$/i.test(identifier)) {
    char = await db.character.findUnique({ where: { id: identifier } });
    if (char && char.ownerId !== userId) char = null;
  }
  if (!char) {
    char = await getCharacterBySlug(identifier, userId);
  }
  if (!char && required) throw new Error(`Character not found: ${identifier}`);
  return char;
}

export async function createCharacter(userId: string, input: CreateCharacterInput) {
  if (!input.name?.trim()) throw new Error("Character name is required");
  validateReferences(input.referenceImageUrls);
  const slug = await deriveUniqueSlug(userId, input.name);
  return db.character.create({
    data: {
      ownerId: userId,
      name: input.name.trim(),
      slug,
      referenceImageUrls: input.referenceImageUrls,
      referenceFileIds: input.referenceFileIds ?? [],
      description: input.description,
    },
  });
}

export async function updateCharacter(id: string, userId: string, input: UpdateCharacterInput) {
  const char = await getCharacter(id, userId);
  const patch: Record<string, unknown> = {};
  if (input.name && input.name.trim() && input.name.trim() !== char.name) {
    patch.name = input.name.trim();
    patch.slug = await deriveUniqueSlug(userId, input.name, char.id);
  }
  if (input.referenceImageUrls) {
    validateReferences(input.referenceImageUrls);
    patch.referenceImageUrls = input.referenceImageUrls;
  }
  if (input.referenceFileIds !== undefined) patch.referenceFileIds = input.referenceFileIds;
  if (input.description !== undefined) patch.description = input.description;
  return db.character.update({ where: { id }, data: patch as any });
}

export async function deleteCharacter(id: string, userId: string) {
  const char = await getCharacter(id, userId);
  return db.character.delete({ where: { id: char.id } });
}
