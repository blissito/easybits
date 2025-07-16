import { useState, useEffect } from "react";

interface ImageGalleryProps {
  images: Array<{
    src: string;
    alt: string;
    caption?: string;
  }>;
  columns?: 1 | 2 | 3 | 4;
  showCaptions?: boolean;
}

export function ImageGallery({
  images,
  columns = 2,
  showCaptions = true,
}: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  const getGridCols = () => {
    switch (columns) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-1 md:grid-cols-2";
      case 3:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
      default:
        return "grid-cols-1 md:grid-cols-2";
    }
  };

  const openLightbox = (index: number) => {
    setSelectedImage(index);
  };

  const closeLightbox = () => {
    setSelectedImage(null);
  };

  // Handle keyboard events for lightbox
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedImage !== null) {
        if (event.key === "Escape") {
          closeLightbox();
        } else if (event.key === "ArrowLeft") {
          navigateLightbox("prev");
        } else if (event.key === "ArrowRight") {
          navigateLightbox("next");
        }
      }
    };

    if (selectedImage !== null) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when lightbox is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore body scroll when lightbox is closed
      document.body.style.overflow = "unset";
    };
  }, [selectedImage]);

  const navigateLightbox = (direction: "prev" | "next") => {
    if (selectedImage === null) return;

    if (direction === "prev") {
      setSelectedImage(
        selectedImage > 0 ? selectedImage - 1 : images.length - 1
      );
    } else {
      setSelectedImage(
        selectedImage < images.length - 1 ? selectedImage + 1 : 0
      );
    }
  };

  return (
    <>
      <div className={`grid ${getGridCols()} gap-4 my-8`}>
        {images.map((image, index) => (
          <div key={index} className="group cursor-pointer">
            <div
              className="relative overflow-hidden rounded-lg  transition-all duration-200 hover:scale-[1.02]"
              onClick={() => openLightbox(index)}
            >
              <img
                src={image.src}
                alt={image.alt}
                className="w-full h-auto object-cover group-hover:opacity-90 duration-200 group-hover:shadow-lg transition-all"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0  transition-all duration-200 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path
                    fillRule="evenodd"
                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            {showCaptions && image.caption && (
              <p className="text-sm text-gray-600 mt-2 text-center italic">
                {image.caption}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedImage !== null && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div className="relative max-w-4xl max-h-full">
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all duration-200"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Navigation buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateLightbox("prev");
                  }}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-3 rounded-full hover:bg-opacity-70 transition-all duration-200"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateLightbox("next");
                  }}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-3 rounded-full hover:bg-opacity-70 transition-all duration-200"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </>
            )}

            {/* Image */}
            <img
              src={images[selectedImage].src}
              alt={images[selectedImage].alt}
              className="max-w-full max-h-full object-contain rounded-lg border-2 border-white"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Caption */}
            {showCaptions && images[selectedImage].caption && (
              <div
                className="absolute bottom-4 left-4 right-4 bg-white bg-opacity-95 text-black p-4 rounded-lg backdrop-blur-sm border border-gray-200 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-center font-semibold text-sm leading-relaxed">
                  {images[selectedImage].caption}
                </p>
              </div>
            )}

            {/* Image counter */}
            {images.length > 1 && (
              <div className="absolute top-4 left-4 bg-black bg-opacity-90 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm border border-white border-opacity-20">
                {selectedImage + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Simplified version for single images with lightbox
export function Image({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <ImageGallery
      images={[{ src, alt, caption }]}
      columns={1}
      showCaptions={!!caption}
    />
  );
}
