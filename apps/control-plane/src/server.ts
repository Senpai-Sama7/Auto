import { createApp } from "./app.js";
import { apiPort, databasePath } from "./env.js";
import { initRevenueOrchestrator } from "./revenueService.js";

const AUTO_START_REVENUE = process.env.REVENUE_AUTO_START === "true";
const REVENUE_ENABLED = process.env.REVENUE_DISABLED !== "true";

async function bootstrap() {
  console.log("[Bootstrap] Starting control-plane...");
  
  const app = await createApp(databasePath, { 
    enablePaperclip: process.env.ENABLE_PAPERCLIP !== "false" 
  });

  // Initialize revenue orchestrator if enabled
  if (REVENUE_ENABLED) {
    try {
      console.log("[Bootstrap] Initializing revenue orchestrator...");
      
      // Get the store from the app context - we need to import it
      const { SqlitePlatformStore } = await import("@ultimate-system/sqlite-store");
      const store = new SqlitePlatformStore(databasePath);
      await store.seedDefaults(null);
      
      const orchestrator = await initRevenueOrchestrator(store);
      
      if (AUTO_START_REVENUE) {
        console.log("[Bootstrap] Auto-starting revenue orchestrator...");
        await orchestrator.start();
        console.log("[Bootstrap] Revenue orchestrator started successfully");
      } else {
        console.log("[Bootstrap] Revenue orchestrator initialized (not auto-started)");
      }
    } catch (error) {
      console.error("[Bootstrap] Failed to initialize revenue orchestrator:", error);
      // Continue without revenue orchestrator - app should still work
    }
  }

  app.listen(apiPort, () => {
    console.log(`[Bootstrap] control-plane listening on http://localhost:${apiPort}`);
    console.log(`[Bootstrap] Revenue orchestrator: ${REVENUE_ENABLED ? 'enabled' : 'disabled'}`);
    console.log(`[Bootstrap] Revenue auto-start: ${AUTO_START_REVENUE ? 'enabled' : 'disabled'}`);
  });
}

bootstrap().catch((error) => {
  console.error("[Bootstrap] Fatal error during startup:", error);
  process.exit(1);
});