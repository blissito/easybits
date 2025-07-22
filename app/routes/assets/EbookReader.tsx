import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import FlipBook from "./EbookReader/FlipBook";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import useScreenDimensions from "~/hooks/useScreenDimensions";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function EbookReader() {
  const [numPages, setNumPages] = useState(null);
  const flipBookRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  // Responsive sizing
  const { isMobileView, screenWidth, screenHeight } = useScreenDimensions();

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const getFileType = (fileName) => {
    const extension = fileName.split(".").pop().toLowerCase();
    switch (extension) {
      case "pdf":
        return "pdf";
      case "epub":
        return "epub";
      case "docx":
        return "docx";
      default:
        return null;
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const type = getFileType(selectedFile.name);
      if (type) {
        setFile(selectedFile);
        setFileType(type);
      } else {
        alert("Unsupported file format. Please upload PDF, EPUB, or DOCX.");
      }
    }
  };

  return (
    <div className="h-screen w-full bg-brand-500 p-10">
      {file ? (
        <>
          <div className="flex flex-col items-center justify-center h-full">
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={console.error}
              loading="Loading PDF..."
              noData="No PDF file specified."
            >
              {numPages && (
                <FlipBook
                  title="El perrrro"
                  numPages={numPages}
                  width={screenWidth}
                  height={screenHeight}
                >
                  {Array.from(new Array(numPages), (el, index) => (
                    <div className="bg-white">
                      <Page
                        key={`page_${index + 1}`}
                        pageNumber={index + 1}
                        width={screenWidth}
                        height={screenHeight}
                      />
                    </div>
                  ))}
                </FlipBook>
              )}
            </Document>
          </div>
        </>
      ) : (
        <input
          type="file"
          id="ebook-upload"
          accept=".pdf,.epub,.docx"
          onChange={handleFileChange}
        />
      )}
    </div>
  );
}
