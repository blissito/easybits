# EasyBits Web App

[easybits.cloud](https://www.easybits.cloud)

> made by fixter.org

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


```

Constantes definidas. El tipo `WEBINAR` puede aún mutar en el transcurso del desarrollo.
