import { useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import useScreenDimensions from "~/hooks/useScreenDimensions";

export default function FlipBook({ numPages, children, title }) {
  const flipBookRef = useRef(null);

  // Optional: Add navigation handlers if you want external buttons
  const goToPrevPage = useCallback(() => {
    if (flipBookRef.current) {
      flipBookRef.current.pageFlip().flipPrev();
    }
  }, []);

  const goToNextPage = useCallback(() => {
    if (flipBookRef.current) {
      flipBookRef.current.pageFlip().flipNext();
    }
  }, []);

  const onFlip = useCallback((e) => {
    console.log("Current page:", e.data);
  }, []);

  const { isMobileView, screenWidth, screenHeight } = useScreenDimensions();

  return (
    <div>
      <p className="mb-3 text-3xl font-semibold text-center">{title}</p>
      <HTMLFlipBook
        className="shadow-xl" // Added shadow and border for better visual separation
        width={screenWidth}
        height={screenHeight}
        showCover={true}
        flippingTime={1000}
        onFlip={onFlip}
        ref={flipBookRef}
        usePortrait={isMobileView}
        drawShadow={true}
        maxShadowOpacity={0.5}
        mobileScrollSupport={true}
        // onChangeOrientation={this.onChangeOrientation}
        // onChangeState={this.onChangeState}
        //   startPage={0}
        //   minWidth={315}
        //   maxWidth={1000}
        //   minHeight={400}
        //   maxHeight={1533}
        //   flippingTime={1000}
        //   usePortrait={false}
        //   startZIndex={0}
        // autoSize={true}
        //   clickEventForward={false}
        //   useMouseEvents={false}
        //   swipeDistance={0}
        //   showPageCorners={true}
        //   disableFlipByClick={false}
      >
        {children}
      </HTMLFlipBook>
      {/* add buttons */}
      {/* current page and store progress */}
      {/*  */}
    </div>
  );
}
