import { loadLocalEnv } from "./env.js";

loadLocalEnv();

async function main() {
  const baseUrl = "http://localhost:4100";
  const email = process.env.ULTIMATE_SYSTEM_ADMIN_EMAIL || "admin@ultimate-system.local";
  const password = process.env.ULTIMATE_SYSTEM_ADMIN_PASSWORD || "change-this-password";

  console.log("Logging in as", email);
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!loginRes.ok) {
    console.error("Login failed:", loginRes.status, await loginRes.text());
    process.exit(1);
  }

  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    console.error("No cookie returned");
    process.exit(1);
  }

  console.log("Login successful. Creating task...");
  const createRes = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie
    },
    body: JSON.stringify({
      title: "E2E Live Verification Task",
      description: "Verify that the worker picks this up and executes it successfully using Hermes.",
      requestedBy: "E2E-Script",
      budgetCapUsd: 5.0,
      executionMode: "provider"
    })
  });

  if (!createRes.ok) {
    console.error("Task creation failed:", createRes.status, await createRes.text());
    process.exit(1);
  }

  const task = await createRes.json() as { id: string };
  console.log(`Task created with ID: ${task.id}`);

  console.log("Approving task...");
  const approveRes = await fetch(`${baseUrl}/api/tasks/${task.id}/approval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie
    },
    body: JSON.stringify({
      approvalState: "approved",
      reason: "Auto-approved by E2E test script"
    })
  });

  if (!approveRes.ok) {
    console.error("Task approval failed:", approveRes.status, await approveRes.text());
    process.exit(1);
  }
  console.log("Task approved.");

  console.log("Waiting 15 seconds for worker to pick up and process...");
  await new Promise(r => setTimeout(r, 15000));

  const stateRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
    headers: { "Cookie": cookie }
  });

  if (stateRes.ok) {
    const state = await stateRes.json();
    console.log("Task State:");
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.error("Failed to fetch task state", await stateRes.text());
  }

  const execRes = await fetch(`${baseUrl}/api/tasks/${task.id}/executions`, {
    headers: { "Cookie": cookie }
  });

  if (execRes.ok) {
    const executions = await execRes.json();
    console.log("Executions:");
    console.log(JSON.stringify(executions, null, 2));
  } else {
    console.error("Failed to fetch task executions", await execRes.text());
  }
}

main().catch(console.error);