import { createApp } from "./app.js";
import { apiPort, databasePath } from "./env.js";

const app = await createApp(databasePath, { enablePaperclip: process.env.ENABLE_PAPERCLIP !== "false" });

app.listen(apiPort, () => {
  console.log(`control-plane listening on http://localhost:${apiPort}`);
});
