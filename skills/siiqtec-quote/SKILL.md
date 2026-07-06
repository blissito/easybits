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

4. **Envía al cliente:** el script imprime `{ "pdfUrl": "...", "folio": "...",
   "total": ..., "paymentUrl": "..." }`. Manda primero el `pdfUrl`, luego (si hay)
   el `paymentUrl`. Confirma el total con el número que devolvió el script, no con
   uno que hayas calculado tú.

## Errores

Si el script sale con error (`siiqtec_quote: ...`), léelo: casi siempre es un dato
faltante o inválido (folio mal formado, unidad no válida, falta domicilio). Corrige
el input y vuelve a correr. Nunca mandes una cotización armada a mano como respaldo.
