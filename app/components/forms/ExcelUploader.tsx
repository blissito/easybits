import React, { useRef, useState } from "react";
import { useExcelToText } from "~/hooks/useXLSX";
import { cn } from "~/utils/cn";
import Spinner from "~/components/common/Spinner";
import { IoClose, IoDocumentText } from "react-icons/io5";
import { FaFileExcel } from "react-icons/fa";

interface ExcelUploaderProps {
  onExcelDataChange?: (data: string) => void;
  className?: string;
}

export const ExcelUploader: React.FC<ExcelUploaderProps> = ({
  onExcelDataChange,
  className = "",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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

  // Notificar cambios en los datos del Excel
  React.useEffect(() => {
    if (output && onExcelDataChange) {
      onExcelDataChange(output);
    }
  }, [output, onExcelDataChange]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileDrop(files);
    }
  };

  const handleFileInputClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearData = () => {
    clearData();
    if (onExcelDataChange) {
      onExcelDataChange("");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Área de carga */}
      {!file && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer",
            {
              "border-brand-500 bg-brand-50": isDragOver,
              "border-gray-300 hover:border-brand-400 hover:bg-gray-50":
                !isDragOver,
            }
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleFileInputClick}
        >
          <FaFileExcel className="mx-auto h-12 w-12 text-brand-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Sube tu archivo Excel
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Arrastra y suelta tu archivo aquí, o haz clic para seleccionar
          </p>
          <p className="text-xs text-gray-500">
            Formatos soportados: .xlsx, .xls, .csv
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Archivo cargado */}
      {file && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <FaFileExcel className="h-8 w-8 text-green-600" />
              <div>
                <h4 className="font-medium text-gray-900">{file.name}</h4>
                <p className="text-sm text-gray-500">
                  {formatFileSize(file.size)} • {excelData.length} hoja(s)
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                {showPreview ? "Ocultar" : "Ver"} contenido
              </button>
              <button
                onClick={handleClearData}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Eliminar archivo"
              >
                <IoClose className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Indicador de carga */}
          {isLoading && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Spinner size="sm" />
              <span>Procesando archivo...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Vista previa del contenido */}
          {showPreview && output && !isLoading && !error && (
            <div className="mt-4">
              <div className="flex items-center space-x-2 mb-2">
                <IoDocumentText className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Contenido convertido:
                </span>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono">
                  {output}
                </pre>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Este contenido se incluirá como contexto para la IA
              </p>
            </div>
          )}

          {/* Información de hojas */}
          {excelData.length > 0 && !isLoading && !error && (
            <div className="mt-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Hojas encontradas:
              </h5>
              <div className="flex flex-wrap gap-2">
                {excelData.map((sheet, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-800"
                  >
                    {sheet.sheetName} ({sheet.rows.length} filas)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
