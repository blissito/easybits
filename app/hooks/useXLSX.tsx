import { useState } from "react";
import * as XLSX from "xlsx";

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

/**
 * Custom hook para manejar la conversión de Excel a texto
 * Soporta formatos: .xlsx, .xls, .csv
 * @returns {UseExcelToTextReturn}
 */
export const useExcelToText = (): UseExcelToTextReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState("");
  const [excelData, setExcelData] = useState<ExcelData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificar si el archivo es soportado
  const isSupportedFile = (file: File): boolean => {
    const supportedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
      "application/csv", // .csv alternativo
    ];

    const supportedExtensions = [".xlsx", ".xls", ".csv"];

    return (
      supportedTypes.includes(file.type) ||
      supportedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
  };

  // Procesar el archivo Excel
  const processFile = async (selectedFile: File) => {
    if (!isSupportedFile(selectedFile)) {
      setError(
        "Formato de archivo no soportado. Usa archivos .xlsx, .xls o .csv"
      );
      return;
    }

    setFile(selectedFile);
    setOutput("");
    setError(null);
    setIsLoading(true);

    try {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const processedData = processWorkbook(workbook);

          setExcelData(processedData);
          setOutput(formatDataToText(processedData));
          setIsLoading(false);
        } catch (err) {
          console.error("Error procesando archivo:", err);
          setError(
            "Error al procesar el archivo. Verifica que sea un archivo Excel válido."
          );
          setIsLoading(false);
        }
      };

      reader.onerror = () => {
        setError("Error al leer el archivo");
        setIsLoading(false);
      };

      reader.readAsArrayBuffer(selectedFile);
    } catch (err) {
      console.error("Error general:", err);
      setError("Error inesperado al procesar el archivo");
      setIsLoading(false);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    await processFile(selectedFile);
  };

  const handleFileDrop = async (files: FileList) => {
    const selectedFile = files[0];
    if (!selectedFile) return;

    await processFile(selectedFile);
  };

  // Procesar el workbook y extraer datos estructurados
  const processWorkbook = (workbook: XLSX.WorkBook): ExcelData[] => {
    const processedData: ExcelData[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      if (rawData.length > 0) {
        const headers = rawData[0] || [];
        const rows = rawData
          .slice(1)
          .filter((row) =>
            row.some((cell) => cell !== null && cell !== undefined)
          );

        processedData.push({
          sheetName,
          headers: headers.map(String),
          rows: rows.map((row) =>
            row.map((cell) =>
              cell !== null && cell !== undefined ? String(cell) : ""
            )
          ),
        });
      }
    });

    return processedData;
  };

  // Formatear datos a texto legible
  const formatDataToText = (data: ExcelData[]): string => {
    let output = "";

    data.forEach((sheet, sheetIndex) => {
      output += `=== HOJA: ${sheet.sheetName} ===\n\n`;

      if (sheet.headers.length > 0) {
        // Encabezados
        output += "ENCABEZADOS:\n";
        output += sheet.headers.join(" | ") + "\n";
        output += "-".repeat(sheet.headers.join(" | ").length) + "\n\n";

        // Datos
        if (sheet.rows.length > 0) {
          output += "DATOS:\n";
          sheet.rows.forEach((row, rowIndex) => {
            const formattedRow = row.map((cell) => cell || "").join(" | ");
            output += `${rowIndex + 1}. ${formattedRow}\n`;
          });
        } else {
          output += "No hay datos en esta hoja.\n";
        }
      } else {
        output += "Hoja vacía o sin encabezados.\n";
      }

      output += "\n" + "=".repeat(50) + "\n\n";
    });

    return output.trim();
  };

  // Limpiar todos los datos
  const clearData = () => {
    setFile(null);
    setOutput("");
    setExcelData([]);
    setError(null);
  };

  return {
    file,
    output,
    excelData,
    handleFileChange,
    handleFileDrop,
    isLoading,
    error,
    clearData,
    isSupportedFile,
  };
};
