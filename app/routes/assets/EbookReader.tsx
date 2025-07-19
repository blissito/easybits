"use client";
import { pdfjs } from "react-pdf";
import HTMLFlipBook from "react-pageflip";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

export default function EbookReader() {
  const [numPages, setNumPages] = useState(null);
  const flipBookRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [bookSize, setBookSize] = useState({ width: 600, height: 850 });

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

  // Responsive sizing
  useEffect(() => {
    const calculateSize = () => {
      const maxWidth = Math.min(window.innerWidth - 80, 650); // 40px padding on each side
      const height = Math.min(maxWidth * 1.414, window.innerHeight - 120); // A4 ratio with top/bottom margin
      setBookSize({ width: maxWidth, height });
    };

    calculateSize();
    window.addEventListener("resize", calculateSize);
    return () => window.removeEventListener("resize", calculateSize);
  }, []);

  return (
    <div>
      {file ? (
        <>
          <div className="flex flex-col items-center justify-start py-8 px-4 min-h-screen bg-gray-50">
            {/* Container with constrained width */}
            <div className="w-full max-w-4xl mx-auto">
              <p className="text-3xl font-bold mb-3"> Titulo del librin</p>

              {/* Flipbook wrapper */}

              <Document
                file={file}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                loading={
                  <div className="flex items-center justify-center h-full bg-white">
                    <div className="animate-pulse text-gray-500">
                      Loading PDF...
                    </div>
                  </div>
                }
              >
                <HTMLFlipBook
                  ref={flipBookRef}
                  width={bookSize.width}
                  height={bookSize.height}
                  minWidth={300}
                  maxWidth={650}
                  minHeight={424}
                  maxHeight={800}
                  maxShadowOpacity={0.2}
                  showCover={true}
                  mobileScrollSupport={true}
                  className="mx-auto"
                >
                  {Array.from({ length: numPages || 0 }, (_, index) => (
                    <div
                      key={`page_${index + 1}`}
                      className="flex items-center justify-center bg-white"
                    >
                      <Page
                        pageNumber={index + 1}
                        width={bookSize.width - 20} // Account for padding
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        loading={
                          <div className="flex items-center justify-center h-full">
                            <div className="animate-pulse text-gray-400">
                              Loading page...
                            </div>
                          </div>
                        }
                      />
                    </div>
                  ))}
                </HTMLFlipBook>
              </Document>
            </div>
          </div>

          {/* Navigation controls (optional) */}
          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={() => flipBookRef.current.pageFlip().flipPrev()}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => flipBookRef.current.pageFlip().flipNext()}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <input
          type="file"
          id="ebook-upload"
          accept=".pdf,.epub,.docx"
          onChange={handleFileChange}
          // style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
