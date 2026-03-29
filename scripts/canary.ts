import { loadLocalEnv } from "./env.js";

loadLocalEnv();

type CheckResult = {
  name: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  detail: string;
};

const apiBase = process.env.CANARY_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4100";
const webUrl = process.env.CANARY_WEB_URL ?? "http://localhost:4173";
const paperclipUrl = process.env.PAPERCLIP_URL ?? "http://127.0.0.1:3100";
const hermesHealthUrl = process.env.HERMES_HEALTH_URL
  ?? `http://${process.env.HERMES_API_HOST ?? "127.0.0.1"}:${process.env.HERMES_API_PORT ?? "8642"}/health`;
const passes = Number(process.env.CANARY_PASSES ?? 2);
const adminEmail = process.env.ULTIMATE_SYSTEM_ADMIN_EMAIL ?? "DouglasMitchell@ReliantAI.org";
const adminPassword = process.env.ULTIMATE_SYSTEM_ADMIN_PASSWORD ?? "Hiphop12!";

function nowIso(): string {
  return new Date().toISOString();
}

async function timedFetch(url: string, init?: RequestInit): Promise<{ response: Response; latencyMs: number }> {
  const startedAt = performance.now();
  const response = await fetch(url, init);
  return {
    response,
    latencyMs: Number((performance.now() - startedAt).toFixed(2))
  };
}

async function login(): Promise<string> {
  const { response } = await timedFetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword
    })
  });
  if (!response.ok) {
    throw new Error(`Admin login failed: ${response.status} ${await response.text()}`);
  }
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Admin login succeeded but returned no session cookie.");
  }
  return cookie.split(";")[0] ?? cookie;
}

async function runCheck(name: string, url: string, init: RequestInit, validate: (response: Response, body: string) => string | null): Promise<CheckResult> {
  try {
    const { response, latencyMs } = await timedFetch(url, init);
    const body = await response.text();
    const detail = validate(response, body);
    return {
      name,
      ok: detail === null,
      status: response.status,
      latencyMs,
      detail: detail ?? "ok"
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: null,
      latencyMs: 0,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

const cookie = await login();
const checks: CheckResult[] = [];

for (let pass = 1; pass <= passes; pass += 1) {
  checks.push(
    await runCheck(`api-health-pass-${pass}`, `${apiBase}/api/health`, {}, (response, body) => {
      if (!response.ok) {
        return `Expected 200, received ${response.status}.`;
      }
      const parsed = JSON.parse(body) as { status?: string };
      return parsed.status === "ok" ? null : "Health payload did not contain status=ok.";
    })
  );
  checks.push(
    await runCheck(`api-state-pass-${pass}`, `${apiBase}/api/state`, {
      headers: {
        cookie
      }
    }, (response, body) => {
      if (!response.ok) {
        return `Expected 200, received ${response.status}.`;
      }
      const parsed = JSON.parse(body) as { org?: { name?: string }; workers?: unknown[]; tasks?: unknown[] };
      if (!parsed.org?.name) {
        return "State payload missing org name.";
      }
      if (!Array.isArray(parsed.workers) || !Array.isArray(parsed.tasks)) {
        return "State payload missing workers/tasks arrays.";
      }
      return null;
    })
  );
  checks.push(
    await runCheck(`web-root-pass-${pass}`, webUrl, {}, (response, body) => {
      if (!response.ok) {
        return `Expected 200, received ${response.status}.`;
      }
      return body.includes("Ultimate System") ? null : "Web root did not contain the expected application title.";
    })
  );
  checks.push(
    await runCheck(`paperclip-health-pass-${pass}`, `${paperclipUrl}/api/health`, {}, (response, body) => {
      if (!response.ok) {
        return `Expected 200, received ${response.status}.`;
      }
      const parsed = JSON.parse(body) as { status?: string };
      return parsed.status === "ok" ? null : "Paperclip health payload did not contain status=ok.";
    })
  );
  checks.push(
    await runCheck(`hermes-health-pass-${pass}`, hermesHealthUrl, {}, (response, body) => {
      if (!response.ok) {
        return `Expected 200, received ${response.status}.`;
      }
      const parsed = JSON.parse(body) as { status?: string };
      return parsed.status === "ok" ? null : "Hermes health payload did not contain status=ok.";
    })
  );
}

const report = {
  generatedAt: nowIso(),
  apiBase,
  webUrl,
  paperclipUrl,
  hermesHealthUrl,
  passes,
  passed: checks.every((check) => check.ok),
  checks
};

console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  process.exit(1);
}
