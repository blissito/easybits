import { useCallback, useMemo } from "react";
import { nanoid } from "nanoid";
import type { LandingBlock, BlockType } from "~/lib/landing2/blockTypes";
import { BLOCK_DEFAULTS } from "~/lib/landing2/blockDefaults";
import { AddBlockMenu } from "./AddBlockMenu";
import { BlockToolbar } from "./BlockToolbar";
import { HeroBlock } from "./blocks/HeroBlock";
import { TextBlock } from "./blocks/TextBlock";
import { ImageTextBlock } from "./blocks/ImageTextBlock";
import { CtaBlock } from "./blocks/CtaBlock";
import { FooterBlock } from "./blocks/FooterBlock";
import { FeaturesBlock } from "./blocks/FeaturesBlock";
import { CalloutBlock } from "./blocks/CalloutBlock";
import { VideoBlock } from "./blocks/VideoBlock";
import { TestimonialsBlock } from "./blocks/TestimonialsBlock";
import { LogoCloudBlock } from "./blocks/LogoCloudBlock";
import { TeamBlock } from "./blocks/TeamBlock";
import { StatsBlock } from "./blocks/StatsBlock";
import { PricingBlock } from "./blocks/PricingBlock";
import { FaqBlock } from "./blocks/FaqBlock";
import { ComparisonBlock } from "./blocks/ComparisonBlock";
import { ChartBlock } from "./blocks/ChartBlock";
import { DiagramBlock } from "./blocks/DiagramBlock";
import { TimelineBlock } from "./blocks/TimelineBlock";
import { GalleryBlock } from "./blocks/GalleryBlock";
import { getThemeVars } from "~/lib/landingCatalog";
import type { CustomColors } from "~/lib/buildLandingHtml";

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function renderBlockComponent(
  block: LandingBlock,
  onUpdate: (content: Record<string, any>) => void
) {
  switch (block.type) {
    case "hero":
      return <HeroBlock block={block} onUpdate={onUpdate} />;
    case "text":
      return <TextBlock block={block} onUpdate={onUpdate} />;
    case "imageText":
      return <ImageTextBlock block={block} onUpdate={onUpdate} />;
    case "cta":
      return <CtaBlock block={block} onUpdate={onUpdate} />;
    case "footer":
      return <FooterBlock block={block} onUpdate={onUpdate} />;
    case "features":
      return <FeaturesBlock block={block} onUpdate={onUpdate} />;
    case "callout":
      return <CalloutBlock block={block} onUpdate={onUpdate} />;
    case "video":
      return <VideoBlock block={block} onUpdate={onUpdate} />;
    case "testimonials":
      return <TestimonialsBlock block={block} onUpdate={onUpdate} />;
    case "logoCloud":
      return <LogoCloudBlock block={block} onUpdate={onUpdate} />;
    case "team":
      return <TeamBlock block={block} onUpdate={onUpdate} />;
    case "stats":
      return <StatsBlock block={block} onUpdate={onUpdate} />;
    case "pricing":
      return <PricingBlock block={block} onUpdate={onUpdate} />;
    case "faq":
      return <FaqBlock block={block} onUpdate={onUpdate} />;
    case "comparison":
      return <ComparisonBlock block={block} onUpdate={onUpdate} />;
    case "chart":
      return <ChartBlock block={block} onUpdate={onUpdate} />;
    case "diagram":
      return <DiagramBlock block={block} onUpdate={onUpdate} />;
    case "timeline":
      return <TimelineBlock block={block} onUpdate={onUpdate} />;
    case "gallery":
      return <GalleryBlock block={block} onUpdate={onUpdate} />;
    default:
      return <div className="p-8 text-center text-gray-400">Bloque desconocido</div>;
  }
}

export function BlockEditor({
  blocks,
  onChange,
  theme = "modern",
  customColors,
}: {
  blocks: LandingBlock[];
  onChange: (blocks: LandingBlock[]) => void;
  theme?: string;
  customColors?: CustomColors | null;
}) {
  const cssVars = useMemo(() => {
    const t = customColors ?? getThemeVars(theme);
    const accentLum = hexLuminance(t.accent);
    const accentText = accentLum > 0.4 ? "#000000" : "#ffffff";
    return {
      "--landing-bg": t.bg,
      "--landing-accent": t.accent,
      "--landing-text": t.text,
      "--landing-accent-text": accentText,
    } as React.CSSProperties;
  }, [theme, customColors]);
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  const addBlock = useCallback(
    (type: BlockType, afterIndex: number) => {
      const newBlock: LandingBlock = {
        id: nanoid(8),
        type,
        order: afterIndex + 1,
        content: { ...BLOCK_DEFAULTS[type] },
      };
      const updated = [
        ...sorted.slice(0, afterIndex + 1),
        newBlock,
        ...sorted.slice(afterIndex + 1),
      ].map((b, i) => ({ ...b, order: i }));
      onChange(updated);
    },
    [sorted, onChange]
  );

  const updateBlock = useCallback(
    (id: string, content: Record<string, any>) => {
      onChange(
        sorted.map((b) =>
          b.id === id ? { ...b, content: { ...b.content, ...content } } : b
        )
      );
    },
    [sorted, onChange]
  );

  const moveBlock = useCallback(
    (id: string, direction: "up" | "down") => {
      const idx = sorted.findIndex((b) => b.id === id);
      if (idx < 0) return;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= sorted.length) return;
      const arr = [...sorted];
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      onChange(arr.map((b, i) => ({ ...b, order: i })));
    },
    [sorted, onChange]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const idx = sorted.findIndex((b) => b.id === id);
      if (idx < 0) return;
      const source = sorted[idx];
      const dup: LandingBlock = {
        ...source,
        id: nanoid(8),
        content: { ...source.content },
      };
      const arr = [...sorted];
      arr.splice(idx + 1, 0, dup);
      onChange(arr.map((b, i) => ({ ...b, order: i })));
    },
    [sorted, onChange]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      onChange(sorted.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
    },
    [sorted, onChange]
  );

  return (
    <div className="w-full max-w-5xl mx-auto" style={cssVars}>
      {/* Add block at the top if empty */}
      <AddBlockMenu onAdd={(type) => addBlock(type, -1)} />

      {sorted.map((block, i) => (
        <div key={block.id}>
          <div className="relative group border-2 border-transparent hover:border-brand-300 rounded-2xl transition-colors">
            <BlockToolbar
              block={block}
              index={i}
              total={sorted.length}
              onMove={(dir) => moveBlock(block.id, dir)}
              onDuplicate={() => duplicateBlock(block.id)}
              onDelete={() => deleteBlock(block.id)}
            />
            {renderBlockComponent(block, (content) =>
              updateBlock(block.id, content)
            )}
          </div>
          <AddBlockMenu onAdd={(type) => addBlock(type, i)} />
        </div>
      ))}
    </div>
  );
}
