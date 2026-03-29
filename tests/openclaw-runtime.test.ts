import { delimiter, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOpenClawEnv,
  buildOpenClawGatewayCallArgs,
  normalizeOpenClawToolCatalog,
  parseOpenClawJsonOutput,
  resolveOpenClawHttpBase
} from "../packages/core/src/openclaw.js";
import {
  createOpenClawSessionKey,
  extractLikelyOpenClawProviderError
} from "../apps/worker/src/runtimeAdapters.js";

describe("OpenClaw runtime helpers", () => {
  it("prepends the repo-pinned OpenClaw checkout to PATH", () => {
    const rootDir = "/tmp/ultimate-system-openclaw";
    const env = buildOpenClawEnv(
      {
        PATH: ["/usr/local/bin", "/usr/bin"].join(delimiter)
      },
      rootDir
    );

    expect(env.PATH?.split(delimiter)[0]).toBe(resolve(rootDir, ".cache/upstreams/openclaw"));
  });

  it("creates task-scoped OpenClaw session keys", () => {
    expect(createOpenClawSessionKey("Ultimate-System", "Task 123/ABC")).toBe(
      "agent:ultimate-system:task:task-123-abc"
    );
  });

  it("builds gateway call arguments with a valid token and URL order", () => {
    expect(buildOpenClawGatewayCallArgs({
      method: "tools.catalog",
      env: {
        OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:28789",
        OPENCLAW_GATEWAY_TOKEN: "dev-token"
      },
      payload: { includePlugins: true },
      expectFinal: true
    })).toEqual([
      "gateway",
      "call",
      "tools.catalog",
      "--url",
      "ws://127.0.0.1:28789",
      "--token",
      "dev-token",
      "--params",
      "{\"includePlugins\":true}",
      "--json",
      "--expect-final"
    ]);
  });

  it("converts websocket gateway URLs to the matching HTTP base for history reads", () => {
    expect(resolveOpenClawHttpBase("ws://127.0.0.1:28789")).toBe("http://127.0.0.1:28789");
    expect(resolveOpenClawHttpBase("wss://gateway.example.com")).toBe("https://gateway.example.com");
  });

  it("normalizes the live gateway catalog shape into the app-facing sections format", () => {
    const catalog = normalizeOpenClawToolCatalog({
      agentId: "dev",
      profiles: [
        { id: "coding", label: "Coding" },
        { id: "full", label: "Full" }
      ],
      groups: [
        {
          id: "fs",
          label: "Files",
          source: "core",
          tools: [
            {
              id: "read",
              label: "read",
              description: "Read file contents",
              source: "core",
              defaultProfiles: ["coding"]
            }
          ]
        },
        {
          id: "plugin:figma",
          label: "figma",
          source: "plugin",
          pluginId: "figma",
          tools: [
            {
              id: "figma.get_file",
              label: "figma.get_file",
              description: "Read a Figma file",
              source: "plugin",
              pluginId: "figma",
              optional: true,
              defaultProfiles: []
            }
          ]
        }
      ]
    });

    expect(catalog.agentId).toBe("dev");
    expect(catalog.groups).toEqual({
      fs: ["read"],
      "plugin:figma": ["figma.get_file"]
    });
    expect(catalog.sections[0]).toMatchObject({
      id: "fs",
      source: "core",
      tools: [
        {
          id: "read",
          profiles: ["coding"],
          source: "core"
        }
      ]
    });
    expect(catalog.sections[1]).toMatchObject({
      id: "plugin:figma",
      source: "plugin",
      pluginId: "figma",
      tools: [
        {
          id: "figma.get_file",
          optional: true,
          source: "plugin"
        }
      ]
    });
  });

  it("parses JSON from stderr when upstream emits machine output on the error stream", () => {
    expect(parseOpenClawJsonOutput("", "{\"skills\":[{\"name\":\"firecrawl\"}]}")).toEqual({
      skills: [{ name: "firecrawl" }]
    });
  });

  it("extracts JSON when warning lines precede the payload", () => {
    expect(
      parseOpenClawJsonOutput(
        "(node:123) Warning: something noisy\\n{\"available\":true,\"count\":3}",
        ""
      )
    ).toEqual({
      available: true,
      count: 3
    });
  });

  it("detects plain-text provider failures without misclassifying JSON output", () => {
    expect(
      extractLikelyOpenClawProviderError(
        "Your account is not active, please check your billing details on our website."
      )
    ).toContain("billing details");
    expect(extractLikelyOpenClawProviderError('{"summary":"ok","artifacts":{},"memoryAdditions":[]}')).toBeNull();
    expect(extractLikelyOpenClawProviderError("Here is a draft response in prose.")).toBeNull();
  });
});
