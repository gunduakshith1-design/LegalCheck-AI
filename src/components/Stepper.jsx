import React from 'react';
import './Stepper.css';

/**
 * Stepper — professional process timeline for order/delivery/report status.
 *
 * Adapted from React Bits for LegalCheck AI's light, restrained design.
 * Uses real database status — no fake progress.
 */

const STATUS_ICONS = {
  complete: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  active: null,
};

export default function Stepper({
  steps = [],
  currentStep = 0,
  className = '',
  orientation = 'vertical',
}) {
  return (
    <div className={`stepper stepper--${orientation} ${className}`}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isPending = index > currentStep;

        return (
          <div
            key={step.label || index}
            className={`stepper__step ${isCompleted ? 'stepper__step--completed' : ''} ${isActive ? 'stepper__step--active' : ''} ${isPending ? 'stepper__step--pending' : ''}`}
          >
            <div className="stepper__indicator">
              <div className={`stepper__circle ${isCompleted ? 'stepper__circle--completed' : ''} ${isActive ? 'stepper__circle--active' : ''}`}>
                {isCompleted ? STATUS_ICONS.complete : isActive ? <div className="stepper__dot" /> : <span className="stepper__number">{index + 1}</span>}
              </div>
              {index < steps.length - 1 && (
                <div className={`stepper__line ${isCompleted ? 'stepper__line--completed' : ''}`} />
              )}
            </div>
            <div className="stepper__content">
              <span className={`stepper__label ${isActive ? 'stepper__label--active' : ''}`}>
                {step.label}
              </span>
              {step.description && (
                <span className="stepper__description">{step.description}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
