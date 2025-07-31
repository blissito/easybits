import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import FlipBook from "./EbookReader/FlipBook";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import useScreenDimensions from "~/hooks/useScreenDimensions";
import { ReactReader } from "react-reader";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function EbookReader() {
  const [numPages, setNumPages] = useState(null);
  const flipBookRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  // Responsive sizing
  const { isMobileView, screenWidth, screenHeight } = useScreenDimensions();

  const [location, setLocation] = useState<string | number>(0);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    const type = file.name.split(".").pop().toLowerCase();
    console.log(file);
    setFileType(type);
    switch (type) {
      case "pdf":
        setFile(file);
        break;
      case "epub":
        const url = URL.createObjectURL(file);
        setFileUrl(url);
        break;
      case "mobi":
      case "azw3":
      default:
        throw new Error("Unsupported file type");
    }
  };

  const asset = {
    title: "Book sample",
  };
  console.log({ fileType, fileUrl });
  return (
    <div className="h-screen w-full bg-brand-500 md:p-10">
      <input
        type="file"
        id="ebook-upload"
        accept=".pdf,.epub"
        onChange={processFile}
      />
      <div
      //className="w-full flex flex-col items-center justify-center"
      >
        <p className="mb-3 text-3xl font-semibold text-center">{asset.title}</p>
        {file && fileType === "pdf" && (
          <>
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={console.error}
              loading="Loading PDF..."
              noData="No PDF file specified."
            >
              {numPages && (
                <FlipBook
                  title={asset.title}
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
          </>
        )}

        {fileUrl && fileType === "epub" && (
          <>
            <ReactReader
              url="https://react-reader.metabits.no/files/alice.epub"
              title={asset.title}
              location={location}
              locationChanged={(loc: string) => setLocation(loc)}
            />
          </>
        )}
      </div>
    </div>
  );
}
