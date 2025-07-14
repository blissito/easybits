# EasyBits Web App

[easybits.cloud](https://www.easybits.cloud)

> made by fixter.org

## Inicio

Antes de iniciar el proyecto asegurate de ejecutar:

```
npx prisma generate
```

Inicia el proyecto ejecutando:

```
npm dev
```

## En relación a los tipos de curso

EasyBits soporta la publicación de tres tipos de curso:

- Pre-grabado
- En vivo y
- Por correo

Cada uno de estos modos tendrá un comportamiento y un set de features diferente.

```js
enum AssetType {
  VOD_COURSE
  EMAIL_COURSE
  WEBINAR
  EBOOK
  DOWNLOADABLE
}

model Asset {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  type     AssetType @default(DOWNLOADABLE)

  // ...
}
```

Constantes definidas. El tipo `WEBINAR` puede aún mutar en el transcurso del desarrollo.

## Updates (Subidas de archivos)

- Ahora la subida de archivos a S3 es concurrente y en segundo plano usando Effect y react-hook-multipart.
- El estado y progreso de todas las subidas se maneja globalmente con un contexto React (`UploadsContext`).
- Puedes ver y controlar el progreso desde cualquier parte de la app, incluso si navegas entre rutas.
- Hay un stacker flotante en /dash/assets que muestra el progreso de subidas activas.
- Beneficios: mejor UX, control total, reusabilidad y robustez.

### Custom hook y provider

- Usa el custom hook `useUploads()` para acceder al estado y acciones de subidas desde cualquier componente.
- El provider `UploadsProvider` envuelve la app y mantiene el estado global de subidas.
- Effect se usa para manejar la lógica asíncrona y la concurrencia de las subidas, permitiendo lanzar, cancelar y controlar tareas de subida de forma declarativa y robusta.

#### Ejemplo de uso

```tsx
// En tu root/layout
<UploadsProvider>
  <App />
</UploadsProvider>;

// En cualquier componente
import { useUploads } from "~/context";
const { uploads, uploadFile } = useUploads();

// Subir un archivo (por ejemplo, desde un input)
<input
  type="file"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, "assetId");
  }}
/>;

// Mostrar progreso
uploads.map((u) => (
  <div key={u.id}>
    {u.file.name}: {u.progress}%
  </div>
));
```

---
