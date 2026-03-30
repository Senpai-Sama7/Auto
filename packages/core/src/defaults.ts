import { randomUUID } from "node:crypto";
import type {
  ExecutionMode,
  GateEvidence,
  GateRecord,
  GateType,
  Org,
  ReleaseDecision,
  SkillDefinition,
  TaskRecord,
  WorkerRecord
} from "@ultimate-system/contracts";
import type {
  ApprovalPolicy,
  BudgetPolicy,
  DispatchPolicy,
  FailurePolicy,
  GateEvaluationContext,
  GateEvaluationResult,
  ReleaseGate,
  ReviewGate,
  SkillRegistry
} from "./interfaces.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultOrg(): Org {
  return {
    id: "org-core",
    name: "Ultimate System Labs",
    mission: "Route work through a governed control plane and complete it through durable workers.",
    monthlyBudgetUsd: 2500,
    spentBudgetUsd: 0,
    lastBudgetResetAt: null,
    createdAt: nowIso()
  };
}

export function createDefaultWorker(executionModes: ExecutionMode[] = ["deterministic"]): WorkerRecord {
  const timestamp = nowIso();
  return {
    id: "worker-runtime-local",
    orgId: "org-core",
    teamId: "team-platform",
    name: "Local Worker Runtime",
    role: "Operational worker runtime with persistent memory and auditable execution records",
    adapter: executionModes.includes("provider") ? "openai-responses-adapter" : "deterministic-runtime-adapter",
    status: "idle",
    currentTaskId: null,
    capabilities: ["planning", "review", "qa", "security", "release"],
    executionModes,
    monthlyBudgetUsd: 750,
    spentBudgetUsd: 0,
    lastBudgetResetAt: null,
    lastHeartbeatAt: null,
    lastSummary: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createEmptyGateEvidence(summary = "Gate not evaluated yet."): GateEvidence {
  return {
    summary,
    rules: [],
    generatedAt: nowIso()
  };
}

export function createGate(taskId: string, gateType: GateType): GateRecord {
  return {
    id: randomUUID(),
    taskId,
    gateType,
    status: gateType === "release" ? "blocked" : "pending",
    required: true,
    evidence: createEmptyGateEvidence(),
    updatedAt: nowIso()
  };
}

export function createDefaultGates(taskId: string): GateRecord[] {
  return [
    createGate(taskId, "product"),
    createGate(taskId, "engineering"),
    createGate(taskId, "qa"),
    createGate(taskId, "security"),
    createGate(taskId, "release")
  ];
}

export class ConservativeBudgetPolicy implements BudgetPolicy {
  constructor(
    private readonly providerInputUsdPerMillionTokens = 1.25,
    private readonly providerOutputUsdPerMillionTokens = 10
  ) {}

  estimateDispatchCost(task: TaskRecord): number {
    if (task.executionMode === "deterministic") {
      return 0;
    }

    const approximateInputTokens = Math.ceil((task.title.length + task.description.length + 600) / 4);
    const approximateOutputTokens = 1200;
    const inputUsd = (approximateInputTokens / 1_000_000) * this.providerInputUsdPerMillionTokens;
    const outputUsd = (approximateOutputTokens / 1_000_000) * this.providerOutputUsdPerMillionTokens;
    return Number((inputUsd + outputUsd).toFixed(4));
  }

  canDispatch(task: TaskRecord, worker: WorkerRecord, org: Org): {
    allowed: boolean;
    reason?: string;
    estimatedCostUsd: number;
  } {
    const estimatedCostUsd = this.estimateDispatchCost(task);
    if (task.budgetCapUsd < estimatedCostUsd) {
      return {
        allowed: false,
        reason: "Task budget cap is lower than the estimated execution cost.",
        estimatedCostUsd
      };
    }

    if (worker.spentBudgetUsd + estimatedCostUsd > worker.monthlyBudgetUsd) {
      return {
        allowed: false,
        reason: "Worker monthly budget would be exceeded.",
        estimatedCostUsd
      };
    }

    if (org.spentBudgetUsd + estimatedCostUsd > org.monthlyBudgetUsd) {
      return {
        allowed: false,
        reason: "Org monthly budget would be exceeded.",
        estimatedCostUsd
      };
    }

    return { allowed: true, estimatedCostUsd };
  }
}

export class DefaultApprovalPolicy implements ApprovalPolicy {
  constructor(private readonly autoApproveBudgetUsd = 50) {}

  evaluate(input: { budgetCapUsd: number; executionMode: ExecutionMode }): {
    approvalState: TaskRecord["approvalState"];
    approvalReason: string | null;
  } {
    if (input.executionMode === "provider") {
      return {
        approvalState: "pending",
        approvalReason: "Provider-backed execution requires explicit approval."
      };
    }

    if (input.budgetCapUsd > this.autoApproveBudgetUsd) {
      return {
        approvalState: "pending",
        approvalReason: "Budget cap exceeds the auto-approval threshold."
      };
    }

    return {
      approvalState: "approved",
      approvalReason: "Auto-approved by control-plane policy."
    };
  }
}

export class BoundedRetryPolicy implements FailurePolicy {
  onFailure(task: TaskRecord, error: string): {
    nextStatus: Extract<TaskRecord["status"], "queued" | "failed">;
    retryCount: number;
  } {
    void error;
    const retryCount = task.retryCount + 1;
    return {
      nextStatus: retryCount <= task.maxRetries ? "queued" : "failed",
      retryCount
    };
  }
}

export class CapabilityDispatchPolicy implements DispatchPolicy {
  canWorkerExecute(task: TaskRecord, worker: WorkerRecord): {
    allowed: boolean;
    reason?: string;
  } {
    const missingCapabilities = task.requiredCapabilities.filter(
      (capability) => !worker.capabilities.includes(capability)
    );
    if (missingCapabilities.length > 0) {
      return {
        allowed: false,
        reason: `Worker is missing required capabilities: ${missingCapabilities.join(", ")}.`
      };
    }

    if (!worker.executionModes.includes(task.executionMode)) {
      return {
        allowed: false,
        reason: `Worker does not support execution mode ${task.executionMode}.`
      };
    }

    return { allowed: true };
  }
}

const defaultSkills: SkillDefinition[] = [
  {
    id: "spec-first",
    name: "Spec First",
    phase: "spec",
    summary: "Capture the requested outcome as explicit acceptance criteria before execution."
  },
  {
    id: "plan-second",
    name: "Plan Second",
    phase: "plan",
    summary: "Translate the spec into a sequenced implementation or investigation plan."
  },
  {
    id: "task-slicing",
    name: "Task Slicing",
    phase: "slice",
    summary: "Break work into small units that can be reviewed and audited."
  },
  {
    id: "tdd",
    name: "TDD",
    phase: "tdd",
    summary: "Identify observable checks before claiming success."
  },
  {
    id: "review-loop",
    name: "Review Loop",
    phase: "review",
    summary: "Require engineering, QA, and security evidence before release."
  },
  {
    id: "release-handoff",
    name: "Release Handoff",
    phase: "release",
    summary: "Release only when approvals, gates, and execution records agree."
  }
];

export class DefaultSkillRegistry implements SkillRegistry {
  list(): SkillDefinition[] {
    return [...defaultSkills];
  }

  resolve(task: TaskRecord): SkillDefinition[] {
    const skillHint = task.skillHint;
    if (skillHint) {
      const matches = defaultSkills.filter((skill) =>
        `${skill.name} ${skill.summary}`.toLowerCase().includes(skillHint.toLowerCase())
      );
      return matches.length > 0 ? matches : this.list();
    }

    return this.list();
  }
}

function summarizeRules(summary: string, rules: GateEvidence["rules"]): GateEvidence {
  return {
    summary,
    rules,
    generatedAt: nowIso()
  };
}

function toResult(summary: string, rules: GateEvidence["rules"]): GateEvaluationResult {
  const status = rules.every((rule) => rule.passed) ? "passed" : "blocked";
  return {
    status,
    evidence: summarizeRules(summary, rules)
  };
}

abstract class BaseReviewGate implements ReviewGate {
  abstract readonly gateType: Exclude<GateRecord["gateType"], "release">;
  abstract evaluate(context: GateEvaluationContext): GateEvaluationResult;
}

export class ProductGate extends BaseReviewGate {
  readonly gateType = "product";

  evaluate(context: GateEvaluationContext): GateEvaluationResult {
    const artifacts = context.task.artifacts;
    const rules = [
      {
        code: "SPEC_PRESENT",
        passed: Boolean(artifacts?.specDoc && artifacts.specDoc.length > 40),
        message: "Specification document is present and non-trivial."
      },
      {
        code: "PLAN_PRESENT",
        passed: Boolean(artifacts?.planDoc && artifacts.planDoc.length > 40),
        message: "Plan document is present and non-trivial."
      },
      {
        code: "ACCEPTANCE_CRITERIA_PRESENT",
        passed: Boolean(artifacts?.acceptanceCriteria.length),
        message: "Acceptance criteria were captured."
      }
    ];
    return toResult("Product gate checks specification clarity and acceptance criteria coverage.", rules);
  }
}

export class EngineeringGate extends BaseReviewGate {
  readonly gateType = "engineering";

  evaluate(context: GateEvaluationContext): GateEvaluationResult {
    const artifacts = context.task.artifacts;
    const latestExecution = context.executions[0];
    const hasBlockingFinding = artifacts?.reviewFindings.some((finding) => finding.severity === "high") ?? false;
    const rules = [
      {
        code: "TASK_SLICES_PRESENT",
        passed: Boolean(artifacts?.taskSlices.length),
        message: "Task slices were produced."
      },
      {
        code: "TDD_NOTES_PRESENT",
        passed: Boolean(artifacts?.tddNotes.length),
        message: "Execution includes concrete checks."
      },
      {
        code: "EXECUTION_SUCCEEDED",
        passed: latestExecution?.status === "succeeded",
        message: "Latest execution completed successfully."
      },
      {
        code: "NO_BLOCKING_FINDINGS",
        passed: !hasBlockingFinding,
        message: "Review findings do not include unresolved high-severity issues."
      }
    ];
    return toResult("Engineering gate checks execution integrity and review outcomes.", rules);
  }
}

export class QaGate extends BaseReviewGate {
  readonly gateType = "qa";

  evaluate(context: GateEvaluationContext): GateEvaluationResult {
    const artifacts = context.task.artifacts;
    const areas = new Set(artifacts?.qaChecks.map((check) => check.area) ?? []);
    const rules = [
      {
        code: "API_CHECK_PRESENT",
        passed: areas.has("api"),
        message: "QA evidence includes an API verification step."
      },
      {
        code: "RUNTIME_CHECK_PRESENT",
        passed: areas.has("runtime"),
        message: "QA evidence includes a runtime verification step."
      },
      {
        code: "QA_CHECKS_STRUCTURED",
        passed: Boolean(
          artifacts?.qaChecks.every((check) => check.command.length > 0 && check.expected.length > 0)
        ),
        message: "QA checks are structured with commands and expected outcomes."
      }
    ];
    return toResult("QA gate checks operational verification coverage.", rules);
  }
}

export class SecurityGate extends BaseReviewGate {
  readonly gateType = "security";

  evaluate(context: GateEvaluationContext): GateEvaluationResult {
    const controls = context.task.artifacts?.securityControls ?? [];
    const categories = new Set(controls.map((control) => control.category));
    const implementedCount = controls.filter((control) => control.status === "implemented").length;
    const rules = [
      {
        code: "VALIDATION_CONTROL_PRESENT",
        passed: categories.has("validation"),
        message: "Security evidence includes input validation controls."
      },
      {
        code: "TRUST_BOUNDARY_CONTROL_PRESENT",
        passed: categories.has("trust-boundary"),
        message: "Security evidence covers trust boundaries."
      },
      {
        code: "AUDIT_CONTROL_PRESENT",
        passed: categories.has("audit"),
        message: "Security evidence covers auditability."
      },
      {
        code: "ALL_CONTROLS_IMPLEMENTED",
        passed: controls.length > 0 && implementedCount === controls.length,
        message: "All declared security controls are marked implemented."
      }
    ];
    return toResult("Security gate checks implemented controls and boundary coverage.", rules);
  }
}

export class DefaultReleaseGate implements ReleaseGate {
  evaluate(context: GateEvaluationContext, priorGates: GateRecord[]): GateEvaluationResult & {
    decision: ReleaseDecision;
  } {
    const latestExecution = context.executions[0];
    const priorPassed = priorGates.every((gate) => gate.status === "passed");
    const releaseChecksSatisfied = context.task.artifacts?.releaseChecks.every((check) => check.status === "satisfied") ?? false;
    const approvalSatisfied = context.task.approvalState === "approved";
    const executionSucceeded = latestExecution?.status === "succeeded";

    const rules = [
      {
        code: "PRIOR_GATES_PASSED",
        passed: priorPassed,
        message: "All non-release gates passed."
      },
      {
        code: "TASK_APPROVED",
        passed: approvalSatisfied,
        message: "Task approval is in the approved state."
      },
      {
        code: "EXECUTION_SUCCEEDED",
        passed: executionSucceeded,
        message: "Latest execution succeeded."
      },
      {
        code: "RELEASE_CHECKLIST_SATISFIED",
        passed: releaseChecksSatisfied,
        message: "Release checklist items are satisfied."
      }
    ];

    const blockingReasons = rules.filter((rule) => !rule.passed).map((rule) => rule.message);
    const reasons = rules.filter((rule) => rule.passed).map((rule) => rule.message);
    const decision: ReleaseDecision = {
      allowed: blockingReasons.length === 0,
      reasons,
      blockingReasons,
      decidedAt: nowIso()
    };

    return {
      status: decision.allowed ? "passed" : "blocked",
      evidence: summarizeRules(
        decision.allowed
          ? "Release gate approved deployment."
          : "Release gate blocked deployment.",
        rules
      ),
      decision
    };
  }
}

export const defaultReviewGates: ReviewGate[] = [
  new ProductGate(),
  new EngineeringGate(),
  new QaGate(),
  new SecurityGate()
];
