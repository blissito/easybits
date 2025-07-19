"use client";
import { pdfjs } from "react-pdf";
import HTMLFlipBook from "react-pageflip";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { useRef, useState } from "react";
import { Document, Page } from "react-pdf";

export default function MyApp() {
  const [numPages, setNumPages] = useState(null);
  const [htmlContent, setHtmlContent] = useState("");
  const flipBook = useRef(null);
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null);

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
    <div>
      <input
        type="file"
        id="ebook-upload"
        accept=".pdf,.epub,.docx"
        onChange={handleFileChange}
        // style={{ display: 'none' }}
      />
      {file && (
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div>Loading PDF...</div>}
        >
          <HTMLFlipBook
            width={550}
            height={733}
            size="stretch"
            minWidth={315}
            maxWidth={1000}
            minHeight={420}
            maxHeight={1000}
            maxShadowOpacity={0.5}
            showCover={true}
            mobileScrollSupport={true}
            ref={flipBook}
            className="ebook-flipbook"
          >
            {Array.from({ length: numPages || 0 }, (_, index) => (
              <div className="pdf-page" key={`page_${index + 1}`}>
                <Page
                  pageNumber={index + 1}
                  width={500}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </div>
            ))}
          </HTMLFlipBook>
        </Document>
      )}
    </div>
  );
}
