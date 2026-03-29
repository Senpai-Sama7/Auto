/**
 * TypeScript type definitions for Omni MCP Server
 */

/** Browser page info */
export interface PageInfo {
  url: string;
  title: string;
  viewport: { width: number; height: number };
}

/** System metrics */
export interface SystemMetrics {
  [key: string]: unknown;
  cpu: {
    usage_percent: number;
    cores: number;
    load_avg: number[];
  };
  memory: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    usage_percent: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    usage_percent: number;
  };
  uptime_seconds: number;
}

/** Docker container info */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Array<{
    internal: number;
    external?: number;
    protocol: string;
  }>;
  created: string;
}

/** WebSocket message */
export interface WSMessage {
  type: 'sent' | 'received';
  data: string;
  timestamp: string;
}

/** Network scan result */
export interface PortScanResult {
  host: string;
  port: number;
  state: 'open' | 'closed' | 'filtered';
  service?: string;
}

/** OCR result */
export interface OCRResult {
  [key: string]: unknown;
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}
