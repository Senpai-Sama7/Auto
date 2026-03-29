import { SqlitePlatformStore } from "../packages/sqlite-store/src/sqliteStore.js";
import { WorkerRunService, TaskCreationService } from "../packages/core/src/services.js";
import { DefaultApprovalPolicy, ConservativeBudgetPolicy, CapabilityDispatchPolicy, BoundedRetryPolicy, DefaultSkillRegistry } from "../packages/core/src/defaults.js";
import { DeterministicRuntimeAdapter } from "../apps/worker/src/runtimeAdapters.js";
import { createDefaultCommandRunner } from "../apps/worker/src/commandRunner.js";
import { resolve } from "path";

async function main() {
  console.log("🚀 Starting Ultimate System Self-Audit...");

  const repoRoot = resolve(process.cwd());
  const dbPath = resolve(repoRoot, "data/ultimate-system.db");
  const store = new SqlitePlatformStore(dbPath);

  const workerId = "worker-runtime-local";
  
  await store.seedDefaults({
    id: workerId,
    orgId: "org-core",
    teamId: "team-platform",
    name: "Local Self-Audit Worker",
    role: "generalist",
    adapter: "deterministic-runtime-adapter",
    status: "idle",
    currentTaskId: null,
    capabilities: ["planning", "review", "qa", "security", "release", "self-audit"],
    executionModes: ["deterministic"],
    monthlyBudgetUsd: 1000,
    spentBudgetUsd: 0,
    lastHeartbeatAt: new Date().toISOString(),
    lastSummary: "Booting for Self-Audit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const creationService = new TaskCreationService(store, new DefaultApprovalPolicy());
  const task = await creationService.createTask({
    title: "Ultimate System Self-Audit",
    description: "Analyze the codebase in /workspace. Generate comprehensive artifacts that document the system architecture, test coverage, and security boundaries. You must produce specDoc, planDoc, acceptanceCriteria, taskSlices, tddNotes, qaChecks (covering api and runtime), and securityControls (covering validation, trust-boundary, and audit). Ensure no high-severity findings exist.",
    requestedBy: "self-audit-script",
    executionMode: "deterministic",
    requiredCapabilities: ["planning", "review", "qa", "security", "release"],
    maxRetries: 1,
    budgetCapUsd: 10.0,
    orgId: "org-core",
    teamId: "team-platform"
  });

  const taskId = task.id;

  const adapter = new DeterministicRuntimeAdapter({
    commandRunner: createDefaultCommandRunner({
      cwd: repoRoot,
      backend: "shell"
    })
  });
  
  const runService = new WorkerRunService(
    store,
    new ConservativeBudgetPolicy(),
    new DefaultSkillRegistry(),
    new CapabilityDispatchPolicy(),
    new BoundedRetryPolicy(),
    adapter
  );

  console.log(`\n📦 Task ${taskId} created. Claiming and executing...`);
  await runService.runTask(workerId, taskId);

  console.log("\n✅ Execution finished. Retrieving final state...");

  const finalTask = await store.getTask(taskId);
  const dbGates = await store.listGates(taskId);

  console.log(`\n--- Final Task Status: ${finalTask?.status} ---`);
  for (const g of dbGates) {
    console.log(`Gate [${g.gateType.padEnd(12)}]: ${g.status}`);
  }

  if (finalTask?.status === "released") {
    console.log("\n🎉 Self-Audit Successful! The Ultimate System has passed its own gates.");
  } else {
    console.error("\n❌ Self-Audit Failed! The system did not pass.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});