import { useState } from "react";

export function useStep({ initialStep, steps }) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  const next = () => {
    setCurrentStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
  };

  const previous = () => {
    setCurrentStep((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goTo = (step: number) => {
    if (step >= 0 && step < steps.length) {
      setCurrentStep(step);
    }
  };

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return {
    step: steps[currentStep],
    stepIndex: currentStep,
    isFirst,
    isLast,
    next,
    previous,
    goTo,
  };
}
