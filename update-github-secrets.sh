#!/bin/bash

# Script para actualizar GitHub secrets desde .env
# Requiere GitHub CLI (gh) instalado y autenticado

set -e

echo "🔄 Actualizando GitHub secrets desde .env..."

# Verificar que gh CLI esté instalado
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI no está instalado. Instálalo con: brew install gh"
    exit 1
fi

# Verificar que esté autenticado
if ! gh auth status &> /dev/null; then
    echo "❌ No estás autenticado en GitHub CLI. Ejecuta: gh auth login"
    exit 1
fi

# Verificar que .env existe
if [ ! -f ".env" ]; then
    echo "❌ Archivo .env no encontrado"
    exit 1
fi

echo "📝 Leyendo variables desde .env..."

# Leer .env y actualizar secrets (excluyendo comentarios y líneas vacías)
while IFS='=' read -r key value; do
    # Saltar líneas vacías y comentarios
    if [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Limpiar espacios en blanco
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Saltar si no hay valor
    if [[ -z "$value" ]]; then
        continue
    fi
    
    echo "🔑 Actualizando secret: $key"
    
    # Actualizar el secret en GitHub
    echo "$value" | gh secret set "$key"
    
done < .env

echo "✅ Todos los secrets han sido actualizados en GitHub!"
echo ""
echo "📋 Para verificar los secrets actualizados, ejecuta:"
echo "   gh secret list"