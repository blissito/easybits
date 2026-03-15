/**
 * Split raw text into chapters by detecting chapter headings.
 * Supports patterns like:
 * - "Chapter 1", "Chapter I", "CHAPTER ONE"
 * - "Capítulo 1", "CAPÍTULO I"
 * - Roman numerals alone on a line (I, II, III, IV, V, etc.)
 * - Lines that are ALL CAPS and short (< 80 chars) as potential chapter titles
 */

interface ChapterChunk {
  title: string;
  text: string;
}

const CHAPTER_PATTERNS = [
  // English: Chapter 1, Chapter I, Chapter One
  /^(?:chapter|chap\.?)\s+[\dIVXLCDMivxlcdm]+[\s.:—–-]*(.*)/i,
  // Spanish: Capítulo 1, Capítulo I
  /^(?:capítulo|capitulo|cap\.?)\s+[\dIVXLCDMivxlcdm]+[\s.:—–-]*(.*)/i,
  // Standalone Roman numeral (I, II, III, IV, V, VI, VII, VIII, IX, X, etc.)
  /^((?:X{0,3})(?:IX|IV|V?I{0,3}))\.?\s*$/i,
  // Part N
  /^(?:part|parte)\s+[\dIVXLCDMivxlcdm]+[\s.:—–-]*(.*)/i,
];

function isChapterHeading(line: string): { isChapter: boolean; title: string } {
  const trimmed = line.trim();
  if (!trimmed) return { isChapter: false, title: "" };

  for (const pattern of CHAPTER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const subtitle = (match[1] || "").trim();
      return { isChapter: true, title: subtitle || trimmed };
    }
  }

  // ALL CAPS short line (likely a chapter title)
  if (
    trimmed.length > 2 &&
    trimmed.length < 80 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed) &&
    !/^\d+$/.test(trimmed)
  ) {
    return { isChapter: true, title: trimmed };
  }

  return { isChapter: false, title: "" };
}

export function chunkByChapters(text: string): ChapterChunk[] {
  const lines = text.split(/\r?\n/);
  const chapters: ChapterChunk[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const { isChapter, title } = isChapterHeading(line);
    if (isChapter) {
      // Save previous chapter if it has content
      if (currentLines.length > 0 || currentTitle) {
        const chText = currentLines.join("\n").trim();
        if (chText) {
          chapters.push({
            title: currentTitle || `Capítulo ${chapters.length + 1}`,
            text: chText,
          });
        }
      }
      currentTitle = title;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Last chapter
  const lastText = currentLines.join("\n").trim();
  if (lastText) {
    chapters.push({
      title: currentTitle || `Capítulo ${chapters.length + 1}`,
      text: lastText,
    });
  }

  // If no chapters detected, return entire text as single chapter
  if (chapters.length === 0) {
    return [{ title: "Capítulo 1", text: text.trim() }];
  }

  return chapters;
}
