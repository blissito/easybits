# Implementación de `useExcelToText` para Contexto de IA

## 📋 Resumen

Se ha implementado una funcionalidad completa para convertir archivos Excel a texto y usarlos como contexto para la generación de descripciones con IA en el componente `MarkEditor`.

## 🚀 Características Implementadas

### 1. **Hook `useExcelToText` Mejorado** (`app/hooks/useXLSX.tsx`)

- ✅ Soporte para múltiples formatos: `.xlsx`, `.xls`, `.csv`
- ✅ Validación de archivos con verificación de tipos MIME y extensiones
- ✅ Manejo robusto de errores con mensajes descriptivos
- ✅ Procesamiento de múltiples hojas de Excel
- ✅ Formato de salida estructurado y legible
- ✅ Datos estructurados para uso posterior

### 2. **Componente `ExcelUploader`** (`app/components/forms/ExcelUploader.tsx`)

- ✅ Interfaz drag & drop intuitiva
- ✅ Previsualización del contenido convertido
- ✅ Información detallada del archivo (tamaño, hojas, filas)
- ✅ Indicadores visuales de carga y errores
- ✅ Opción para limpiar datos
- ✅ Diseño consistente con el sistema de diseño

### 3. **Integración en `MarkEditor`** (`app/routes/assets/MarkEditor.client.tsx`)

- ✅ Sección opcional para cargar archivos Excel
- ✅ Contexto automático incluido en prompts de IA
- ✅ Indicador visual cuando se usa contexto de Excel
- ✅ Integración transparente con el flujo existente

## 🛠️ Cómo Usar

### Para Usuarios Finales

1. **Abrir el editor de descripción** en cualquier asset
2. **Hacer clic en "Agregar archivo Excel"** en la sección de contexto
3. **Arrastrar y soltar** o hacer clic para seleccionar un archivo Excel
4. **Verificar el contenido** usando "Ver contenido" si es necesario
5. **Escribir el prompt** para la IA normalmente
6. **La IA usará automáticamente** el contenido del Excel como contexto

### Para Desarrolladores

#### Uso del Hook `useExcelToText`

```typescript
import { useExcelToText } from "~/hooks/useXLSX";

const MyComponent = () => {
  const {
    file,
    output,
    excelData,
    handleFileChange,
    handleFileDrop,
    isLoading,
    error,
    clearData,
    isSupportedFile,
  } = useExcelToText();

  // Usar las funciones según necesites
  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {output && <pre>{output}</pre>}
    </div>
  );
};
```

#### Uso del Componente `ExcelUploader`

```typescript
import { ExcelUploader } from "~/components/forms/ExcelUploader";

const MyComponent = () => {
  const handleExcelDataChange = (data: string) => {
    console.log("Datos del Excel:", data);
    // Usar los datos como necesites
  };

  return (
    <ExcelUploader
      onExcelDataChange={handleExcelDataChange}
      className="my-custom-class"
    />
  );
};
```

## 📊 Formato de Salida

El contenido convertido tiene el siguiente formato:

```
=== HOJA: Hoja1 ===

ENCABEZADOS:
Nombre | Email | Teléfono
------------------------

DATOS:
1. Juan Pérez | juan@email.com | 123-456-7890
2. María García | maria@email.com | 098-765-4321

==================================================

=== HOJA: Hoja2 ===

ENCABEZADOS:
Producto | Precio | Stock
------------------------

DATOS:
1. Laptop | $999 | 15
2. Mouse | $25 | 50
```

## 🔧 Configuración Técnica

### Dependencias Instaladas

```json
{
  "xlsx": "^latest"
}
```

### Tipos de Archivo Soportados

- **MIME Types:**

  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)
  - `application/vnd.ms-excel` (.xls)
  - `text/csv` (.csv)
  - `application/csv` (.csv alternativo)

- **Extensiones:**
  - `.xlsx`
  - `.xls`
  - `.csv`

### Estructura de Datos

```typescript
interface ExcelData {
  sheetName: string;
  headers: string[];
  rows: any[][];
}

interface UseExcelToTextReturn {
  file: File | null;
  output: string;
  excelData: ExcelData[];
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleFileDrop: (files: FileList) => void;
  isLoading: boolean;
  error: string | null;
  clearData: () => void;
  isSupportedFile: (file: File) => boolean;
}
```

## 🎯 Casos de Uso

### 1. **Generación de Descripciones con Datos**

- Cargar una lista de productos desde Excel
- Usar la IA para generar descripciones basadas en los datos
- Prompt: "Genera descripciones para cada producto en la lista"

### 2. **Análisis de Datos**

- Cargar datos de ventas o métricas
- Usar la IA para analizar y generar insights
- Prompt: "Analiza estos datos de ventas y genera un resumen"

### 3. **Creación de Contenido Estructurado**

- Cargar información de clientes o usuarios
- Generar contenido personalizado
- Prompt: "Crea un email personalizado para cada cliente"

## 🔒 Consideraciones de Seguridad

- ✅ Validación de tipos de archivo
- ✅ Límites de tamaño implícitos (limitado por el navegador)
- ✅ Procesamiento local (no se suben archivos al servidor)
- ✅ Limpieza automática de datos sensibles

## 🚀 Próximas Mejoras

- [ ] Soporte para archivos más grandes con streaming
- [ ] Filtrado y selección de columnas específicas
- [ ] Exportación de resultados procesados
- [ ] Integración con más componentes de IA
- [ ] Cache de archivos procesados
- [ ] Soporte para más formatos (Google Sheets, etc.)

## 🐛 Solución de Problemas

### Error: "Formato de archivo no soportado"

- Verificar que el archivo sea .xlsx, .xls o .csv
- Asegurar que la extensión del archivo sea correcta

### Error: "Error al procesar el archivo"

- Verificar que el archivo no esté corrupto
- Intentar con un archivo más pequeño
- Revisar que el archivo tenga datos válidos

### El contenido no se muestra

- Verificar que el archivo tenga datos en la primera hoja
- Asegurar que haya encabezados en la primera fila
- Revisar la consola del navegador para errores

## 📝 Notas de Implementación

- La funcionalidad es completamente opcional y no afecta el flujo existente
- Los datos se procesan localmente en el navegador
- No se almacenan archivos en el servidor
- El contexto se incluye automáticamente en los prompts de IA
- La interfaz es consistente con el diseño existente de EasyBits
