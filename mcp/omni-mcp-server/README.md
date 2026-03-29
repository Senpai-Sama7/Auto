# Omni MCP Server

The **ULTIMATE** MCP Server with **31 capabilities AI assistants DON'T have natively**.

## 🚀 What Makes This "Ultimate"

Unlike basic file/shell tools, this server provides **real-world superpowers** that AI assistants cannot do on their own:

| Category | Tools | Why It's Special |
|----------|-------|------------------|
| 🌐 **Browser Automation** | 6 tools | Render JavaScript, take screenshots, fill forms, execute JS in browser context |
| 📊 **System Monitoring** | 5 tools | Real-time CPU/memory/disk metrics, running processes, network interfaces |
| 🖼️ **Image Processing** | 4 tools | OCR text recognition, resize/convert images, extract metadata |
| 🐳 **Docker Management** | 6 tools | List/start/stop containers, view logs, run new containers |
| 🔌 **WebSocket Client** | 4 tools | Persistent connections, real-time bidirectional streaming |
| 🌐 **Network Tools** | 4 tools | Port scanning, ping, DNS lookups, reverse DNS |
| 🔔 **Notifications** | 2 tools | Desktop notifications, system beeps |

**Total: 31 unique capabilities**

---

## 📋 Tool Reference

### 🌐 Browser Automation (6 tools)

Navigate real browsers, interact with JavaScript-heavy sites, and capture visual state.

#### `browser_navigate`
Navigate to a URL and wait for JavaScript-rendered content.
```json
{
  "url": "https://example.com",
  "wait_until": "networkidle2"
}
```

#### `browser_screenshot`
Capture screenshots of pages or specific elements.
```json
{
  "selector": "#chart",
  "full_page": false
}
```

#### `browser_click`
Click on elements (triggers JavaScript events).
```json
{
  "selector": "button.submit",
  "wait_for_navigation": true
}
```

#### `browser_fill`
Fill form inputs.
```json
{
  "selector": "#email",
  "value": "user@example.com"
}
```

#### `browser_evaluate`
Execute JavaScript in browser context.
```json
{
  "script": "document.title"
}
```

#### `browser_get_content`
Extract rendered HTML or text content.
```json
{
  "selector": "article",
  "include_html": false
}
```

---

### 📊 System Monitoring (5 tools)

Access real-time system metrics and process information.

#### `system_get_metrics`
Get current CPU, memory, disk usage.
```json
{
  "include_temperatures": true
}
```

#### `system_list_processes`
List running processes with CPU/memory usage.
```json
{
  "sort_by": "cpu",
  "limit": 20
}
```

#### `system_disk_usage`
Show disk usage for all filesystems.
```json
{}
```

#### `system_network_interfaces`
Get network interface details and statistics.
```json
{}
```

#### `system_get_info`
Get comprehensive system information.
```json
{
  "detail_level": "full"
}
```

---

### 🖼️ Image Processing (4 tools)

OCR, image manipulation, and metadata extraction.

#### `image_ocr`
Extract text from images using Tesseract OCR.
```json
{
  "image_path": "/tmp/receipt.png",
  "language": "eng"
}
```

#### `image_resize`
Resize images with format conversion.
```json
{
  "input_path": "photo.jpg",
  "output_path": "thumb.jpg",
  "width": 200,
  "quality": 80
}
```

#### `image_get_info`
Get image metadata (dimensions, format, EXIF).
```json
{
  "image_path": "image.png"
}
```

#### `image_convert`
Convert between image formats.
```json
{
  "input_path": "image.png",
  "output_path": "image.webp",
  "format": "webp"
}
```

---

### 🐳 Docker Management (6 tools)

Full Docker container and image management.

#### `docker_list_containers`
List containers with status and ports.
```json
{
  "all": true
}
```

#### `docker_container_logs`
View container stdout/stderr logs.
```json
{
  "container": "myapp",
  "tail": 100
}
```

#### `docker_run_container`
Create and start a new container.
```json
{
  "image": "nginx",
  "name": "web",
  "ports": {"8080": "80"}
}
```

#### `docker_container_action`
Start, stop, restart, or remove containers.
```json
{
  "container": "web",
  "action": "stop"
}
```

#### `docker_inspect_container`
Get detailed container information.
```json
{
  "container": "web"
}
```

#### `docker_list_images`
List Docker images.
```json
{
  "all": false
}
```

---

### 🔌 WebSocket Client (4 tools)

Persistent bidirectional real-time communication.

#### `ws_connect`
Establish WebSocket connection.
```json
{
  "url": "wss://echo.websocket.org"
}
```

#### `ws_send`
Send message through connection.
```json
{
  "connection_id": "ws_123",
  "message": "Hello"
}
```

#### `ws_receive`
Collect messages from connection.
```json
{
  "connection_id": "ws_123",
  "timeout": 10000
}
```

#### `ws_close`
Close WebSocket connection.
```json
{
  "connection_id": "ws_123"
}
```

---

### 🌐 Network Tools (4 tools)

Network diagnostics and scanning.

#### `network_ping`
Check host reachability.
```json
{
  "host": "google.com",
  "count": 4
}
```

#### `network_port_scan`
Scan TCP ports on a host.
```json
{
  "host": "192.168.1.1",
  "ports": [22, 80, 443]
}
```

#### `network_dns_lookup`
Resolve DNS records.
```json
{
  "hostname": "google.com",
  "type": "A"
}
```

#### `network_reverse_dns`
Reverse DNS lookup for IP.
```json
{
  "ip": "8.8.8.8"
}
```

---

### 🔔 Notifications (2 tools)

System notifications and alerts.

#### `notify_desktop`
Show desktop notification.
```json
{
  "title": "Build Complete",
  "message": "Your project is ready!",
  "sound": true
}
```

#### `notify_beep`
Play system beep.
```json
{
  "count": 3
}
```

---

## 🔧 Installation

```bash
cd omni-mcp-server
npm install
npm run build
```

### Prerequisites

- Node.js 18+
- Docker (for docker_* tools)
- Chrome/Chromium (installed automatically by Puppeteer)

## 🚀 Usage

### Local Mode (stdio)
```bash
npm start
```

### HTTP Mode
```bash
export TRANSPORT=http
export PORT=3000
npm start
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "omni": {
      "command": "node",
      "args": ["/path/to/omni-mcp-server/dist/index.js"]
    }
  }
}
```

---

## 💡 Use Cases

### Web Scraping JavaScript Sites
```
browser_navigate → browser_wait → browser_screenshot
```

### System Troubleshooting
```
system_get_metrics → system_list_processes → docker_container_logs
```

### Document Processing Pipeline
```
browser_screenshot → image_ocr → notify_desktop
```

### Network Diagnostics
```
network_ping → network_port_scan → network_dns_lookup
```

### Real-time Data Streaming
```
ws_connect → ws_send → ws_receive → ws_close
```

---

## ⚠️ Security Notes

- **Browser automation**: Can access any website you can
- **Docker tools**: Requires Docker permissions
- **Network tools**: Only scan hosts you own/have permission to scan
- **System tools**: Shows real system information

## 📄 License

MIT
