/**
 * Browser Automation Tools - Puppeteer-based web automation
 * 
 * Capabilities I DON'T have:
 * - Render JavaScript-heavy websites
 * - Take screenshots of rendered pages
 * - Click elements and fill forms
 * - Wait for dynamic content
 * - Evaluate JavaScript in browser context
 * - Handle cookies/sessions
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DEFAULT_VIEWPORT, BROWSER_TIMEOUT } from "../constants.js";
import type { PageInfo } from "../types.js";

// Global browser instance
let browser: Browser | null = null;
let currentPage: Page | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browser;
}

async function getPage(): Promise<Page> {
  if (!currentPage) {
    const b = await getBrowser();
    currentPage = await b.newPage();
    await currentPage.setViewport(DEFAULT_VIEWPORT);
  }
  return currentPage;
}

// Input schemas
const BrowserNavigateInputSchema = z.object({
  url: z.string().url().describe("URL to navigate to"),
  wait_until: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
    .default("networkidle2")
    .describe("When to consider navigation complete"),
  timeout: z.number().int().min(1000).max(120000).default(BROWSER_TIMEOUT)
    .describe("Navigation timeout in milliseconds"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const BrowserScreenshotInputSchema = z.object({
  selector: z.string().optional().describe("CSS selector to screenshot specific element (optional)"),
  full_page: z.boolean().default(false).describe("Capture full scrollable page"),
  width: z.number().int().min(320).max(3840).optional().describe("Viewport width"),
  height: z.number().int().min(240).max(2160).optional().describe("Viewport height"),
  save_path: z.string().optional().describe("Path to save screenshot (default: returns base64)"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const BrowserClickInputSchema = z.object({
  selector: z.string().min(1).describe("CSS selector of element to click"),
  wait_for_navigation: z.boolean().default(false).describe("Wait for navigation after click"),
  timeout: z.number().int().default(5000).describe("Timeout for click"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const BrowserFillInputSchema = z.object({
  selector: z.string().min(1).describe("CSS selector of input element"),
  value: z.string().describe("Value to fill in"),
  clear_first: z.boolean().default(true).describe("Clear existing value first"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const BrowserEvaluateInputSchema = z.object({
  script: z.string().min(1).describe("JavaScript code to execute in browser context"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const BrowserGetContentInputSchema = z.object({
  selector: z.string().optional().describe("CSS selector to extract (default: body)"),
  include_html: z.boolean().default(false).describe("Return HTML instead of text"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Type definitions
type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;
type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotInputSchema>;
type BrowserClickInput = z.infer<typeof BrowserClickInputSchema>;
type BrowserFillInput = z.infer<typeof BrowserFillInputSchema>;
type BrowserEvaluateInput = z.infer<typeof BrowserEvaluateInputSchema>;
type BrowserGetContentInput = z.infer<typeof BrowserGetContentInputSchema>;

export function registerBrowserTools(server: McpServer): void {

  // Navigate to URL
  server.registerTool(
    "browser_navigate",
    {
      title: "Navigate Browser to URL",
      description: `Navigate the browser to a URL and wait for page load.

This tool launches a headless browser (if not running) and navigates to the specified URL,
waiting for JavaScript-rendered content. This is something I CANNOT do natively.

Args:
  - url (string): URL to navigate to (required)
  - wait_until ('load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'): When to consider page loaded (default: networkidle2)
  - timeout (number): Navigation timeout in ms (default: 30000)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Page title, URL, and load status.

Examples:
  - Load React app: url="https://example.com/app", wait_until="networkidle0"
  - Quick load: url="https://example.com", wait_until="domcontentloaded"

Notes:
  - Browser state persists between calls
  - Supports JavaScript-heavy SPAs
  - Handles cookies and sessions`,
      inputSchema: BrowserNavigateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: BrowserNavigateInput) => {
      try {
        const page = await getPage();
        
        const response = await page.goto(params.url, {
          waitUntil: params.wait_until,
          timeout: params.timeout
        });

        const info: PageInfo = {
          url: page.url(),
          title: await page.title(),
          viewport: page.viewport() || DEFAULT_VIEWPORT
        };

        const result = {
          success: true,
          ...info,
          status_code: response?.status(),
          content_type: response?.headers()['content-type']
        };

        const text = `# Browser Navigation

**URL**: ${result.url}
**Title**: ${result.title}
**Status**: ${result.status_code || 'N/A'}
**Viewport**: ${result.viewport.width}x${result.viewport.height}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Take screenshot
  server.registerTool(
    "browser_screenshot",
    {
      title: "Take Browser Screenshot",
      description: `Capture a screenshot of the current page or a specific element.

This tool can screenshot JavaScript-rendered content that I CANNOT see in static HTML.

Args:
  - selector (string): CSS selector for specific element (optional, captures full page if omitted)
  - full_page (boolean): Capture entire scrollable page (default: false)
  - width (number): Viewport width (default: 1280)
  - height (number): Viewport height (default: 720)
  - save_path (string): File path to save (optional, returns base64 if not provided)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Screenshot as base64 data URL or file path.

Examples:
  - Full page: full_page=true
  - Element: selector="#chart"
  - Specific size: width=1920, height=1080
  - Save to file: save_path="/tmp/screenshot.png"`,
      inputSchema: BrowserScreenshotInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: BrowserScreenshotInput) => {
      try {
        const page = await getPage();

        // Update viewport if specified
        if (params.width && params.height) {
          await page.setViewport({ width: params.width, height: params.height });
        }

        let screenshot: Buffer;

        if (params.selector) {
          const element = await page.waitForSelector(params.selector, { timeout: 5000 });
          if (!element) {
            return { content: [{ type: "text", text: `Error: Element "${params.selector}" not found` }] };
          }
          screenshot = await element.screenshot({ encoding: 'binary' }) as Buffer;
        } else {
          screenshot = await page.screenshot({ 
            fullPage: params.full_page,
            encoding: 'binary'
          }) as Buffer;
        }

        if (params.save_path) {
          const fs = await import('fs/promises');
          await fs.writeFile(params.save_path, screenshot);
          
          const result = {
            saved: true,
            path: params.save_path,
            size_bytes: screenshot.length
          };

          return {
            content: [{ type: "text", text: `Screenshot saved to ${result.path} (${result.size_bytes} bytes)` }],
            structuredContent: result
          };
        } else {
          // Return base64
          const base64 = screenshot.toString('base64');
          const result = {
            saved: false,
            base64: `data:image/png;base64,${base64}`,
            size_bytes: screenshot.length
          };

          const text = `# Screenshot

**Size**: ${result.size_bytes} bytes
**Format**: PNG

![Screenshot](${result.base64.substring(0, 100)}...)`;

          return {
            content: [{ type: "text", text }],
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

  // Click element
  server.registerTool(
    "browser_click",
    {
      title: "Click Browser Element",
      description: `Click on an element in the browser.

Simulates real user clicks, including on JavaScript-powered buttons.

Args:
  - selector (string): CSS selector of element to click (required)
  - wait_for_navigation (boolean): Wait for page navigation (default: false)
  - timeout (number): Click timeout in ms (default: 5000)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Click confirmation and new page info if navigation occurred.

Examples:
  - Click button: selector="button.submit"
  - Click link: selector="a.next", wait_for_navigation=true
  - Click menu: selector="#menu-toggle"`,
      inputSchema: BrowserClickInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: BrowserClickInput) => {
      try {
        const page = await getPage();
        
        await page.waitForSelector(params.selector, { timeout: params.timeout });
        
        if (params.wait_for_navigation) {
          await Promise.all([
            page.waitForNavigation({ timeout: params.timeout }),
            page.click(params.selector)
          ]);
        } else {
          await page.click(params.selector);
        }

        const result = {
          clicked: true,
          selector: params.selector,
          url: page.url(),
          title: await page.title()
        };

        const text = `# Click Executed

**Selector**: ${result.selector}
**Current URL**: ${result.url}
**Page Title**: ${result.title}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Fill input
  server.registerTool(
    "browser_fill",
    {
      title: "Fill Browser Input",
      description: `Fill in an input field or textarea.

Args:
  - selector (string): CSS selector of input element (required)
  - value (string): Value to fill in (required)
  - clear_first (boolean): Clear existing value first (default: true)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Confirmation of fill operation.

Examples:
  - Fill form: selector="#email", value="user@example.com"
  - Type search: selector="input[name='q']", value="puppeteer"
  - Append text: selector="#notes", value=" Additional note", clear_first=false`,
      inputSchema: BrowserFillInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: BrowserFillInput) => {
      try {
        const page = await getPage();
        
        await page.waitForSelector(params.selector, { timeout: 5000 });
        
        if (params.clear_first) {
          await page.$eval(params.selector, el => ((el as unknown) as {value: string}).value = '');
        }
        
        await page.type(params.selector, params.value);

        const result = {
          filled: true,
          selector: params.selector,
          value: params.value.substring(0, 50) + (params.value.length > 50 ? '...' : '')
        };

        return {
          content: [{ type: "text", text: `Filled "${result.selector}" with "${result.value}"` }],
          structuredContent: result
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Evaluate JavaScript
  server.registerTool(
    "browser_evaluate",
    {
      title: "Evaluate JavaScript in Browser",
      description: `Execute JavaScript code in the browser context.

This can access the DOM, global variables, and browser APIs - things I CANNOT do.

Args:
  - script (string): JavaScript code to execute (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Result of JavaScript execution (must be JSON-serializable).

Examples:
  - Get title: script="document.title"
  - Get data: script="JSON.stringify(window.__INITIAL_STATE__)"
  - Check element: script="document.querySelector('.modal') !== null"
  - Get computed style: script="getComputedStyle(document.body).backgroundColor"

Notes:
  - Return value must be JSON-serializable
  - Can access document, window, and page globals
  - Useful for extracting data from SPAs`,
      inputSchema: BrowserEvaluateInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: BrowserEvaluateInput) => {
      try {
        const page = await getPage();
        
        const result = await page.evaluate((script) => {
          // eslint-disable-next-line no-eval
          return eval(script);
        }, params.script);

        const output = {
          executed: true,
          result: result,
          type: typeof result
        };

        const text = `# JavaScript Execution

**Script**:
\`\`\`javascript
${params.script}
\`\`\`

**Result Type**: ${output.type}
**Result**: ${JSON.stringify(result, null, 2)}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: output as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Get page content
  server.registerTool(
    "browser_get_content",
    {
      title: "Get Page Content",
      description: `Extract text or HTML content from the page.

Args:
  - selector (string): CSS selector to extract (default: body)
  - include_html (boolean): Return HTML instead of text (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Text or HTML content from the page.

Examples:
  - Get article: selector="article"
  - Get full HTML: include_html=true
  - Get specific div: selector="#content"`,
      inputSchema: BrowserGetContentInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: BrowserGetContentInput) => {
      try {
        const page = await getPage();
        
        const selector = params.selector || 'body';
        await page.waitForSelector(selector, { timeout: 5000 });
        
        let content: string;
        
        if (params.include_html) {
          content = await page.$eval(selector, el => el.outerHTML);
        } else {
          content = await page.$eval(selector, el => el.textContent || '');
        }

        // Truncate if too long
        const maxLength = 10000;
        const truncated = content.length > maxLength;
        const displayContent = truncated ? content.substring(0, maxLength) + '...' : content;

        const result = {
          selector,
          html: params.include_html,
          length: content.length,
          truncated,
          content: displayContent
        };

        const format = params.include_html ? 'html' : 'text';
        const text = `# Page Content (${format})

**Selector**: ${result.selector}
**Length**: ${result.length} characters${result.truncated ? ' (truncated)' : ''}

\`\`\`${format}
${displayContent}
\`\`\``;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );
}

// Cleanup on exit
process.on('exit', async () => {
  if (browser) await browser.close();
});
