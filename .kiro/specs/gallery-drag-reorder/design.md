# Design Document

## Overview

The drag and drop reordering feature will be implemented using Framer Motion's drag capabilities, which is already installed in the project. The solution will extend the existing `GalleryUploader` component to support reordering of gallery items through a simple drag and drop interface. The design focuses on real-time visual feedback during dragging without complex animations, maintaining the current visual styling while adding reordering functionality.

## Architecture

The implementation will follow these key architectural principles:

1. **State Management**: Extend existing state management to handle reordering operations
2. **Motion Integration**: Utilize Framer Motion's drag and reorder utilities for smooth interactions
3. **Callback Pattern**: Maintain the existing callback pattern for parent component communication
4. **Separation of Concerns**: Keep drag logic separate from existing upload/remove functionality

## Components and Interfaces

### Enhanced GalleryUploader Component

The main `GalleryUploader` component will be enhanced with:

- New callback props for handling reorder operations
- Integration with Motion's `Reorder` components
- State management for tracking drag operations

### New Props Interface

```typescript
interface GalleryUploaderProps {
  // Existing props...
  gallery: string[];
  onRemoveLink?: (arg0: string) => void;
  onRemoveFile?: (index: number) => void;
  srcset: string[];
  onAddFiles: (arg0: File[]) => void;
  limit?: number;
  host: string;
  asset: Asset;

  // New props for reordering
  onReorderGallery?: (newOrder: string[]) => void;
  onReorderSrcset?: (newOrder: string[]) => void;
}
```

### Reorderable Gallery Item Component

A new wrapper component that handles individual item dragging:

```typescript
interface ReorderableItemProps {
  item: MediaItem;
  index: number;
  onRemove: () => void;
  children: React.ReactNode;
}
```

## Data Models

### Enhanced Media Item Model

The existing `allMedia` structure will be enhanced to support reordering:

```typescript
type MediaItem = {
  id: string;
  type: "image" | "video";
  src: string;
  isTemporary: boolean;
  storageKey: string;
  originalIndex: number; // Track original position for callback mapping
  sourceType: "gallery" | "srcset"; // Track which array the item belongs to
};
```

### Reorder State Management

```typescript
interface ReorderState {
  isDragging: boolean;
  draggedItemId: string | null;
  items: MediaItem[];
}
```

## Implementation Strategy

### Phase 1: Motion Integration

1. Replace the current gallery rendering with Motion's `Reorder.Group` and `Reorder.Item`
2. Implement basic drag functionality without complex animations
3. Maintain existing visual styling and layout

### Phase 2: State Management

1. Implement reorder state tracking
2. Create callback functions to update parent component state
3. Handle separation between temporary (srcset) and permanent (gallery) items

### Phase 3: Integration

1. Wire up reorder callbacks to parent component
2. Ensure proper state synchronization
3. Test with existing upload/remove functionality

## Motion Configuration

### Reorder Group Setup

```typescript
<Reorder.Group
  axis="x"
  values={allMedia}
  onReorder={handleReorder}
  className="flex gap-3"
>
  {allMedia.map((item) => (
    <Reorder.Item
      key={item.id}
      value={item}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.1}
    >
      {/* Existing preview component */}
    </Reorder.Item>
  ))}
</Reorder.Group>
```

### Drag Configuration

- **Axis**: Horizontal only (`axis="x"`)
- **Constraints**: Minimal elastic behavior
- **Animation**: Simple position transitions without complex effects
- **Visual Feedback**: Maintain existing preview styling during drag

## Error Handling

### Drag Operation Failures

1. **Invalid Reorder**: If reorder operation fails, revert to previous state
2. **State Synchronization**: Ensure parent state remains consistent
3. **Callback Errors**: Handle callback function failures gracefully

### Edge Cases

1. **Single Item**: Disable drag for single-item galleries
2. **Empty Gallery**: Handle empty state appropriately
3. **Mixed Media Types**: Ensure proper handling of image/video combinations

## Testing Strategy

### Unit Tests

1. **Reorder Logic**: Test reorder state management and callback execution
2. **Media Item Mapping**: Verify proper mapping between display items and source arrays
3. **State Synchronization**: Test parent component state updates

### Integration Tests

1. **Drag Interactions**: Test actual drag and drop operations
2. **Mixed Operations**: Test reordering combined with add/remove operations
3. **Media Type Handling**: Test reordering with different media types

### User Experience Tests

1. **Performance**: Ensure smooth dragging without lag
2. **Visual Feedback**: Verify real-time position updates
3. **Accessibility**: Test keyboard navigation and screen reader compatibility

## Performance Considerations

### Optimization Strategies

1. **Minimal Re-renders**: Use React.memo and useMemo for expensive operations
2. **Efficient Updates**: Batch state updates during drag operations
3. **Memory Management**: Avoid creating new objects during drag events

### Motion Performance

1. **Hardware Acceleration**: Leverage CSS transforms for smooth animations
2. **Reduced Calculations**: Minimize layout calculations during drag
3. **Debounced Updates**: Throttle callback executions if necessary

## Accessibility

### Keyboard Support

1. **Tab Navigation**: Maintain existing tab order
2. **Arrow Keys**: Implement arrow key reordering as alternative to drag
3. **Enter/Space**: Allow reorder mode activation via keyboard

### Screen Reader Support

1. **ARIA Labels**: Add appropriate labels for drag operations
2. **Live Regions**: Announce reorder operations to screen readers
3. **Focus Management**: Maintain proper focus during reorder operations
