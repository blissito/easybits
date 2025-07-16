import { Reorder } from "motion/react";
import type { ReactNode } from "react";

type MediaItem = {
  id: string;
  type: "image" | "video";
  src: string;
  isTemporary: boolean;
  storageKey: string;
  originalIndex: number;
  sourceType: "gallery" | "srcset";
};

interface ReorderableItemProps {
  item: MediaItem;
  onRemove: () => void;
  children: ReactNode;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export const ReorderableItem = ({
  item,
  onRemove,
  children,
  onDragStart,
  onDragEnd,
}: ReorderableItemProps) => {
  return (
    <Reorder.Item
      key={item.id}
      value={item}
      dragElastic={0.1}
      className="cursor-grab active:cursor-grabbing"
      whileDrag={{
        scale: 1.02,
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children}
    </Reorder.Item>
  );
};
