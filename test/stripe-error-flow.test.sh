#!/bin/bash
# Test simple para verificar el flujo de errores de Stripe en update_asset
# Edita los valores de ASSET_ID, COOKIE y URL antes de ejecutar

ASSET_ID="REEMPLAZA_POR_ID_VALIDO"
COOKIE="REEMPLAZA_POR_COOKIE_DE_SESION"
URL="http://localhost:3000/api/v1/assets"

# Caso 1: Actualización exitosa
printf "\n--- Caso 1: Actualización exitosa ---\n"
curl -i -X POST "$URL" \
  -F "intent=update_asset" \
  -F "data={\"id\":\"$ASSET_ID\",\"price\":100,\"title\":\"Test OK\"}" \
  -b "$COOKIE"

# Caso 2: Error de validación (precio negativo)
printf "\n--- Caso 2: Error de validación (precio negativo) ---\n"
curl -i -X POST "$URL" \
  -F "intent=update_asset" \
  -F "data={\"id\":\"$ASSET_ID\",\"price\":-1,\"title\":\"Test Error\"}" \
  -b "$COOKIE" 