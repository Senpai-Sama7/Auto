import { loadLocalEnv } from "./env.js";

loadLocalEnv();

type BenchmarkSample = {
  url: string;
  status: number;
  latencyMs: number;
  bytes: number;
};

type BenchmarkReport = {
  name: string;
  url: string;
  samples: BenchmarkSample[];
  averageMs: number;
  p95Ms: number;
  maxBytes: number;
  thresholdMs: number;
  passed: boolean;
};

const apiBase = process.env.CANARY_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4100";
const webUrl = process.env.CANARY_WEB_URL ?? "http://localhost:4173";
const paperclipUrl = process.env.PAPERCLIP_URL ?? "http://127.0.0.1:3100";
const hermesHealthUrl = process.env.HERMES_HEALTH_URL
  ?? `http://${process.env.HERMES_API_HOST ?? "127.0.0.1"}:${process.env.HERMES_API_PORT ?? "8642"}/health`;
const adminEmail = process.env.ULTIMATE_SYSTEM_ADMIN_EMAIL ?? "DouglasMitchell@ReliantAI.org";
const adminPassword = process.env.ULTIMATE_SYSTEM_ADMIN_PASSWORD ?? "Hiphop12!";
const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 5);
const apiThresholdMs = Number(process.env.BENCHMARK_MAX_API_P95_MS ?? 1000);
const webThresholdMs = Number(process.env.BENCHMARK_MAX_WEB_P95_MS ?? 3000);
const upstreamThresholdMs = Number(process.env.BENCHMARK_MAX_UPSTREAM_P95_MS ?? 3000);

function percentile(values: number[], value: number): number {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * value) - 1));
  return values[index] ?? 0;
}

async function timedFetch(url: string, init?: RequestInit): Promise<BenchmarkSample> {
  const startedAt = performance.now();
  const response = await fetch(url, init);
  const body = await response.text();
  return {
    url,
    status: response.status,
    latencyMs: Number((performance.now() - startedAt).toFixed(2)),
    bytes: Buffer.byteLength(body)
  };
}

async function login(): Promise<string> {
  const response = await fetch(`${apiBase}/api/auth/login`, {
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

async function benchmark(name: string, url: string, thresholdMs: number, init?: RequestInit): Promise<BenchmarkReport> {
  const samples: BenchmarkSample[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const sample = await timedFetch(url, init);
    samples.push(sample);
  }
  const latencies = samples.map((sample) => sample.latencyMs).sort((left, right) => left - right);
  const averageMs = Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2));
  const p95Ms = Number(percentile(latencies, 0.95).toFixed(2));
  const maxBytes = Math.max(...samples.map((sample) => sample.bytes), 0);
  return {
    name,
    url,
    samples,
    averageMs,
    p95Ms,
    maxBytes,
    thresholdMs,
    passed: samples.every((sample) => sample.status === 200) && p95Ms <= thresholdMs
  };
}

const cookie = await login();
const reports = await Promise.all([
  benchmark("api-health", `${apiBase}/api/health`, apiThresholdMs),
  benchmark("api-state", `${apiBase}/api/state`, apiThresholdMs, {
    headers: {
      cookie
    }
  }),
  benchmark("web-root", webUrl, webThresholdMs),
  benchmark("paperclip-health", `${paperclipUrl}/api/health`, upstreamThresholdMs),
  benchmark("hermes-health", hermesHealthUrl, upstreamThresholdMs)
]);

const result = {
  generatedAt: new Date().toISOString(),
  iterations,
  passed: reports.every((report) => report.passed),
  reports
};

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exit(1);
}
