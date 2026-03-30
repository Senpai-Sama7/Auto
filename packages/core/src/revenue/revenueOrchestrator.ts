import { randomUUID } from "node:crypto";
import { nowIso } from "../defaults.js";
import type { TaskStore } from "../interfaces.js";
import type { GateRecord, TaskRecord, GateEvidence } from "@ultimate-system/contracts";

const FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Type Guards for API Response Validation
function isApexSearchResult(value: unknown): value is { title?: string; url?: string; snippet?: string } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.title === undefined || typeof obj.title === "string") &&
    (obj.url === undefined || typeof obj.url === "string") &&
    (obj.snippet === undefined || typeof obj.snippet === "string")
  );
}

function isApexSearchResponse(value: unknown): value is { results?: Array<{ title?: string; url?: string; snippet?: string }> } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.results === undefined) return true;
  if (!Array.isArray(obj.results)) return false;
  return obj.results.every(isApexSearchResult);
}

function isHubSpotContact(value: unknown): value is { id: string; properties?: { firstname?: string; email?: string; company?: string } } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (obj.properties !== undefined) {
    const props = obj.properties as Record<string, unknown>;
    if (
      (props.firstname !== undefined && typeof props.firstname !== "string") ||
      (props.email !== undefined && typeof props.email !== "string") ||
      (props.company !== undefined && typeof props.company !== "string")
    ) {
      return false;
    }
  }
  return true;
}

function isHubSpotSearchResponse(value: unknown): value is { contacts?: Array<{ id: string; properties?: { firstname?: string; email?: string; company?: string } }> } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.contacts === undefined) return true;
  if (!Array.isArray(obj.contacts)) return false;
  return obj.contacts.every(isHubSpotContact);
}

function isHvacRequest(value: unknown): value is { id: string; type?: string; description?: string; priority?: string; location?: string } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (obj.type !== undefined && typeof obj.type !== "string") return false;
  if (obj.description !== undefined && typeof obj.description !== "string") return false;
  if (obj.priority !== undefined && typeof obj.priority !== "string") return false;
  if (obj.location !== undefined && typeof obj.location !== "string") return false;
  return true;
}

function isHvacRequestArray(value: unknown): value is Array<{ id: string; type?: string; description?: string; priority?: string; location?: string }> {
  if (!Array.isArray(value)) return false;
  return value.every(isHvacRequest);
}

// Helper to create valid GateEvidence
function createInitialGateEvidence(): GateEvidence {
  return {
    summary: "Gate not yet evaluated",
    rules: [],
    generatedAt: nowIso()
  };
}

// Apex MCP Tool Response Types
type ApexSearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
 type ApexSearchResponse = {
  results?: ApexSearchResult[];
};

type HubSpotContact = {
  id: string;
  properties?: {
    firstname?: string;
    email?: string;
    company?: string;
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
 type HubSpotSearchResponse = {
  contacts?: HubSpotContact[];
};

/**
 * RevenueOrchestrator - Autonomous Business Opportunity Discovery & Task Generation
 * 
 * This service continuously scans for business opportunities and generates
 * revenue-generating tasks. It integrates with:
 * - Apex MCP tools (Brave Search, HubSpot, Slack, etc.)
 * - ClearDesk document processing
 * - Money HVAC dispatch
 * - External APIs for lead generation
 */

export type RevenueStream = 
  | "lead-generation"
  | "document-processing"
  | "hvac-dispatch"
  | "content-creation"
  | "market-research"
  | "sales-outreach";

export type Opportunity = {
  id: string;
  stream: RevenueStream;
  source: string;
  confidence: number; // 0-1
  estimatedValue: number; // USD
  urgency: "critical" | "high" | "medium" | "low";
  description: string;
  actionRequired: string;
  metadata: Record<string, unknown>;
  discoveredAt: string;
};

export type RevenueConfig = {
  enabledStreams: RevenueStream[];
  minConfidenceThreshold: number;
  maxDailyTasks: number;
  budgetPerTask: number;
  autoApproveThreshold: number;
  discoveryIntervalMinutes: number;
  apexMcpEndpoint: string;
  clearDeskEndpoint: string;
  moneyEndpoint: string;
};

export const DEFAULT_REVENUE_CONFIG: RevenueConfig = {
  enabledStreams: [
    "lead-generation",
    "document-processing",
    "market-research",
    "sales-outreach"
  ],
  minConfidenceThreshold: 0.6,
  maxDailyTasks: 50,
  budgetPerTask: 2.0,
  autoApproveThreshold: 25.0,
  discoveryIntervalMinutes: 15,
  apexMcpEndpoint: process.env.APEX_MCP_ENDPOINT ?? "http://localhost:4000",
  clearDeskEndpoint: process.env.CLEARDESK_ENDPOINT ?? "https://clear-desk-ten.vercel.app",
  moneyEndpoint: process.env.MONEY_ENDPOINT ?? "http://localhost:8000"
};

export class RevenueOrchestrator {
  private store: TaskStore;
  private config: RevenueConfig;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private cycleInProgress = false;
  private dailyTaskCount = 0;
  private lastResetDate: string;

  constructor(store: TaskStore, config: Partial<RevenueConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_REVENUE_CONFIG, ...config };
    this.lastResetDate = new Date().toISOString().split("T")[0] ?? "";
  }

  /**
   * Start autonomous revenue generation loop
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run immediately
    await this.runDiscoveryCycle();

    // Schedule periodic discovery
    this.discoveryTimer = setInterval(
      () => this.runDiscoveryCycle(),
      this.config.discoveryIntervalMinutes * 60 * 1000
    );

    console.log(`[RevenueOrchestrator] Started with streams: ${this.config.enabledStreams.join(", ")}`);
    console.log(`[RevenueOrchestrator] Discovery interval: ${this.config.discoveryIntervalMinutes} minutes`);
  }

  /**
   * Stop autonomous generation
   */
  stop(): void {
    this.isRunning = false;
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    console.log("[RevenueOrchestrator] Stopped");
  }

  /**
   * Single discovery cycle - find opportunities and create tasks
   */
  private async runDiscoveryCycle(): Promise<void> {
    // Prevent overlapping cycles
    if (this.cycleInProgress) {
      console.log("[RevenueOrchestrator] Discovery cycle already in progress, skipping");
      return;
    }
    this.cycleInProgress = true;

    try {
      // Reset daily counter if needed
      const today = new Date().toISOString().split("T")[0] ?? "";
      if (today !== this.lastResetDate) {
        this.dailyTaskCount = 0;
        this.lastResetDate = today;
        console.log(`[RevenueOrchestrator] Daily counter reset`);
      }

      if (this.dailyTaskCount >= this.config.maxDailyTasks) {
        console.log(`[RevenueOrchestrator] Daily task limit reached (${this.config.maxDailyTasks})`);
        return;
      }

      console.log("[RevenueOrchestrator] Running discovery cycle...");

      for (const stream of this.config.enabledStreams) {
        try {
          const opportunities = await this.discoverOpportunities(stream);
          const qualified = opportunities.filter(
            o => o.confidence >= this.config.minConfidenceThreshold
          );

          console.log(`[RevenueOrchestrator] ${stream}: ${qualified.length}/${opportunities.length} qualified opportunities`);

          for (const opp of qualified) {
            if (this.dailyTaskCount >= this.config.maxDailyTasks) break;
            await this.createRevenueTask(opp);
            this.dailyTaskCount++;
          }
        } catch (error) {
          console.error(`[RevenueOrchestrator] Error in ${stream} discovery:`, error);
        }
      }
    } finally {
      this.cycleInProgress = false;
    }
  }

  /**
   * Discover opportunities for a specific revenue stream
   */
  private async discoverOpportunities(stream: RevenueStream): Promise<Opportunity[]> {
    switch (stream) {
      case "lead-generation":
        return this.discoverLeads();
      case "document-processing":
        return this.discoverDocumentJobs();
      case "market-research":
        return this.discoverResearchOpportunities();
      case "sales-outreach":
        return this.discoverOutreachOpportunities();
      case "hvac-dispatch":
        return this.discoverHvacOpportunities();
      default:
        return [];
    }
  }

  /**
   * Discover leads via Apex MCP Brave Search + HubSpot
   */
  private async discoverLeads(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    // Search for companies hiring for AI/automation (high intent)
    const searchQueries = [
      "hiring AI automation engineer",
      "looking for document processing solution",
      "HVAC dispatch software needed",
      "accounts receivable automation"
    ];

    for (const query of searchQueries) {
      try {
        // Call Apex MCP brave_search tool with validation
        const rawResults = await this.callApexTool("brave_search", { query, count: 5 });
        if (!isApexSearchResponse(rawResults)) {
          console.error("[RevenueOrchestrator] Invalid response from brave_search");
          continue;
        }
        const searchResults = rawResults;
        
        if (searchResults?.results) {
          for (const result of searchResults.results.slice(0, 3)) {
            const confidence = 0.7;
            const estimatedValue = Math.round(500 + confidence * 2000);
            
            opportunities.push({
              id: randomUUID(),
              stream: "lead-generation",
              source: "brave_search",
              confidence,
              estimatedValue,
              urgency: "medium",
              description: `Lead from search: ${result.title ?? "Untitled"}`,
              actionRequired: `Research ${result.url ?? "#"} and create HubSpot contact`,
              metadata: { url: result.url, snippet: result.snippet, query },
              discoveredAt: nowIso()
            });
          }
        }
      } catch (error) {
        console.error("[RevenueOrchestrator] Brave search failed:", error);
      }
    }

    return opportunities;
  }

  /**
   * Discover document processing jobs
   */
  private async discoverDocumentJobs(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      const response = await fetchWithTimeout(
        `${this.config.clearDeskEndpoint}/api/documents/pending`,
        { method: "GET" }
      );

      if (!response.ok) {
        console.error(`[RevenueOrchestrator] ClearDesk API returned ${response.status}`);
        return opportunities;
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error("[RevenueOrchestrator] Invalid response from ClearDesk: expected array");
        return opportunities;
      }

      for (const job of data.slice(0, 10)) {
        if (
          typeof job !== "object" ||
          job === null ||
          typeof job.type !== "string" ||
          typeof job.volume !== "number"
        ) {
          continue;
        }

        const estimatedValue = typeof job.estimatedValue === "number" ? job.estimatedValue : job.volume * 2;
        const urgency = job.priority === "urgent" ? "high" : "medium";

        opportunities.push({
          id: randomUUID(),
          stream: "document-processing",
          source: "clear_desk_queue",
          confidence: 0.85,
          estimatedValue,
          urgency,
          description: `${job.volume} documents for ${job.type}`,
          actionRequired: `Process ${job.volume} documents via ClearDesk API`,
          metadata: { documentType: job.type, volume: job.volume, jobId: job.id },
          discoveredAt: nowIso()
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[RevenueOrchestrator] ClearDesk API call failed: ${errorMessage}`);
    }

    return opportunities;
  }

  /**
   * Discover market research opportunities
   */
  private async discoverResearchOpportunities(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    // Research trending topics that could become content/products
    const topics = [
      "AI agent orchestration 2024",
      "HVAC industry automation trends",
      "document AI market size"
    ];

    for (const topic of topics) {
      try {
        const rawResults = await this.callApexTool("brave_search", {
          query: topic,
          count: 3
        });
        if (!isApexSearchResponse(rawResults)) {
          console.error("[RevenueOrchestrator] Invalid response from brave_search");
          continue;
        }
        const results = rawResults;

        if (results?.results && results.results.length > 0) {
          opportunities.push({
            id: randomUUID(),
            stream: "market-research",
            source: "trend_analysis",
            confidence: 0.75,
            estimatedValue: 200,
            urgency: "low",
            description: `Research report: ${topic}`,
            actionRequired: `Create comprehensive market analysis on ${topic}`,
            metadata: { topic, resultCount: results.results.length },
            discoveredAt: nowIso()
          });
        }
      } catch (error) {
        console.error("[RevenueOrchestrator] Research discovery failed:", error);
      }
    }

    return opportunities;
  }

  /**
   * Discover sales outreach opportunities
   */
  private async discoverOutreachOpportunities(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    // Check HubSpot for contacts without recent engagement
    try {
      const rawContacts = await this.callApexTool("hubspot_search", {
        type: "contacts",
        query: "recently_created",
        limit: 10
      });
      if (!isHubSpotSearchResponse(rawContacts)) {
        console.error("[RevenueOrchestrator] Invalid response from hubspot_search");
        return opportunities;
      }
      const hubspotContacts = rawContacts;

      if (hubspotContacts?.contacts) {
        for (const contact of hubspotContacts.contacts.slice(0, 5)) {
          opportunities.push({
            id: randomUUID(),
            stream: "sales-outreach",
            source: "hubspot",
            confidence: 0.65,
            estimatedValue: 1000,
            urgency: "medium",
            description: `Follow up with ${contact.properties?.firstname || contact.properties?.email}`,
            actionRequired: `Send personalized outreach email and log in HubSpot`,
            metadata: { 
              contactId: contact.id, 
              email: contact.properties?.email,
              company: contact.properties?.company 
            },
            discoveredAt: nowIso()
          });
        }
      }
    } catch (error) {
      console.error("[RevenueOrchestrator] HubSpot search failed:", error);
    }

    return opportunities;
  }

  /**
   * Discover HVAC dispatch opportunities
   */
  private async discoverHvacOpportunities(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      const response = await fetchWithTimeout(
        `${this.config.moneyEndpoint}/api/requests/pending`,
        { method: "GET" }
      );
      
      if (!response.ok) {
        console.error(`[RevenueOrchestrator] Money HVAC API returned ${response.status}`);
        return opportunities;
      }

      const data = await response.json();
      
      if (!isHvacRequestArray(data)) {
        console.error("[RevenueOrchestrator] Invalid response from Money HVAC: expected array of requests");
        return opportunities;
      }

      for (const request of data.slice(0, 5)) {
        const estimatedValue = request.priority === "EMERGENCY" ? 500 : 200;
        const urgency: "critical" | "high" | "medium" | "low" = 
          request.priority === "EMERGENCY" ? "critical" : 
          request.priority === "HIGH" ? "high" : "medium";

        opportunities.push({
          id: randomUUID(),
          stream: "hvac-dispatch",
          source: "money_hvac",
          confidence: 0.9,
          estimatedValue,
          urgency,
          description: `HVAC ${request.type ?? "Service"}: ${request.description?.substring(0, 50) ?? "Pending"}`,
          actionRequired: `Dispatch technician via Money system for request ${request.id}`,
          metadata: { 
            requestId: request.id, 
            priority: request.priority,
            location: request.location 
          },
          discoveredAt: nowIso()
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[RevenueOrchestrator] Money HVAC check failed: ${errorMessage}`);
    }

    return opportunities;
  }

  /**
   * Create a revenue-generating task from an opportunity
   */
  private async createRevenueTask(opp: Opportunity): Promise<void> {
    const taskId = randomUUID();
    
    // Determine execution mode based on stream complexity
    const executionMode = opp.stream === "document-processing" ? "deterministic" : "provider";
    
    // Calculate budget based on estimated value
    const budgetCapUsd = Math.min(
      this.config.budgetPerTask,
      opp.estimatedValue * 0.1 // 10% of expected value
    );

    // Auto-approve if under threshold
    const autoApprove = budgetCapUsd <= this.config.autoApproveThreshold && 
                       opp.urgency !== "critical";

    const task: TaskRecord = {
      id: taskId,
      orgId: "org-core",
      teamId: "team-revenue",
      title: `[REVENUE] ${opp.stream}: ${opp.description.substring(0, 50)}`,
      description: `
Revenue Opportunity
==================
Stream: ${opp.stream}
Source: ${opp.source}
Confidence: ${(opp.confidence * 100).toFixed(0)}%
Estimated Value: $${opp.estimatedValue.toFixed(2)}
Urgency: ${opp.urgency}

Action Required:
${opp.actionRequired}

Metadata:
${JSON.stringify(opp.metadata, null, 2)}
      `.trim(),
      requestedBy: "revenue-orchestrator",
      skillHint: null,
      requiredCapabilities: this.getCapabilitiesForStream(opp.stream),
      executionMode,
      status: "queued",
      approvalState: autoApprove ? "approved" : "pending",
      approvalReason: autoApprove ? "Auto-approved by revenue orchestrator" : "Pending approval",
      approvedBy: autoApprove ? "revenue-orchestrator" : null,
      approvedAt: autoApprove ? nowIso() : null,
      route: opp.urgency === "critical" ? "critical" : opp.urgency === "high" ? "high" : "standard",
      assignedWorkerId: null,
      budgetCapUsd,
      budgetEstimateUsd: budgetCapUsd * 0.8,
      budgetActualUsd: 0,
      idempotencyKey: `revenue-${opp.id}`,
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      resultSummary: null,
      artifacts: null,
      integrationRefs: null,
      releaseDecision: null,
      startedAt: null,
      completedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    // Create default gates for the task
    const now = nowIso();
    const gates: GateRecord[] = [
      {
        id: randomUUID(),
        taskId,
        gateType: "product",
        status: "pending",
        required: true,
        evidence: createInitialGateEvidence(),
        updatedAt: now
      },
      {
        id: randomUUID(),
        taskId,
        gateType: "engineering",
        status: "pending",
        required: true,
        evidence: createInitialGateEvidence(),
        updatedAt: now
      },
      {
        id: randomUUID(),
        taskId,
        gateType: "qa",
        status: "pending",
        required: true,
        evidence: createInitialGateEvidence(),
        updatedAt: now
      },
      {
        id: randomUUID(),
        taskId,
        gateType: "security",
        status: "pending",
        required: true,
        evidence: createInitialGateEvidence(),
        updatedAt: now
      },
      {
        id: randomUUID(),
        taskId,
        gateType: "release",
        status: "pending",
        required: true,
        evidence: createInitialGateEvidence(),
        updatedAt: now
      }
    ];

    await this.store.createTask(task, gates);

    console.log(`[RevenueOrchestrator] Created task ${taskId} for ${opp.stream} ($${budgetCapUsd.toFixed(2)} budget)`);

    // Notify via Slack if high value
    if (opp.estimatedValue > 1000) {
      await this.notifyHighValueOpportunity(opp, taskId);
    }
  }

  /**
   * Get required capabilities for a revenue stream
   */
  private getCapabilitiesForStream(stream: RevenueStream): string[] {
    const capabilityMap: Record<RevenueStream, string[]> = {
      "lead-generation": ["research", "sales", "hubspot"],
      "document-processing": ["planning", "ocr", "review"],
      "hvac-dispatch": ["dispatch", "scheduling", "sms"],
      "content-creation": ["creative", "writing", "review"],
      "market-research": ["research", "analytics", "brave_search"],
      "sales-outreach": ["sales", "communication", "hubspot"]
    };
    return capabilityMap[stream] || ["planning"];
  }

  /**
   * Call Apex MCP tool
   */
  private async callApexTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithTimeout(
      `${this.config.apexMcpEndpoint}/mcp/tools/${toolName}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params })
      }
    );

    if (!response.ok) {
      throw new Error(`Apex tool ${toolName} failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Notify Slack about high-value opportunities
   */
  private async notifyHighValueOpportunity(opp: Opportunity, taskId: string): Promise<void> {
    try {
      await this.callApexTool("slack_post", {
        channel: "#revenue-opportunities",
        text: `🎯 High-value opportunity detected!

Stream: ${opp.stream}
Value: $${opp.estimatedValue.toFixed(2)}
Confidence: ${(opp.confidence * 100).toFixed(0)}%
Task: ${taskId}

${opp.description}

Action: ${opp.actionRequired}`
      });
    } catch (error) {
      console.error("[RevenueOrchestrator] Slack notification failed:", error);
    }
  }

  /**
   * Get revenue statistics
   */
  getStats(): {
    isRunning: boolean;
    dailyTaskCount: number;
    maxDailyTasks: number;
    enabledStreams: RevenueStream[];
    lastResetDate: string;
  } {
    return {
      isRunning: this.isRunning,
      dailyTaskCount: this.dailyTaskCount,
      maxDailyTasks: this.config.maxDailyTasks,
      enabledStreams: this.config.enabledStreams,
      lastResetDate: this.lastResetDate
    };
  }

  /**
   * Health check for external service connectivity
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    services: {
      apexMcp: { available: boolean; latencyMs?: number; error?: string };
      clearDesk: { available: boolean; latencyMs?: number; error?: string };
      moneyHvac: { available: boolean; latencyMs?: number; error?: string };
    };
  }> {
    const services = {
      apexMcp: { available: false, latencyMs: undefined, error: undefined } as { available: boolean; latencyMs?: number; error?: string },
      clearDesk: { available: false, latencyMs: undefined, error: undefined } as { available: boolean; latencyMs?: number; error?: string },
      moneyHvac: { available: false, latencyMs: undefined, error: undefined } as { available: boolean; latencyMs?: number; error?: string }
    };

    // Check Apex MCP
    try {
      const start = Date.now();
      await fetchWithTimeout(`${this.config.apexMcpEndpoint}/health`, { method: "GET" }, 5000);
      services.apexMcp = { available: true, latencyMs: Date.now() - start };
    } catch (error) {
      services.apexMcp = { available: false, error: error instanceof Error ? error.message : "Unknown error" };
    }

    // Check ClearDesk
    try {
      const start = Date.now();
      await fetchWithTimeout(`${this.config.clearDeskEndpoint}/health`, { method: "GET" }, 5000);
      services.clearDesk = { available: true, latencyMs: Date.now() - start };
    } catch (error) {
      services.clearDesk = { available: false, error: error instanceof Error ? error.message : "Unknown error" };
    }

    // Check Money HVAC
    try {
      const start = Date.now();
      await fetchWithTimeout(`${this.config.moneyEndpoint}/health`, { method: "GET" }, 5000);
      services.moneyHvac = { available: true, latencyMs: Date.now() - start };
    } catch (error) {
      services.moneyHvac = { available: false, error: error instanceof Error ? error.message : "Unknown error" };
    }

    const healthy = services.apexMcp.available || services.clearDesk.available || services.moneyHvac.available;

    return { healthy, services };
  }
}

// RevenueOrchestrator class is already exported above
