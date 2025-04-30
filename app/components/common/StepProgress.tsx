import { useState } from "react";

const StepProgress = ({ tasks }: { tasks: Record<number, boolean> }) => {
  const totalSteps = Object.keys(tasks).length;
  const strokeWidth = 10;
  const radius = 40; // Radius of the circle
  const circumference = 2 * Math.PI * radius; // Full circumference
  const segmentLength = circumference / totalSteps; // Each step is 1/5 of the border
  const completed = Object.values(tasks).filter((bool) => bool).length;
  const progress = completed * segmentLength; // Progress based on completed steps
  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Circular Progress Bar */}
      <div className="relative w-[53px] h-[53px]">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          {/* Background Circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#F9F9F9" // Light gray background
            strokeWidth={strokeWidth}
          />

          {/* Progress Segments */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#9870ED" // Purple progress color
            strokeWidth={strokeWidth}
            strokeDasharray={`${progress}, ${circumference}`} // Show only completed steps
            strokeLinecap="round"
            transform="rotate(-90 50 50)" // Start from the top
            className="transition-all duration-500"
          />
        </svg>

        {/* Center Indicator */}
        <div className="absolute inset-0 flex items-center justify-center text-md font-bold">
          {completed}/{totalSteps}
        </div>
      </div>
    </div>
  );
};

export default StepProgress;
