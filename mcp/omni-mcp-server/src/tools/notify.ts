/**
 * Notification Tools - Desktop and system notifications
 * 
 * Capabilities I DON'T have:
 * - Show desktop notifications
 * - Play system sounds
 * - Send notifications to notification centers
 * - Cross-platform notification support
 */

import notifier from "node-notifier";
import * as path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat } from "../constants.js";

// Input schemas
const NotifyInputSchema = z.object({
  title: z.string().min(1).describe("Notification title"),
  message: z.string().min(1).describe("Notification message body"),
  sound: z.boolean().default(true).describe("Play notification sound"),
  wait: z.boolean().default(false).describe("Wait for user action (click/dismiss)"),
  timeout: z.number().int().default(5).describe("Notification timeout in seconds"),
  open: z.string().optional().describe("URL or file to open on click"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const BeepInputSchema = z.object({
  count: z.number().int().min(1).max(10).default(1).describe("Number of beeps"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Type definitions
type NotifyInput = z.infer<typeof NotifyInputSchema>;
type BeepInput = z.infer<typeof BeepInputSchema>;

export function registerNotificationTools(server: McpServer): void {

  // Desktop notification
  server.registerTool(
    "notify_desktop",
    {
      title: "Show Desktop Notification",
      description: `Display a native desktop notification.

This shows a REAL notification in the system notification center - 
something I CANNOT do (I can only output text).

Args:
  - title (string): Notification title (required)
  - message (string): Notification body text (required)
  - sound (boolean): Play notification sound (default: true)
  - wait (boolean): Wait for user interaction (default: false)
  - timeout (number): Auto-dismiss timeout in seconds (default: 5)
  - open (string): URL/file to open when clicked (optional)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Notification status and user interaction (if waited).

Examples:
  - Basic: title="Build Complete", message="Your project is ready"
  - With link: title="New Email", message="From: boss@company.com", open="https://gmail.com"
  - Persistent: title="Action Required", message="Click to continue", wait=true

Platform Support:
  - macOS: Notification Center
  - Windows: Toast notifications
  - Linux: notify-send/libnotify

Note:
  - May not work in headless/SSH environments
  - Requires graphical session`,
      inputSchema: NotifyInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: NotifyInput) => {
      try {
        const notifyOptions = {
          title: params.title,
          message: params.message,
          sound: params.sound,
          wait: params.wait,
          timeout: params.timeout,
          open: params.open
        } as notifier.Notification;

        if (params.wait) {
          return new Promise((resolve) => {
            notifier.notify(notifyOptions, (err, response, metadata) => {
              if (err) {
                resolve({
                  content: [{ type: "text", text: `Error: ${err.message}` }],
                  structuredContent: { error: err.message }
                });
                return;
              }

              const result = {
                displayed: true,
                response,
                metadata: {
                  activationType: metadata?.activationType,
                  activationAt: metadata?.activationAt
                }
              };

              resolve({
                content: [{ type: "text", text: `✓ Notification displayed and ${response}\n**Title**: ${params.title}\n**Action**: ${metadata?.activationType || 'dismissed'}` }],
                structuredContent: result
              });
            });
          });
        } else {
          notifier.notify(notifyOptions);

          const result = {
            displayed: true,
            title: params.title,
            timeout: params.timeout
          };

          return {
            content: [{ type: "text", text: `✓ Notification displayed (${params.timeout}s timeout)\n**Title**: ${params.title}\n**Message**: ${params.message}` }],
            structuredContent: result
          };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // System beep
  server.registerTool(
    "notify_beep",
    {
      title: "Play System Beep",
      description: `Play the system beep sound.

Args:
  - count (number): Number of beeps (default: 1, max: 10)
  - response_format ('markdown' | 'json'): Output format

Examples:
  - Single beep: (no args)
  - Alert: count=3

Note:
  - May not work in headless environments
  - Volume controlled by system`,
      inputSchema: BeepInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: BeepInput) => {
      try {
        for (let i = 0; i < params.count; i++) {
          notifier.notify({
            title: '',
            message: '',
            sound: true,
            timeout: 1
          });
          if (i < params.count - 1) {
            await new Promise(r => setTimeout(r, 200));
          }
        }

        return {
          content: [{ type: "text", text: `✓ Played ${params.count} beep(s)` }],
          structuredContent: { beeps: params.count }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );
}
