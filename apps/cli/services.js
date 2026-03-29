/**
 * Ultimate System Service Catalog
 * 
 * Pre-defined service templates that can be sold to clients.
 */

export const SERVICE_CATALOG = [
  {
    id: "code-review-basic",
    name: "Basic Code Review",
    description: "Automated code review with lint, typecheck, and best practices analysis",
    price: 29,
    deliveryTime: "5-10 minutes",
    capabilities: ["review", "qa"],
    executionMode: "deterministic",
    artifacts: ["reviewFindings", "qaChecks"],
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test"]
  },
  {
    id: "code-review-pro",
    name: "Professional Code Review",
    description: "AI-assisted code review with security analysis and improvement suggestions",
    price: 79,
    deliveryTime: "10-20 minutes",
    capabilities: ["review", "security", "planning"],
    executionMode: "provider",
    artifacts: ["reviewFindings", "securityControls", "learningNotes"],
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build"]
  },
  {
    id: "security-audit",
    name: "Security Audit",
    description: "Comprehensive security scan with vulnerability detection",
    price: 149,
    deliveryTime: "15-30 minutes",
    capabilities: ["security", "review"],
    executionMode: "provider",
    artifacts: ["securityControls", "reviewFindings", "risks"],
    commands: ["pnpm lint", "pnpm audit", "security-scan"]
  },
  {
    id: "test-generation",
    name: "Test Suite Generation",
    description: "Auto-generate comprehensive unit tests for your codebase",
    price: 99,
    deliveryTime: "20-40 minutes",
    capabilities: ["qa", "planning", "review"],
    executionMode: "provider",
    artifacts: ["tddNotes", "qaChecks", "acceptanceCriteria"],
    commands: ["pnpm test", "pnpm typecheck"]
  },
  {
    id: "documentation-gen",
    name: "Documentation Generator",
    description: "Generate comprehensive documentation from code",
    price: 59,
    deliveryTime: "10-15 minutes",
    capabilities: ["planning", "review"],
    executionMode: "provider",
    artifacts: ["specDoc", "planDoc", "learningNotes"],
    commands: ["pnpm build", "typedoc"]
  },
  {
    id: "refactor-assist",
    name: "Refactoring Assistant",
    description: "AI-assisted code refactoring with quality gates",
    price: 129,
    deliveryTime: "30-60 minutes",
    capabilities: ["planning", "review", "security", "qa"],
    executionMode: "provider",
    artifacts: ["specDoc", "planDoc", "reviewFindings", "tddNotes"],
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build"]
  },
  {
    id: "ci-cd-setup",
    name: "CI/CD Pipeline Setup",
    description: "Configure automated testing and deployment pipeline",
    price: 199,
    deliveryTime: "45-90 minutes",
    capabilities: ["planning", "qa", "release"],
    executionMode: "provider",
    artifacts: ["planDoc", "qaChecks", "releaseChecks"],
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build"]
  },
  {
    id: "full-audit",
    name: "Complete System Audit",
    description: "Full codebase audit: security, quality, performance, documentation",
    price: 399,
    deliveryTime: "2-4 hours",
    capabilities: ["planning", "review", "security", "qa", "release"],
    executionMode: "provider",
    artifacts: ["specDoc", "planDoc", "reviewFindings", "securityControls", "qaChecks", "releaseChecks", "learningNotes"],
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build", "security-scan", "performance-test"]
  }
];

// Get service by ID
export function getService(serviceId) {
  return SERVICE_CATALOG.find(s => s.id === serviceId);
}

// Get all services by category
export function getServicesByCapability(capability) {
  return SERVICE_CATALOG.filter(s => s.capabilities.includes(capability));
}

// Calculate service margin
export function calculateServiceMargin(service) {
  const estimatedCost = service.executionMode === "provider" ? 15 : 2;
  const margin = service.price - estimatedCost;
  const marginPercent = Math.round((margin / service.price) * 100);
  
  return {
    price: service.price,
    estimatedCost,
    margin,
    marginPercent,
    roi: Math.round((margin / estimatedCost) * 100)
  };
}

// Generate task from service template
export function createTaskFromService(serviceId, clientNotes = "") {
  const service = getService(serviceId);
  if (!service) {
    throw new Error(`Service ${serviceId} not found`);
  }
  
  return {
    title: `${service.name} - Automated Service`,
    description: `${service.description}\n\nClient Notes: ${clientNotes}`,
    executionMode: service.executionMode,
    requiredCapabilities: service.capabilities,
    budgetCapUsd: service.price * 0.3, // 30% of sale price as cost budget
    serviceId: service.id,
    servicePrice: service.price,
    commands: service.commands
  };
}
