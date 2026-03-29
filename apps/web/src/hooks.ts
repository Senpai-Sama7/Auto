import { useEffect, useCallback } from "react";

type KeyboardShortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
};

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isInput) return;

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
        const shiftMatch = !!shortcut.shift === event.shiftKey;
        const altMatch = !!shortcut.alt === event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export function useOnboardingTour(storageKey = "ultimate-system-tour-done") {
  const isTourDone = typeof window !== "undefined" 
    ? localStorage.getItem(storageKey) === "true"
    : false;

  const completeTour = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
    }
  }, [storageKey]);

  const resetTour = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return { isTourDone, completeTour, resetTour };
}

export const DEFAULT_SHORTCUTS: Omit<KeyboardShortcut, "action">[] = [
  { key: "r", ctrl: true, description: "Refresh dashboard" },
  { key: "n", ctrl: true, description: "Create new task" },
  { key: "a", ctrl: true, description: "View pending approvals" },
  { key: "k", ctrl: true, description: "Show keyboard shortcuts" },
  { key: "Escape", description: "Close modal/dialog" },
  { key: "?", shift: true, description: "Show keyboard shortcuts" },
  { key: "j", description: "Next task" },
  { key: "k", description: "Previous task" },
  { key: "Enter", description: "View task details" },
];

// Guided Tour System
export type TourStep = {
  id: string;
  title: string;
  content: string;
  target?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
};

export type TourConfig = {
  steps: TourStep[];
  storageKey: string;
};

export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Ultimate System',
    content: 'This dashboard lets you create work requests, track progress, and manage approvals. Let\'s take a quick tour!'
  },
  {
    id: 'metrics',
    title: 'Key Metrics',
    content: 'See your monthly budget, pending approvals, active tasks, and released work at a glance.'
  },
  {
    id: 'task-form',
    title: 'Create Tasks',
    content: 'Fill out the form to create a new work request. Choose the execution mode and capabilities needed.'
  },
  {
    id: 'task-list',
    title: 'Task Management',
    content: 'Select any task to see details, approve it, or review the results.'
  },
  {
    id: 'workers',
    title: 'Worker Status',
    content: 'Monitor your workers - see who\'s active, their budgets, and current tasks.'
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    content: 'Press ? or Ctrl+K anytime to see keyboard shortcuts for faster navigation.'
  }
];

export function useGuidedTour(config: TourConfig) {
  const isComplete = typeof window !== 'undefined' 
    ? localStorage.getItem(config.storageKey) === 'true'
    : false;

  const completeTour = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(config.storageKey, 'true');
    }
  };

  const resetTour = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(config.storageKey);
    }
  };

  return { isComplete, completeTour, resetTour, steps: config.steps };
}
