---
name: cotizacion
description: Genera la cotización/factura oficial (SIIQTEC/Totequim) en PDF con datos bancarios, envío y link de pago MercadoPago. Úsala cuando el cliente pida precio, cotización o factura de productos.
---

# Cotización / Factura

**Cuándo:** el cliente pide precio, cotización o factura de productos.

**Regla de oro:** NO calcules totales ni armes el PDF tú. Junta los datos y **corre
el script determinista** — él valida, calcula el IVA/subtotal, arma la plantilla
oficial (productos + ficha de depósito con datos bancarios y QR) y devuelve la
URL del PDF. El folio y los montos que imprime el script son los oficiales.

## Flujo

1. **Junta:** productos (sku, nombre, cantidad, unidad, precio unitario, imagen
   si hay), datos del cliente (nombre + domicilio obligatorios; rfc/email/tel/
   colonia/ciudad opcionales) y el envío. Si falta un dato, **pídelo antes** —
   no inventes precios.
2. **Folio:** genera uno único `YYMMDD-NNN` (corre `date +%y%m%d` por Bash + un
   consecutivo, ej. `260706-001`).
3. **Descarga el script** a `/tmp` (su URL está en tu manifiesto de archivos,
   nombre `quote.mjs`) y arma el input JSON:

```bash
curl -sL "<URL de quote.mjs>" -o /tmp/quote.mjs
cat > /tmp/cot.json <<'JSON'
{
  "folio": "260706-001",
  "cliente": { "nombre": "Ferretería El Tornillo", "domicilio": "Av. Juárez 100, Tulancingo", "tel": "7711234567" },
  "items": [
    { "sku": "TR180", "qty": 2, "unit": "PZA", "nombre": "Bobina FAPSA TR180", "unit_price": 1450.00, "imagen_url": null }
  ],
  "envio": { "modo": "ruta_siiqtec", "dia": "Miércoles", "destino": "Tulancingo, Hgo" },
  "include_payment_link": true
}
JSON
node /tmp/quote.mjs /tmp/cot.json
```

- `unit` ∈ PZA, GARRAFA, KG, LT, CAJA, BOLSA, PAR, JGO.
- `envio.modo`: `ruta_siiqtec` (gratis; requiere `dia` + `destino`) o
  `paqueteria` (requiere `carrier`, `cp`, `dias`, `costo`).
- `include_payment_link: true` → agrega el link MercadoPago + QR (requiere el
  conector MercadoPago encendido). Omítelo para solo datos bancarios.
- Los precios ya incluyen IVA; **no** sumes impuestos aparte.
- `cliente.tel`: si lo omites, el script lo toma del chat en curso.
- `cliente.domicilio` puede ir de corrido; el script desglosa CP, colonia, ciudad
  y estado. Si mandas `cliente.cp`/`colonia`/`ciudad`/`estado` aparte, esos ganan.
- `cliente.maps_url`: link de Google Maps del punto de entrega. Si el cliente ya
  compartió su ubicación por WhatsApp, el script la usa sola — no la copies.

4. **Envía al cliente:** el script imprime `{ "pdfUrl": "...", "documentId": "...",
   "folio": "...", "total": ..., "paymentUrl": "...", "pages": N,
   "crmConversationId": "..." }`. Manda primero el `pdfUrl`, luego (si hay) el
   `paymentUrl`. Confirma el total con el número que devolvió el script, no con
   uno que hayas calculado tú.

## Precios: SIEMPRE del catálogo, nunca de memoria

**Consulta el catálogo con `db_query` en cada cotización.** No reutilices precios que
viste antes en esta conversación, por reciente que se sienta: el catálogo cambia y una
plática puede llevar semanas viva. Un precio de hace un mes se ve idéntico a uno vigente.

El script verifica cada `unit_price` contra el catálogo antes de calcular nada. Si un
precio no corresponde, te lo dice con los precios vigentes: corrige el input, **avisa al
cliente en el chat que estás corrigiendo el precio** y vuelve a correr.

Ojo con los **escalones por volumen**: un precio de mayoreo solo aplica si la cantidad
llega al mínimo. $90 a partir de 10 piezas no es un precio válido para una orden de 4.

### `price_override` — solo para precios que legítimamente no están en el catálogo

Cuando el precio es correcto pero no puede salir del catálogo, agrégalo al ítem:

```json
{ "sku": "12485", "qty": 2, "unit": "GARRAFA", "nombre": "MOSSI 10L", "unit_price": 125.00,
  "price_override": { "kind": "promocion", "reason": "paquete MOSSI + cloro $250 autorizado por Brenda" } }
```

`kind` ∈ `promocion` · `precio_especial_autorizado` · `servicio_sin_sku` ·
`producto_no_catalogado`. El `reason` es obligatorio y queda auditado.

**No lo uses para saltarte una corrección.** Si el script rechaza un precio porque
recordabas mal, la respuesta es consultar el catálogo, no marcarlo como promoción. Un
override sin autorización real del equipo es un precio mal cobrado con papeleo.

## Registro en el CRM — automático, no lo hagas tú

El script registra la orden en **Formmy** por su cuenta: resuelve la conversación
por el teléfono del chat, crea la orden (folio, productos, total, URL del PDF,
dirección de entrega) en la etapa `Cotización enviada`, y guarda los datos
fiscales del cliente. `crmConversationId` en la salida confirma que quedó.

**No llames tools del CRM para esto** — duplicarías la orden. Si el registro
falla, el script lo avisa por stderr (`[quote] CRM: …`) y **la cotización se manda
igual**: nunca bloquees el envío por un fallo del CRM.

El movimiento de etapa cuando el cliente paga **también es automático** (lo hace
el servidor al detectar el pago). No lo hagas a mano.

### Env que consume el script

Ya vienen en el entorno del worker; solo importa si estás depurando:
`EASYBITS_API_KEY`, `EASYBITS_BASE_URL`, `FORMMY_SECRET_KEY`, `FORMMY_API_URL`,
`NANOCLAW_CHAT_JID` (identifica la conversación), `QUOTE_CRM_ESTATUS` (etapa
inicial), `WABA_LAST_LOCATION_URL` (última ubicación compartida), `MP_ACCESS_TOKEN`
y las `QUOTE_*` de marca. Del guard de precios: `QUOTE_GUARD_MODE`
(`dry-run` por default · `enforce` · `off`), `QUOTE_CATALOG_DB_ID`,
`QUOTE_CATALOG_TABLE`, `QUOTE_MAX_OVERRIDES`. Sin `FORMMY_SECRET_KEY` o sin `NANOCLAW_CHAT_JID` el
registro en CRM se omite en silencio y el PDF sale igual.

## Errores

Si el script sale con error (`siiqtec_quote: ...`), léelo: casi siempre es un dato
faltante o inválido (folio mal formado, unidad no válida, falta domicilio). Corrige
el input y vuelve a correr. Nunca mandes una cotización armada a mano como respaldo.
