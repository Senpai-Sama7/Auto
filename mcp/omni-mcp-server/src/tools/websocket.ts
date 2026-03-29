/**
 * WebSocket Client Tools - Real-time bidirectional communication
 * 
 * Capabilities I DON'T have:
 * - Connect to WebSocket servers
 * - Receive real-time streaming data
 * - Send messages to WebSocket endpoints
 * - Maintain persistent connections
 */

import WebSocket from "ws";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, WS_TIMEOUT } from "../constants.js";

// Input schemas
const WSConnectInputSchema = z.object({
  url: z.string().url().describe("WebSocket URL (ws:// or wss://)"),
  headers: z.record(z.string()).optional().describe("Connection headers"),
  protocols: z.array(z.string()).optional().describe("WebSocket subprotocols"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const WSSendInputSchema = z.object({
  connection_id: z.string().describe("Connection ID from ws_connect"),
  message: z.string().describe("Message to send"),
  wait_for_response: z.boolean().default(false).describe("Wait for response message"),
  timeout: z.number().int().default(5000).describe("Response timeout in ms"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const WSReceiveInputSchema = z.object({
  connection_id: z.string().describe("Connection ID from ws_connect"),
  timeout: z.number().int().default(10000).describe("How long to wait for messages"),
  max_messages: z.number().int().min(1).max(100).default(10).describe("Max messages to collect"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const WSCloseInputSchema = z.object({
  connection_id: z.string().describe("Connection ID to close"),
  code: z.number().int().optional().describe("Close code"),
  reason: z.string().optional().describe("Close reason"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Active connections map
const connections = new Map<string, WebSocket>();
const messageHistory = new Map<string, Array<{type: 'sent' | 'received', data: string, time: string}>>();

function generateId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Type definitions
type WSConnectInput = z.infer<typeof WSConnectInputSchema>;
type WSSendInput = z.infer<typeof WSSendInputSchema>;
type WSReceiveInput = z.infer<typeof WSReceiveInputSchema>;
type WSCloseInput = z.infer<typeof WSCloseInputSchema>;

export function registerWebSocketTools(server: McpServer): void {

  // Connect to WebSocket
  server.registerTool(
    "ws_connect",
    {
      title: "Connect to WebSocket Server",
      description: `Establish a WebSocket connection to a server.

This creates a PERSISTENT connection for real-time bidirectional communication - 
something I CANNOT do with my one-shot HTTP requests.

Args:
  - url (string): WebSocket URL (ws:// or wss://) (required)
  - headers (object): Connection headers (optional)
  - protocols (array): WebSocket subprotocols (optional)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Connection ID for use with other ws_* tools.

Examples:
  - Basic: url="wss://echo.websocket.org"
  - With protocol: url="wss://api.example.com/ws", protocols=["json"]
  - With headers: url="wss://api.example.com/ws", headers={"Authorization": "Bearer token"}

Notes:
  - Connection persists until closed with ws_close
  - Save the connection_id for subsequent operations
  - Messages received are stored in history`,
      inputSchema: WSConnectInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: WSConnectInput) => {
      return new Promise((resolve) => {
        const id = generateId();
        
        try {
          const ws = new WebSocket(params.url, params.protocols, {
            headers: params.headers,
            timeout: WS_TIMEOUT
          });

          ws.on('open', () => {
            connections.set(id, ws);
            messageHistory.set(id, []);

            const result = {
              connection_id: id,
              url: params.url,
              status: 'connected',
              protocol: ws.protocol || 'none'
            };

            resolve({
              content: [{ type: "text", text: `✓ WebSocket connected\n**ID**: ${id}\n**URL**: ${params.url}\n**Protocol**: ${result.protocol}` }],
              structuredContent: result
            });
          });

          ws.on('message', (data) => {
            const history = messageHistory.get(id) || [];
            history.push({
              type: 'received',
              data: data.toString(),
              time: new Date().toISOString()
            });
            messageHistory.set(id, history);
          });

          ws.on('error', (error) => {
            resolve({
              content: [{ type: "text", text: `Error: ${error.message}` }]
            });
          });

          ws.on('close', () => {
            connections.delete(id);
          });

        } catch (error) {
          resolve({
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
          });
        }
      });
    }
  );

  // Send message
  server.registerTool(
    "ws_send",
    {
      title: "Send WebSocket Message",
      description: `Send a message through an established WebSocket connection.

Args:
  - connection_id (string): Connection ID from ws_connect (required)
  - message (string): Message to send (required)
  - wait_for_response (boolean): Wait for response (default: false)
  - timeout (number): Response timeout in ms (default: 5000)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Send confirmation and optionally received response.

Examples:
  - Simple send: connection_id="ws_123", message="Hello"
  - With response: connection_id="ws_123", message="ping", wait_for_response=true`,
      inputSchema: WSSendInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: WSSendInput) => {
      const ws = connections.get(params.connection_id);
      
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return {
          content: [{ type: "text", text: `Error: Connection "${params.connection_id}" not found or closed` }]
        };
      }

      // Record sent message
      const history = messageHistory.get(params.connection_id) || [];
      const sentTime = new Date().toISOString();
      history.push({
        type: 'sent',
        data: params.message,
        time: sentTime
      });

      // Send message
      ws.send(params.message);

      if (params.wait_for_response) {
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const currentHistory = messageHistory.get(params.connection_id) || [];
            const newMessages = currentHistory.filter(h => 
              h.type === 'received' && new Date(h.time) > new Date(sentTime)
            );

            if (newMessages.length > 0) {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              
              const response = newMessages[0];
              resolve({
                content: [{ type: "text", text: `✓ Message sent\n**Sent**: ${params.message}\n\n**Response**: ${response.data}` }],
                structuredContent: { sent: true, response: response.data }
              });
            }
          }, 100);

          const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve({
              content: [{ type: "text", text: `✓ Message sent (no response within ${params.timeout}ms)\n**Sent**: ${params.message}` }],
              structuredContent: { sent: true, response: null }
            });
          }, params.timeout);
        });
      } else {
        messageHistory.set(params.connection_id, history);
        
        return {
          content: [{ type: "text", text: `✓ Message sent\n**Message**: ${params.message}` }],
          structuredContent: { sent: true }
        };
      }
    }
  );

  // Receive messages
  server.registerTool(
    "ws_receive",
    {
      title: "Receive WebSocket Messages",
      description: `Collect messages from a WebSocket connection.

Args:
  - connection_id (string): Connection ID from ws_connect (required)
  - timeout (number): How long to wait for messages in ms (default: 10000)
  - max_messages (number): Maximum messages to collect (default: 10)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Collected messages received during the timeout period.

Examples:
  - Collect 10s: connection_id="ws_123", timeout=10000
  - Quick poll: connection_id="ws_123", timeout=1000, max_messages=5`,
      inputSchema: WSReceiveInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: WSReceiveInput) => {
      const ws = connections.get(params.connection_id);
      
      if (!ws) {
        return {
          content: [{ type: "text", text: `Error: Connection "${params.connection_id}" not found` }]
        };
      }

      const startHistory = [...(messageHistory.get(params.connection_id) || [])];
      const startTime = Date.now();

      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const currentHistory = messageHistory.get(params.connection_id) || [];
          const newMessages = currentHistory.filter(h => 
            !startHistory.includes(h) && h.type === 'received'
          );

          const elapsed = Date.now() - startTime;

          if (newMessages.length >= params.max_messages || elapsed >= params.timeout) {
            clearInterval(checkInterval);

            const result = {
              waited_ms: elapsed,
              messages_received: newMessages.length,
              messages: newMessages.map(m => ({
                data: m.data,
                time: m.time
              }))
            };

            const text = `# WebSocket Messages

**Waited**: ${result.waited_ms}ms
**Received**: ${result.messages_received} messages

${result.messages.map(m => `---\n**${m.time.split('T')[1].split('.')[0]}**: ${m.data.substring(0, 500)}${m.data.length > 500 ? '...' : ''}`).join('\n') || '*(No new messages)*'}`;

            resolve({
              content: [{ type: "text", text }],
              structuredContent: result as { [key: string]: unknown }
            });
          }
        }, 100);
      });
    }
  );

  // Close connection
  server.registerTool(
    "ws_close",
    {
      title: "Close WebSocket Connection",
      description: `Close an established WebSocket connection.

Args:
  - connection_id (string): Connection ID to close (required)
  - code (number): Close code (optional, default: 1000)
  - reason (string): Close reason (optional)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Close confirmation.

Examples:
  - Normal close: connection_id="ws_123"
  - With reason: connection_id="ws_123", code=1000, reason="Done"`,
      inputSchema: WSCloseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: WSCloseInput) => {
      const ws = connections.get(params.connection_id);
      
      if (!ws) {
        return {
          content: [{ type: "text", text: `Connection "${params.connection_id}" not found or already closed` }]
        };
      }

      ws.close(params.code, params.reason);
      connections.delete(params.connection_id);
      messageHistory.delete(params.connection_id);

      return {
        content: [{ type: "text", text: `✓ WebSocket connection "${params.connection_id}" closed` }],
        structuredContent: { closed: true, connection_id: params.connection_id }
      };
    }
  );
}
