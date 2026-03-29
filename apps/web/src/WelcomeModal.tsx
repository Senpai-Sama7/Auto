import { useState } from "react";

interface WelcomeModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

const WELCOME_STEPS = [
  {
    icon: "📋",
    title: "Create Work Requests",
    description: "Submit tasks with clear descriptions, budget limits, and required capabilities."
  },
  {
    icon: "✅",
    title: "Get Approvals",
    description: "AI-assisted tasks require approval before execution. Reviewers can approve or request changes."
  },
  {
    icon: "🚀",
    title: "Track Progress",
    description: "Watch tasks move through stages: waiting, in progress, under review, and released."
  },
  {
    icon: "🔍",
    title: "Review Results",
    description: "Every task includes detailed artifacts: specs, plans, tests, and security checks."
  }
];

export function WelcomeModal({ onComplete, onSkip }: WelcomeModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < WELCOME_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const step = WELCOME_STEPS[currentStep]!;
  const isLastStep = currentStep === WELCOME_STEPS.length - 1;

  return (
    <div className="welcome-overlay">
      <div className="welcome-modal">
        <div className="welcome-header">
          <h2>Welcome to Ultimate System</h2>
          <p>Your personal orchestration dashboard</p>
        </div>

        <div className="welcome-content">
          <div className="welcome-icon">{step.icon}</div>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>

        <div className="welcome-progress">
          {WELCOME_STEPS.map((_, index) => (
            <button
              key={index}
              className={`progress-dot ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`}
              onClick={() => setCurrentStep(index)}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        <div className="welcome-actions">
          <button className="skip-button" onClick={onSkip}>
            Skip tour
          </button>
          <button className="next-button" onClick={handleNext}>
            {isLastStep ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
