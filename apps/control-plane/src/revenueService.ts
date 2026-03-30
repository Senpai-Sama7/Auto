import type { TaskStore } from "@ultimate-system/core";
import type { RevenueConfig, RevenueStream, Opportunity } from "@ultimate-system/core";

import {
  revenueDiscoveryInterval,
  revenueMaxDailyTasks,
  revenueBudgetPerTask,
  apexMcpEndpoint,
  moneyEndpoint,
  clearDeskEndpoint
} from "./env.js";

// Type-only import for the RevenueOrchestrator class
import type { RevenueOrchestrator } from "@ultimate-system/core";

// Singleton state
let initializationPromise: Promise<RevenueOrchestrator> | null = null;
let orchestratorInstance: RevenueOrchestrator | null = null;

export async function initRevenueOrchestrator(store: TaskStore): Promise<RevenueOrchestrator> {
  // If already initialized, return existing instance
  if (orchestratorInstance) {
    return orchestratorInstance;
  }
  
  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // Start initialization
  initializationPromise = (async (): Promise<RevenueOrchestrator> => {
    try {
      const mod = await import("@ultimate-system/core");
      const RevenueOrchestratorCtor = mod.RevenueOrchestrator;
      
      const config: Partial<RevenueConfig> = {
        enabledStreams: [
          "lead-generation" as RevenueStream,
          "document-processing" as RevenueStream,
          "market-research" as RevenueStream,
          "sales-outreach" as RevenueStream
        ],
        discoveryIntervalMinutes: revenueDiscoveryInterval,
        maxDailyTasks: revenueMaxDailyTasks,
        budgetPerTask: revenueBudgetPerTask,
        apexMcpEndpoint,
        moneyEndpoint,
        clearDeskEndpoint
      };
      
      orchestratorInstance = new RevenueOrchestratorCtor(store, config);
      return orchestratorInstance;
    } catch (error) {
      // Reset promise so next call can retry
      initializationPromise = null;
      throw error;
    }
  })();
  
  return initializationPromise;
}

export function getRevenueOrchestrator(): RevenueOrchestrator | null {
  return orchestratorInstance;
}

export function stopRevenueOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop();
    orchestratorInstance = null;
    initializationPromise = null;
  }
}

export type { RevenueConfig, RevenueStream, Opportunity };
