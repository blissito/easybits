// src/hooks/useBookDimensions.js
import { useState, useEffect, useCallback } from "react";

const DESKTOP_BREAKPOINT = 768; // Adjust this as needed

const useScreenDimensions = (aspectRatio = 1.3) => {
  const [isMobileView, setIsMobileView] = useState(false);
  const [screenWidth, setscreenWidth] = useState(600); // Initialize to 0
  const [screenHeight, setscreenHeight] = useState(800); // Initialize to 0

  const calculateDimensions = useCallback(() => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const newIsMobileView = windowWidth < DESKTOP_BREAKPOINT;
    setIsMobileView(newIsMobileView);

    let calculatedscreenWidth;
    let calculatedscreenHeight;

    if (newIsMobileView) {
      // For mobile, make the page fill a good portion of the screen
      // Subtract some padding/margin for better fit
      calculatedscreenWidth = Math.min(450, windowWidth * 0.9); // Max 450px, or 90% of screen
      calculatedscreenHeight = calculatedscreenWidth * aspectRatio;
    } else {
      // For desktop, target a comfortable reading size for a single page
      // Subtracting some space for margin/buttons, and leave room for two pages
      // Ensure book height doesn't exceed screen height, leaving space for UI
      calculatedscreenHeight = Math.min(600, windowHeight * 0.8); // Max 600px, or 80% of screen height
      calculatedscreenWidth = calculatedscreenHeight / aspectRatio;
    }

    setscreenWidth(calculatedscreenWidth);
    setscreenHeight(calculatedscreenHeight);
  }, [aspectRatio]); // useCallback dependency

  useEffect(() => {
    // Set initial dimensions when the component mounts
    calculateDimensions();

    // Add event listener for window resize
    window.addEventListener("resize", calculateDimensions);

    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener("resize", calculateDimensions);
    };
  }, [calculateDimensions]); // useEffect dependency

  return { isMobileView, screenWidth, screenHeight };
};

export default useScreenDimensions;
