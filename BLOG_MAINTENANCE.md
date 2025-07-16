# Blog Maintenance Guide

## Cómo Agregar Nuevos Posts al Blog

### 1. Crear el archivo MDX

Crea un nuevo archivo en `app/content/blog/` con el formato:

```
YYYY-MM-DD-nombre-del-post.mdx
```

Ejemplo: `2025-01-25-mi-nuevo-post.mdx`

### 2. Estructura del archivo MDX

```mdx
---
title: "Título del Post"
description: "Descripción breve del contenido"
date: "2025-01-25"
author: "EasyBits Team"
tags: ["tag1", "tag2", "tag3"]
featuredImage: "/blog/assets/imagen-destacada.jpg"
published: true
---

# Contenido del Post

Tu contenido aquí...
```

### 3. Actualizar las rutas

#### Para la lista del blog (`app/routes/blog.tsx`):

Agrega una nueva entrada al array `BLOG_POSTS`:

```typescript
{
  slug: "mi-nuevo-post",
  filePath: "app/content/blog/2025-01-25-mi-nuevo-post.mdx",
  title: "Título del Post",
  description: "Descripción breve del contenido",
  date: "2025-01-25",
  author: "EasyBits Team",
  tags: ["tag1", "tag2", "tag3"],
  featuredImage: "/blog/assets/imagen-destacada.jpg",
  readingTime: 8,
  excerpt: "Descripción breve del contenido",
  published: true,
},
```

#### Para posts individuales (`app/routes/blog.$slug.tsx`):

Agrega una nueva entrada al objeto `BLOG_POSTS`:

```typescript
"mi-nuevo-post": "app/content/blog/2025-01-25-mi-nuevo-post.mdx",
```

#### Para prerendering (`react-router.config.ts`):

Agrega el slug al array `BLOG_POSTS`:

```typescript
const BLOG_POSTS = [
  // ... posts existentes
  "mi-nuevo-post",
];
```

### 4. Generar el slug

El slug debe ser:

- En minúsculas
- Sin espacios (usar guiones)
- Sin caracteres especiales
- Descriptivo del contenido

Ejemplo: `como-conectar-stripe-onboarding`

### 5. Imágenes

Las imágenes deben colocarse en `app/content/blog/assets/` y referenciarse como:

```
/blog/assets/nombre-imagen.jpg
```

### 6. Verificación

1. Ejecuta `npm run dev` para probar localmente
2. Verifica que el post aparece en `/blog`
3. Verifica que el post individual funciona en `/blog/[slug]`
4. Verifica que los meta tags se generan correctamente

### 7. Despliegue

Después de agregar un nuevo post:

1. Haz commit de los cambios
2. Despliega a producción
3. Verifica que funciona en producción

## Ventajas de este enfoque

✅ **Sin duplicación de datos**: Los archivos MDX son la fuente única de verdad
✅ **Fácil mantenimiento**: Solo necesitas actualizar 3 lugares al agregar un post
✅ **Funciona en producción**: No depende del sistema de archivos en runtime
✅ **Prerendering eficiente**: Las rutas se generan estáticamente
✅ **SEO optimizado**: Meta tags y structured data se generan automáticamente

## Estructura de archivos

```
app/
├── content/
│   └── blog/
│       ├── 2025-01-25-mi-nuevo-post.mdx
│       └── assets/
│           └── imagen-destacada.jpg
├── routes/
│   ├── blog.tsx (lista de posts)
│   └── blog.$slug.tsx (post individual)
└── react-router.config.ts (prerendering)
```
