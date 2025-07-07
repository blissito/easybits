# EasyBits Web App

[easybits.cloud](https://www.easybits.cloud)

> made by fixter.org

## Inicio
Antes de iniciar el proyecto asegurate de ejecutar:
```
npx prisma generate
```
Inicia el proyecto ejecutando:
````
npm dev
````

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

## Pruebas de Stripe

### Configuración necesaria
- Asegúrate de tener las variables de entorno de Stripe configuradas correctamente en `.env`
- Verifica que los webhooks estén configurados en el dashboard de Stripe

### Flujo de compra
1. **Proceso de checkout**
   - [ ] Verificar que se pueda iniciar el checkout
   - [ ] Probar con tarjetas de prueba de Stripe
   - [ ] Validar redirección después del pago exitoso

2. **Notificaciones por email**
   - [ ] Confirmar recepción de email de compra al comprador
   - [ ] Verificar notificación al vendedor por nueva venta
   - [ ] Revisar que los enlaces en los emails sean funcionales

3. **Asignación de assets**
   - [ ] Verificar que el asset se asigne correctamente al comprador
   - [ ] Probar con usuarios nuevos (debe crearse la cuenta)
   - [ ] Probar con usuarios existentes (debe asignar el asset)

4. **Manejo de errores**
   - [ ] Probar con tarjeta rechazada
   - [ ] Verificar mensajes de error en la UI
   - [ ] Probar con sesión expirada

### Ambiente de desarrollo
- Usa las claves de prueba de Stripe
- Los webhooks locales pueden configurarse con Stripe CLI
- Verifica que el modo desarrollo/producción funcione correctamente

### Monitoreo
- Revisar logs del servidor para transacciones
- Verificar webhooks recibidos en el dashboard de Stripe
- Monitorear cola de emails enviados
