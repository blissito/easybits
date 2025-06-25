# Tests de Validación de Precios

Este directorio contiene tests para validar la funcionalidad de validación de precios implementada en `app/routes/api/v1/assets.tsx`.

## 📁 Archivos

- `price-validation.test.ts` - Tests principales de validación de precios
- `run-price-validation-tests.sh` - Script para ejecutar los tests
- `setup.ts` - Configuración de mocks para los tests

## 🧪 Casos de Prueba

### ❌ Precios Rechazados

- **Precios negativos**: `-10` → Error
- **Precios muy altos**: `> 999,999` → Error
- **Muchos decimales**: `99.999` → Error
- **Valores inválidos**: `NaN`, `Infinity` → Error

### ⚠️ Advertencias

- **Cambios pequeños**: `< 1%` → Advertencia en consola

### ✅ Precios Aceptados

- **Precios válidos**: `150.50`, `200`, `0`
- **Casos edge**: `null`, `undefined` iniciales
- **Límites**: `999,999` (máximo permitido)

## 🚀 Ejecutar Tests

### Opción 1: Script automático

```bash
./test/run-price-validation-tests.sh
```

### Opción 2: Comando directo

```bash
npm test test/price-validation.test.ts
```

### Opción 3: Todos los tests

```bash
npm test
```

## 📊 Ejemplo de Salida

```
🧪 Ejecutando tests de validación de precios...
================================================

 ✓ debería rechazar precios negativos
 ✓ debería rechazar precios mayores a 999,999
 ✓ debería rechazar precios con más de 2 decimales
 ✓ debería rechazar NaN
 ✓ debería rechazar Infinity
 ✓ debería mostrar advertencia para cambios menores al 1%
 ✓ no debería mostrar advertencia para cambios mayores al 1%
 ✓ debería aceptar precios válidos con 2 decimales
 ✓ debería aceptar precios enteros
 ✓ debería aceptar precio cero
 ✓ debería manejar precio inicial null
 ✓ debería manejar precio inicial undefined
 ✓ debería aceptar el precio máximo permitido
 ✓ debería rechazar el precio máximo + 1

✅ Tests completados!

📊 Resumen de validaciones probadas:
  • Precios negativos ❌
  • Precios muy altos (>999,999) ❌
  • Precios con muchos decimales ❌
  • Precios inválidos (NaN/Infinity) ❌
  • Cambios muy pequeños (advertencia) ⚠️
  • Precios válidos ✅
  • Casos edge (null/undefined) ✅
  • Límites de precio ✅
```

## 🔧 Configuración

Los tests usan:

- **Vitest** como framework de testing
- **Mocks** para simular la base de datos y Stripe
- **Console.warn** mock para capturar advertencias

## 📝 Agregar Nuevos Tests

Para agregar nuevos casos de prueba:

1. Agrega el test en `price-validation.test.ts`
2. Sigue el patrón existente con `describe` e `it`
3. Usa los helpers `createMockRequest` y `createMockAsset`
4. Ejecuta los tests para verificar

## 🐛 Debugging

Si un test falla:

1. Revisa los mocks en `setup.ts`
2. Verifica que los tipos coincidan con Prisma
3. Usa `console.log` temporal para debug
4. Ejecuta un test específico: `npm test -- --run test-name`
