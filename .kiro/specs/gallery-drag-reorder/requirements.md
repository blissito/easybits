# Requirements Document

## Introduction

This feature adds drag and drop reordering functionality to the existing GalleryUploader component. Users will be able to reorder uploaded images and videos in real-time by dragging them to new positions within the gallery. The reordering should be simple and intuitive, without complex visual effects during dragging, focusing on immediate visual feedback during the drag operation.

## Requirements

### Requirement 1

**User Story:** As a user managing my gallery, I want to drag and drop images/videos to reorder them, so that I can organize my media in the desired sequence.

#### Acceptance Criteria

1. WHEN a user clicks and drags on any gallery item THEN the system SHALL allow the item to be moved to a new position
2. WHEN dragging occurs THEN the system SHALL provide real-time visual feedback showing the new position
3. WHEN the user releases the drag THEN the system SHALL update the gallery order immediately
4. WHEN reordering happens THEN the system SHALL maintain the distinction between temporary uploads (srcset) and permanent gallery items

### Requirement 2

**User Story:** As a user, I want the drag and drop to work seamlessly with both images and videos, so that I can reorder any type of media content.

#### Acceptance Criteria

1. WHEN dragging an image THEN the system SHALL allow reordering with the same behavior as videos
2. WHEN dragging a video THEN the system SHALL allow reordering with the same behavior as images
3. WHEN mixing images and videos THEN the system SHALL allow reordering between different media types

### Requirement 3

**User Story:** As a user, I want the drag operation to be simple and responsive, so that I can quickly organize my gallery without distractions.

#### Acceptance Criteria

1. WHEN dragging begins THEN the system SHALL NOT apply complex visual effects or animations during grab
2. WHEN dragging occurs THEN the system SHALL show real-time position changes without delay
3. WHEN dragging ends THEN the system SHALL complete the reorder operation smoothly
4. WHEN dragging THEN the system SHALL maintain the existing visual styling of gallery items

### Requirement 4

**User Story:** As a developer, I want the reordering to integrate with the existing gallery state management, so that the changes are properly reflected in the parent component.

#### Acceptance Criteria

1. WHEN reordering occurs THEN the system SHALL call appropriate callback functions to update parent state
2. WHEN gallery order changes THEN the system SHALL maintain consistency between allMedia array and displayed items
3. WHEN reordering temporary files THEN the system SHALL update the srcset order appropriately
4. WHEN reordering permanent gallery items THEN the system SHALL update the gallery array order appropriately
