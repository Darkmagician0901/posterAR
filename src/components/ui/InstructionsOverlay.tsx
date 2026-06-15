/**
 * InstructionsOverlay — first-visit tutorial dialog with stepped slides.
 *
 * Auto-opens once per browser (tracked via useTutorialCompleted /
 * localStorage; the flag is written by useUIState.setShowInstructions(false)
 * on dismiss). Can be reopened any time from the ControlPanel Help button.
 *
 * Exports: InstructionsOverlay.
 */

import React, { useState, useEffect } from 'react';
import { useUIState, useTutorialCompleted } from '@/hooks/useUIState';
import './InstructionsOverlay.css';

/** One slide of the tutorial. */
interface InstructionStep {
  id: number;
  title: string;
  description: string;
  icon: string;
}

const INSTRUCTION_STEPS: InstructionStep[] = [
  {
    id: 1,
    title: 'Scan Surfaces',
    description: 'Move your phone slowly to detect flat surfaces like walls or floors',
    icon: '📱',
  },
  {
    id: 2,
    title: 'Place Poster',
    description: 'Tap on a detected surface to place your poster',
    icon: '👆',
  },
  {
    id: 3,
    title: 'Adjust Scale',
    description: 'Your placed poster is selected automatically — use the scale slider to resize it',
    icon: '🔧',
  },
  {
    id: 4,
    title: 'Capture & Manage',
    description: 'Take a photo of your scene, upload your own poster, or clear all posters from the control panel',
    icon: '📷',
  },
];

/**
 * Step-by-step tutorial overlay. Auto-shows on first visit; renders null
 * once dismissed (which also marks the tutorial as completed).
 */
export const InstructionsOverlay: React.FC = () => {
  const { showInstructions, setShowInstructions } = useUIState();
  const tutorialCompleted = useTutorialCompleted();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Show instructions on first visit. The 500 ms delay lets the app settle
  // (camera prompt, layout) before the dialog animates in.
  useEffect(() => {
    if (!tutorialCompleted && !showInstructions) {
      const timer = setTimeout(() => {
        setShowInstructions(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tutorialCompleted, showInstructions, setShowInstructions]);

  // Handle visibility animation
  useEffect(() => {
    if (showInstructions) {
      setIsVisible(true);
    }
  }, [showInstructions]);

  // Two-phase close: drop the CSS "visible" class first so the fade-out
  // animation (300 ms, matches InstructionsOverlay.css) plays, then actually
  // hide the overlay and reset to step 0 for the next opening.
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      setShowInstructions(false);
      setCurrentStep(0);
    }, 300);
  };

  /** Advances to the next slide, or closes the tutorial from the last slide. */
  const handleNext = () => {
    if (currentStep < INSTRUCTION_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  if (!showInstructions) return null;

  const currentInstruction = INSTRUCTION_STEPS[currentStep];
  const progress = ((currentStep + 1) / INSTRUCTION_STEPS.length) * 100;

  return (
    <div
      className={`instructions-overlay ${isVisible ? 'instructions-visible' : ''}`}
      role="dialog"
      aria-labelledby="instructions-title"
      aria-modal="true"
    >
      <div className="instructions-backdrop" onClick={handleClose} />
      
      <div className="instructions-content">
        {/* Close button */}
        <button
          className="instructions-close"
          onClick={handleClose}
          aria-label="Close instructions"
        >
          ×
        </button>

        {/* Progress bar */}
        <div className="instructions-progress">
          <div
            className="instructions-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="instructions-step-indicator">
          Step {currentStep + 1} of {INSTRUCTION_STEPS.length}
        </div>

        {/* Current step content */}
        <div className="instructions-step">
          <div className="instructions-icon">{currentInstruction.icon}</div>
          <h2 id="instructions-title" className="instructions-title">
            {currentInstruction.title}
          </h2>
          <p className="instructions-description">
            {currentInstruction.description}
          </p>
        </div>

        {/* Step dots */}
        <div className="instructions-dots">
          {INSTRUCTION_STEPS.map((step, index) => (
            <button
              key={step.id}
              className={`instructions-dot ${index === currentStep ? 'active' : ''} ${
                index < currentStep ? 'completed' : ''
              }`}
              onClick={() => setCurrentStep(index)}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="instructions-actions">
          {currentStep > 0 && (
            <button
              className="instructions-button instructions-button-secondary"
              onClick={handlePrevious}
            >
              Previous
            </button>
          )}
          
          <button
            className="instructions-button instructions-button-text"
            onClick={handleSkip}
          >
            Skip
          </button>
          
          <button
            className="instructions-button instructions-button-primary"
            onClick={handleNext}
          >
            {currentStep === INSTRUCTION_STEPS.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
