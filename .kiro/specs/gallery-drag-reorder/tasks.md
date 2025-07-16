# Implementation Plan

- [x] 1. Enhance MediaItem type and data structure

  - Update the MediaItem type to include id, originalIndex, and sourceType fields
  - Modify the allMedia useMemo to generate proper IDs and track source information
  - Add helper functions to map between display items and source arrays
  - _Requirements: 1.4, 4.2, 4.3, 4.4_

- [x] 2. Create reorderable gallery item wrapper component

  - Implement ReorderableItem component using Motion's Reorder.Item
  - Configure drag constraints for horizontal-only movement
  - Integrate existing preview components (InputImage.Preview and InputImage.PreviewVideo)
  - Ensure proper event handling for remove functionality
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.4_

- [x] 3. Implement reorder state management and callbacks

  - Create handleReorder function to process reorder operations
  - Implement logic to separate gallery items from srcset items during reorder
  - Create callback functions for onReorderGallery and onReorderSrcset
  - Add state tracking for drag operations
  - _Requirements: 1.3, 4.1, 4.3, 4.4_

- [ ] 4. Replace existing gallery rendering with Motion Reorder components

  - Replace the current flex container with Reorder.Group
  - Wrap each gallery item with ReorderableItem component
  - Configure Motion settings for simple, responsive dragging
  - Maintain existing gap and layout styling
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3_

- [x] 5. Update GalleryUploader props interface and integrate callbacks

  - Add onReorderGallery and onReorderSrcset props to GalleryUploader interface
  - Wire up reorder callbacks to parent component communication
  - Ensure backward compatibility with existing prop usage
  - Test integration with existing upload and remove functionality
  - _Requirements: 4.1, 4.2, 1.3_
