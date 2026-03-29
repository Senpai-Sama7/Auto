/**
 * Image Processing Tools - OCR and image manipulation
 * 
 * Capabilities I DON'T have:
 * - OCR (text recognition from images)
 * - Image resizing/format conversion
 * - Image metadata extraction
 * - Thumbnail generation
 * - Batch image processing
 */

import * as fs from "fs/promises";
import * as path from "path";
import Tesseract from "tesseract.js";
import Sharp from "sharp";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat } from "../constants.js";
import type { OCRResult } from "../types.js";

// Input schemas
const OCRInputSchema = z.object({
  image_path: z.string().min(1).describe("Path to image file"),
  language: z.string().default("eng").describe("OCR language code (default: eng)"),
  region: z.object({
    left: z.number().int().min(0),
    top: z.number().int().min(0),
    width: z.number().int().min(1),
    height: z.number().int().min(1)
  }).optional().describe("Region to OCR (optional, default: full image)"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const ImageResizeInputSchema = z.object({
  input_path: z.string().min(1).describe("Input image path"),
  output_path: z.string().min(1).describe("Output image path"),
  width: z.number().int().min(1).optional().describe("Target width (keep aspect if height omitted)"),
  height: z.number().int().min(1).optional().describe("Target height (keep aspect if width omitted)"),
  quality: z.number().int().min(1).max(100).default(80).describe("JPEG quality (default: 80)"),
  format: z.enum(["jpeg", "png", "webp"]).optional().describe("Output format (default: same as input)"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const ImageInfoInputSchema = z.object({
  image_path: z.string().min(1).describe("Path to image file"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const ImageConvertInputSchema = z.object({
  input_path: z.string().min(1).describe("Input image path"),
  output_path: z.string().min(1).describe("Output image path"),
  format: z.enum(["jpeg", "png", "webp", "gif", "avif", "tiff"]).describe("Target format"),
  quality: z.number().int().min(1).max(100).default(80).describe("Quality for lossy formats"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Type definitions
type OCRInput = z.infer<typeof OCRInputSchema>;
type ImageResizeInput = z.infer<typeof ImageResizeInputSchema>;
type ImageInfoInput = z.infer<typeof ImageInfoInputSchema>;
type ImageConvertInput = z.infer<typeof ImageConvertInputSchema>;

export function registerImageTools(server: McpServer): void {

  // OCR tool
  server.registerTool(
    "image_ocr",
    {
      title: "OCR - Extract Text from Image",
      description: `Extract text from images using Tesseract OCR.

This can read text from screenshots, scanned documents, photos - something I CANNOT do.

Args:
  - image_path (string): Path to image file (required)
  - language (string): Language code (default: 'eng', use 'eng+fra' for multiple)
  - region (object): Region to OCR {left, top, width, height} (optional)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Extracted text with confidence scores and word positions.

Examples:
  - Full image: image_path="/tmp/receipt.png"
  - Specific region: image_path="document.png", region={"left":100,"top":50,"width":200,"height":100}
  - Multi-language: image_path="menu.jpg", language="eng+fra"

Supported Languages:
  - eng (English), fra (French), deu (German), spa (Spanish)
  - ita (Italian), por (Portuguese), rus (Russian), chi_sim (Chinese)
  - jpn (Japanese), kor (Korean), ara (Arabic), and more

Notes:
  - Higher resolution images yield better results
  - Clear, high-contrast text works best`,
      inputSchema: OCRInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: OCRInput) => {
      try {
        // Check file exists
        try {
          await fs.access(params.image_path);
        } catch {
          return { content: [{ type: "text", text: `Error: Image file not found: ${params.image_path}` }] };
        }

        const result = await Tesseract.recognize(
          params.image_path,
          params.language,
          {
            logger: () => {} // Suppress progress
          }
        );

        const ocrResult: OCRResult = {
          text: result.data.text,
          confidence: result.data.confidence,
          words: (result.data as unknown as { words: Array<any> }).words?.map((w: any) => ({
            text: w.text,
            confidence: w.confidence,
            bbox: {
              x: w.bbox.x0,
              y: w.bbox.y0,
              width: w.bbox.x1 - w.bbox.x0,
              height: w.bbox.y1 - w.bbox.y0
            }
          }))
        };

        const text = `# OCR Results

**Confidence**: ${ocrResult.confidence.toFixed(1)}%
**Words Found**: ${ocrResult.words.length}

## Extracted Text

\`\`\`
${ocrResult.text}
\`\`\`

${ocrResult.words.length > 0 ? `**Sample Words** (first 10):\n${ocrResult.words.slice(0, 10).map(w => `- "${w.text}" (${w.confidence.toFixed(0)}%)`).join('\n')}` : ''}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: ocrResult as unknown as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Image resize
  server.registerTool(
    "image_resize",
    {
      title: "Resize Image",
      description: `Resize an image to specified dimensions.

Args:
  - input_path (string): Input image path (required)
  - output_path (string): Output image path (required)
  - width (number): Target width (optional)
  - height (number): Target height (optional)
  - quality (number): JPEG quality 1-100 (default: 80)
  - format (string): Output format: jpeg, png, webp (optional, default: same)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Resized image saved to output path with new dimensions.

Examples:
  - Resize to width: width=800 (height auto)
  - Resize to height: height=600 (width auto)
  - Exact size: width=800, height=600
  - Convert: format="webp", quality=90

Notes:
  - If only width OR height specified, aspect ratio is maintained
  - If BOTH specified, image may be distorted
  - Creates output directory if needed`,
      inputSchema: ImageResizeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: ImageResizeInput) => {
      try {
        // Create output directory
        const outputDir = path.dirname(params.output_path);
        await fs.mkdir(outputDir, { recursive: true });

        let sharp = Sharp(params.input_path);

        // Get original metadata
        const metadata = await sharp.metadata();

        // Resize
        if (params.width || params.height) {
          sharp = sharp.resize(params.width, params.height, {
            fit: params.width && params.height ? 'fill' : 'inside'
          });
        }

        // Set format and quality
        const format = params.format || metadata.format || 'jpeg';
        switch (format) {
          case 'jpeg':
            sharp = sharp.jpeg({ quality: params.quality });
            break;
          case 'png':
            sharp = sharp.png();
            break;
          case 'webp':
            sharp = sharp.webp({ quality: params.quality });
            break;
        }

        await sharp.toFile(params.output_path);

        // Get output stats
        const stats = await fs.stat(params.output_path);
        const newMetadata = await Sharp(params.output_path).metadata();

        const result = {
          input: {
            path: params.input_path,
            width: metadata.width,
            height: metadata.height
          },
          output: {
            path: params.output_path,
            width: newMetadata.width,
            height: newMetadata.height,
            size_bytes: stats.size,
            format: newMetadata.format
          }
        };

        const text = `# Image Resized

**Input**: ${result.input.width}x${result.input.height}
**Output**: ${result.output.width}x${result.output.height}
**Format**: ${result.output.format}
**Size**: ${(result.output.size_bytes / 1024).toFixed(1)} KB
**Saved to**: ${result.output.path}`;

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

  // Get image info
  server.registerTool(
    "image_get_info",
    {
      title: "Get Image Information",
      description: `Get detailed metadata about an image file.

Args:
  - image_path (string): Path to image file (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Dimensions, format, file size, color depth, and EXIF metadata.`,
      inputSchema: ImageInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: ImageInfoInput) => {
      try {
        const [metadata, stats] = await Promise.all([
          Sharp(params.image_path).metadata(),
          fs.stat(params.image_path)
        ]);

        const result = {
          path: params.image_path,
          size_bytes: stats.size,
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          aspect_ratio: metadata.width && metadata.height 
            ? (metadata.width / metadata.height).toFixed(2) 
            : 'unknown',
          has_alpha: metadata.hasAlpha,
          channels: metadata.channels,
          density: metadata.density,
          space: metadata.space,
          exif: metadata.exif ? 'Present (use image_extract_exif tool)' : 'None'
        };

        const text = `# Image Information

| Property | Value |
|----------|-------|
| **Path** | ${result.path} |
| **Format** | ${result.format} |
| **Dimensions** | ${result.width}x${result.height} |
| **Aspect Ratio** | ${result.aspect_ratio} |
| **File Size** | ${(result.size_bytes / 1024).toFixed(1)} KB |
| **Color Space** | ${result.space} |
| **Channels** | ${result.channels} |
| **Has Alpha** | ${result.has_alpha} |
| **Density** | ${result.density || 'N/A'} DPI |
| **EXIF** | ${result.exif} |`;

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

  // Convert image format
  server.registerTool(
    "image_convert",
    {
      title: "Convert Image Format",
      description: `Convert an image to a different format.

Args:
  - input_path (string): Input image path (required)
  - output_path (string): Output image path (required)
  - format (string): Target format: jpeg, png, webp, gif, avif, tiff (required)
  - quality (number): Quality for lossy formats 1-100 (default: 80)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Converted image saved to output path.

Examples:
  - PNG to JPEG: format="jpeg"
  - To WebP: format="webp", quality=90
  - To AVIF: format="avif" (modern format)`,
      inputSchema: ImageConvertInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: ImageConvertInput) => {
      try {
        const outputDir = path.dirname(params.output_path);
        await fs.mkdir(outputDir, { recursive: true });

        let sharp = Sharp(params.input_path);

        // Apply format
        switch (params.format) {
          case 'jpeg':
            sharp = sharp.jpeg({ quality: params.quality, mozjpeg: true });
            break;
          case 'png':
            sharp = sharp.png({ compressionLevel: 9 });
            break;
          case 'webp':
            sharp = sharp.webp({ quality: params.quality });
            break;
          case 'gif':
            sharp = sharp.gif();
            break;
          case 'avif':
            sharp = sharp.avif({ quality: params.quality });
            break;
          case 'tiff':
            sharp = sharp.tiff();
            break;
        }

        await sharp.toFile(params.output_path);

        const stats = await fs.stat(params.output_path);
        const metadata = await Sharp(params.output_path).metadata();

        const result = {
          input_path: params.input_path,
          output_path: params.output_path,
          format: params.format,
          width: metadata.width,
          height: metadata.height,
          size_bytes: stats.size
        };

        const text = `# Image Converted

**From**: ${result.input_path}
**To**: ${result.output_path}
**Format**: ${result.format}
**Dimensions**: ${result.width}x${result.height}
**Size**: ${(result.size_bytes / 1024).toFixed(1)} KB`;

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
