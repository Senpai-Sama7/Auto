/**
 * Ultimate System Pricing Engine
 * 
 * Defines pricing for different task types and execution modes.
 */

export const PRICING_TIERS = {
  // Deterministic tasks (local execution, no AI)
  deterministic: {
    basePrice: 5,        // Minimum charge
    perMinute: 0.50,     // Execution time charge
    verificationIncluded: true,
    description: "Local verification (lint, typecheck, build, test)"
  },
  
  // Provider tasks (AI-assisted)
  provider: {
    basePrice: 15,       // Minimum charge
    perMinute: 1.00,     // Execution time charge
    providerCost: 0.50,  // Per 1K input tokens
    providerOutputCost: 2.00, // Per 1K output tokens
    description: "AI-assisted with verification"
  }
};

// Task type pricing
export const TASK_TYPES = {
  code_review: {
    name: "Code Review",
    basePrice: 10,
    description: "Comprehensive code analysis",
    capabilities: ["review", "security"]
  },
  security_scan: {
    name: "Security Scan",
    basePrice: 15,
    description: "Vulnerability detection",
    capabilities: ["security"]
  },
  test_generation: {
    name: "Test Generation",
    basePrice: 20,
    description: "Auto-generate unit tests",
    capabilities: ["qa", "planning"]
  },
  documentation: {
    name: "Documentation",
    basePrice: 12,
    description: "Generate documentation",
    capabilities: ["planning"]
  },
  refactoring: {
    name: "Refactoring",
    basePrice: 25,
    description: "Code improvement",
    capabilities: ["planning", "review", "security"]
  },
  deployment: {
    name: "Deployment",
    basePrice: 15,
    description: "Deploy to environment",
    capabilities: ["release", "qa"]
  },
  custom: {
    name: "Custom Task",
    basePrice: 10,
    description: "User-defined task",
    capabilities: []
  }
};

// Calculate price for a task
export function calculatePrice(taskType, executionMode, actualCost = 0, durationMs = 0) {
  const tier = PRICING_TIERS[executionMode] || PRICING_TIERS.deterministic;
  const typeConfig = TASK_TYPES[taskType] || TASK_TYPES.custom;
  
  // Base price from task type
  let price = typeConfig.basePrice;
  
  // Add execution time cost
  const minutes = durationMs / 60000;
  price += minutes * tier.perMinute;
  
  // Add actual provider costs (passed through)
  price += actualCost;
  
  // Minimum price
  price = Math.max(price, tier.basePrice);
  
  return {
    base: typeConfig.basePrice,
    executionTime: minutes * tier.perMinute,
    providerCosts: actualCost,
    total: Math.round(price * 100) / 100,
    currency: "USD",
    profitMargin: 0.70, // 70% margin after costs
    profit: Math.round(price * 0.70 * 100) / 100
  };
}

// Format price for display
export function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price);
}
