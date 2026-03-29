/**
 * Database Tools - Query SQLite and other databases
 */

import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";
import { formatResponse, codeBlock } from "../services/formatters.js";
import { handleDbError, handleFsError } from "../services/errors.js";

// Input schemas
const QuerySqliteInputSchema = z.object({
  db_path: z.string()
    .min(1, "Database path is required")
    .describe("Path to the SQLite database file"),
  query: z.string()
    .min(1, "Query is required")
    .describe("SQL query to execute (SELECT, INSERT, UPDATE, DELETE, etc.)"),
  params: z.array(z.union([z.string(), z.number(), z.null()]))
    .optional()
    .describe("Query parameters for prepared statements"),
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("Maximum rows to return for SELECT queries (default: 20)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const ListTablesInputSchema = z.object({
  db_path: z.string()
    .min(1, "Database path is required")
    .describe("Path to the SQLite database file"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const GetTableSchemaInputSchema = z.object({
  db_path: z.string()
    .min(1, "Database path is required")
    .describe("Path to the SQLite database file"),
  table: z.string()
    .min(1, "Table name is required")
    .describe("Name of the table to inspect"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Type definitions
type QuerySqliteInput = z.infer<typeof QuerySqliteInputSchema>;
type ListTablesInput = z.infer<typeof ListTablesInputSchema>;
type GetTableSchemaInput = z.infer<typeof GetTableSchemaInputSchema>;

// Dynamic import for better-sqlite3 to handle potential errors
async function loadSqlite() {
  try {
    const { default: Database } = await import("better-sqlite3");
    return Database;
  } catch (error) {
    throw new Error("better-sqlite3 is not installed. Run: npm install better-sqlite3");
  }
}

/**
 * Register all database tools
 */
export function registerDatabaseTools(server: McpServer): void {

  // Query SQLite database
  server.registerTool(
    "db_query_sqlite",
    {
      title: "Query SQLite Database",
      description: `Execute SQL queries on a SQLite database.

This tool supports SELECT, INSERT, UPDATE, DELETE, and other SQL statements.
For SELECT queries, results are limited by the 'limit' parameter.

Args:
  - db_path (string): Path to SQLite database file (required)
  - query (string): SQL query to execute (required)
  - params (array): Query parameters for prepared statements (optional)
  - limit (number): Max rows for SELECT (default: 20, max: 100)
  - response_format ('markdown' | 'json'): Output format

Returns:
  For SELECT: Query results with column names and rows.
  For INSERT/UPDATE/DELETE: Affected row count.

Examples:
  - Select all: db_path="data.db", query="SELECT * FROM users LIMIT 10"
  - With params: db_path="data.db", query="SELECT * FROM users WHERE id = ?", params=[42]
  - Insert: db_path="data.db", query="INSERT INTO users (name) VALUES (?)", params=["John"]
  - Update: db_path="data.db", query="UPDATE users SET active = 1 WHERE id = ?", params=[42]

Safety:
  - Uses prepared statements to prevent SQL injection
  - File path is validated

Error Handling:
  - Returns error if database file not found
  - Returns error for SQL syntax errors
  - Returns error if table does not exist`,
      inputSchema: QuerySqliteInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: QuerySqliteInput) => {
      let db: any = null;
      try {
        const resolvedPath = path.resolve(params.db_path);
        
        // Check if file exists
        try {
          await fs.access(resolvedPath);
        } catch {
          return { content: [{ type: "text", text: `Error: Database file not found: "${params.db_path}"` }] };
        }

        const Database = await loadSqlite();
        db = new Database(resolvedPath);

        const query = params.query.trim();
        const isSelect = query.match(/^\s*SELECT/i);

        if (isSelect) {
          // For SELECT queries, apply limit if not present
          let limitedQuery = query;
          if (!query.match(/\bLIMIT\s+\d+/i)) {
            limitedQuery = `${query} LIMIT ${params.limit}`;
          }

          const stmt = db.prepare(limitedQuery);
          const rows = stmt.all(...(params.params || []));

          const result = {
            query: limitedQuery,
            row_count: rows.length,
            columns: rows.length > 0 ? Object.keys(rows[0]) : [],
            rows: rows
          };

          const formatMarkdown = (data: typeof result) => {
            const lines: string[] = [
              `# SQLite Query Results`,
              "",
              `**Database**: ${resolvedPath}`,
              `**Query**: ${codeBlock(data.query, "sql")}`,
              `**Rows**: ${data.row_count}`,
              ""
            ];

            if (data.rows.length === 0) {
              lines.push("*(No rows returned)*");
            } else {
              // Create markdown table
              lines.push("| " + data.columns.join(" | ") + " |");
              lines.push("| " + data.columns.map(() => "---").join(" | ") + " |");
              
              for (const row of data.rows) {
                const values = data.columns.map(col => {
                  const val = row[col];
                  if (val === null) return "NULL";
                  if (typeof val === "object") return JSON.stringify(val);
                  return String(val).replace(/\|/g, "\\|").substring(0, 100);
                });
                lines.push("| " + values.join(" | ") + " |");
              }
            }

            return lines.join("\n");
          };

          const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

          return {
            content: [{ type: "text", text }],
            structuredContent
          };
        } else {
          // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
          const stmt = db.prepare(query);
          const result = stmt.run(...(params.params || []));

          const response = {
            query,
            changes: result.changes,
            last_insert_rowid: result.lastInsertRowid
          };

          const text = `# SQLite Query Executed

**Database**: ${resolvedPath}
**Query**: ${codeBlock(query, "sql")}
**Rows affected**: ${response.changes}${response.last_insert_rowid ? `\n**Last insert ID**: ${response.last_insert_rowid}` : ""}`;

          return {
            content: [{ type: "text", text }],
            structuredContent: response
          };
        }
      } catch (error) {
        return { content: [{ type: "text", text: handleDbError(error, params.query) }] };
      } finally {
        if (db) {
          try { db.close(); } catch {}
        }
      }
    }
  );

  // List tables
  server.registerTool(
    "db_list_tables",
    {
      title: "List SQLite Tables",
      description: `List all tables in a SQLite database.

Args:
  - db_path (string): Path to SQLite database file
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of table names with row counts.

Examples:
  - List tables: db_path="myapp.db"

Error Handling:
  - Returns error if database file not found
  - Returns error if file is not a valid SQLite database`,
      inputSchema: ListTablesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: ListTablesInput) => {
      let db: any = null;
      try {
        const resolvedPath = path.resolve(params.db_path);
        
        try {
          await fs.access(resolvedPath);
        } catch {
          return { content: [{ type: "text", text: `Error: Database file not found: "${params.db_path}"` }] };
        }

        const Database = await loadSqlite();
        db = new Database(resolvedPath);

        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
        
        // Get row counts for each table
        const tableInfo = [];
        for (const { name } of tables) {
          try {
            const count = db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get();
            tableInfo.push({ name, row_count: count.count });
          } catch {
            tableInfo.push({ name, row_count: null });
          }
        }

        const result = {
          database: resolvedPath,
          table_count: tableInfo.length,
          tables: tableInfo
        };

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [
            `# Database Tables: ${path.basename(data.database)}`,
            "",
            `**Total Tables**: ${data.table_count}`,
            "",
            "| Table | Row Count |",
            "|-------|-----------|"
          ];

          for (const table of data.tables) {
            const count = table.row_count !== null ? table.row_count.toLocaleString() : "N/A";
            lines.push(`| ${table.name} | ${count} |`);
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleDbError(error) }] };
      } finally {
        if (db) {
          try { db.close(); } catch {}
        }
      }
    }
  );

  // Get table schema
  server.registerTool(
    "db_get_table_schema",
    {
      title: "Get SQLite Table Schema",
      description: `Get the schema (columns, types, constraints) of a SQLite table.

Args:
  - db_path (string): Path to SQLite database file
  - table (string): Table name to inspect
  - response_format ('markdown' | 'json'): Output format

Returns:
  Table schema with column names, types, defaults, and constraints.

Examples:
  - Get schema: db_path="myapp.db", table="users"

Error Handling:
  - Returns error if table does not exist
  - Returns error if database file not found`,
      inputSchema: GetTableSchemaInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetTableSchemaInput) => {
      let db: any = null;
      try {
        const resolvedPath = path.resolve(params.db_path);
        
        try {
          await fs.access(resolvedPath);
        } catch {
          return { content: [{ type: "text", text: `Error: Database file not found: "${params.db_path}"` }] };
        }

        const Database = await loadSqlite();
        db = new Database(resolvedPath);

        // Get column info using PRAGMA
        const columns = db.prepare(`PRAGMA table_info("${params.table}")`).all();
        
        if (columns.length === 0) {
          return { content: [{ type: "text", text: `Error: Table "${params.table}" does not exist in database "${params.db_path}"` }] };
        }

        // Get CREATE TABLE statement
        const createTable = db.prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
        ).get(params.table);

        const result = {
          database: resolvedPath,
          table: params.table,
          columns: columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: !col.notnull,
            default_value: col.dflt_value,
            is_primary_key: col.pk === 1
          })),
          create_statement: createTable?.sql
        };

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [
            `# Table Schema: ${data.table}`,
            "",
            `**Database**: ${data.database}`,
            "",
            "## Columns",
            "",
            "| Column | Type | Nullable | Default | Primary Key |",
            "|--------|------|----------|---------|-------------|"
          ];

          for (const col of data.columns) {
            const pk = col.is_primary_key ? "✓" : "";
            const nullable = col.nullable ? "✓" : "";
            const defaultVal = col.default_value !== null ? col.default_value : "-";
            lines.push(`| ${col.name} | ${col.type} | ${nullable} | ${defaultVal} | ${pk} |`);
          }

          if (data.create_statement) {
            lines.push("", "## CREATE TABLE Statement", "", codeBlock(data.create_statement, "sql"));
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleDbError(error) }] };
      } finally {
        if (db) {
          try { db.close(); } catch {}
        }
      }
    }
  );
}
