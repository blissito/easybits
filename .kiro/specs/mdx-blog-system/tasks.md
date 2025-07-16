# Implementation Plan

- [x] 1. Set up MDX processing infrastructure and dependencies

  - Install and configure @mdx-js/mdx, @mdx-js/react, and related dependencies
  - Create MDX processor utility with frontmatter parsing capabilities
  - Implement reading time calculation and excerpt generation functions
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Create blog data layer and file system integration

  - [x] 2.1 Implement MDX file discovery and processing

    - Write function to scan app/content/blog directory for MDX files
    - Create file watcher for development hot reloading
    - Implement caching mechanism for processed blog posts
    - _Requirements: 1.1, 5.1, 5.2_

  - [x] 2.2 Build blog data service with CRUD operations
    - Implement getAllPosts function with pagination and filtering
    - Create getPostBySlug function for individual post retrieval
    - Add search functionality across post titles and content
    - Implement getRelatedPosts function based on tags
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 3. Create blog content directory structure and sample posts

  - Create app/content/blog directory structure
  - Create app/content/blog/assets directory for images
  - Write 3-5 sample MDX blog posts with proper frontmatter and realistic, project related useful information based in best subjects for the type of businnes and audience
  - Add sample images and optimize them for web
  - _Requirements: 1.1, 1.2_

- [x] 4. Mostrar la vista de lista y detalle ya con el contenido real

  - Crear la vista de lista
  - crear o encontrar la vista de detalle
  - consumir el sistema de mdx para conseguir el contenido
  - conectar el sistema MDX con los componentes de la UI.
  - confirmar que todo renderiza correctamente, si no, corregir.

- [x] 5. Comprobar que se renderiza bien el markdown
  - añadir los estilos para mostrar los elementos html correctamente
  - confirmar los estilos con el developer, sino modificar
- [ ] 6. Create reusable MDX components for rich content

  - [x] 6.1 Build CodeBlock component with syntax highlighting

    - Implement syntax highlighting using react-syntax-highlighter
    - Add copy-to-clipboard functionality
    - Support multiple programming languages
    - _Requirements: 3.3_

  - [x] 6.2 Create Callout and ImageGallery components
    - Build Callout component for highlighted information boxes
    - Implement ImageGallery component for multiple images
    - Create responsive and accessible components
    - _Requirements: 1.3, 3.4_

- [x] 6.3 Usar ImageGallery en algún post
- [ ] 7. Add SEO optimizations and meta tag generation

  - Implement dynamic meta tag generation for each blog post
  - Create Open Graph image generation for social sharing
  - Add structured data (JSON-LD) for blog posts
  - Generate sitemap.xml including all blog posts
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
    ¡

- [x] 8. Arreglar turnstile en el detalle del blog
  - actualmente la suscripción truena
  - revisar por qué
  - arreglar
  - confirmar que la suscripción ya funciona
- [ ] 9. Final integration and polish
  - Integrate blog system with existing navigation and footer
  - Ensure consistent styling with existing design system
  - Add loading states and error boundaries
  - Perform final testing and bug fixes
  - _Requirements: 5.4, 6.4_
