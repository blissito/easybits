#!/bin/bash

echo "🧪 Ejecutando tests de validación de precios..."
echo "================================================"

# Ejecutar solo los tests de validación de precios
npm test test/price-validation.test.ts

echo ""
echo "✅ Tests completados!"
echo ""
echo "📊 Resumen de validaciones probadas:"
echo "  • Precios negativos ❌"
echo "  • Precios muy altos (>999,999) ❌"
echo "  • Precios con muchos decimales ❌"
echo "  • Precios inválidos (NaN/Infinity) ❌"
echo "  • Cambios muy pequeños (advertencia) ⚠️"
echo "  • Precios válidos ✅"
echo "  • Casos edge (null/undefined) ✅"
echo "  • Límites de precio ✅" 