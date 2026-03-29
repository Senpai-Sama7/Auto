import fs from "node:fs";
import path from "node:path";
import { type SkillDefinition, type TaskRecord, SkillDefinitionSchema } from "@ultimate-system/contracts";
import { type SkillRegistry, DefaultSkillRegistry } from "@ultimate-system/core";
import { repoRoot } from "./commandRunner.js";

export class FilesystemSkillRegistry implements SkillRegistry {
  private fallbackRegistry = new DefaultSkillRegistry();
  private loadedSkills: SkillDefinition[] = [];
  private hasLoaded = false;

  constructor(private readonly skillsDir: string = path.join(repoRoot, "docs", "skills")) {}

  list(): SkillDefinition[] {
    if (!this.hasLoaded) {
      this.loadSkills();
      this.hasLoaded = true;
    }
    
    if (this.loadedSkills.length > 0) {
      return this.loadedSkills;
    }
    
    return this.fallbackRegistry.list();
  }

  resolve(task: TaskRecord): SkillDefinition[] {
    const skillHint = task.skillHint;
    if (skillHint) {
      const skills = this.list();
      const match = skills.find(s => s.id === skillHint || s.name === skillHint);
      if (match) return [match];
    }
    return this.fallbackRegistry.resolve(task);
  }

  private loadSkills() {
    if (!fs.existsSync(this.skillsDir)) {
      return;
    }

    const processDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          processDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const parsed = this.parseFrontmatter(content);
          if (parsed) {
            const result = SkillDefinitionSchema.safeParse(parsed);
            if (result.success) {
              this.loadedSkills.push(result.data);
            } else {
              console.warn(`Invalid skill definition in ${fullPath}:`, result.error.message);
            }
          }
        }
      }
    };

    try {
      processDir(this.skillsDir);
    } catch (err) {
      console.warn("Failed to load skills from filesystem:", err);
    }
  }

  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match || typeof match[1] !== "string") return null;

    const frontmatter = match[1];
    const result: Record<string, unknown> = {};
    const lines = frontmatter.split(/\r?\n/);
    
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > -1) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        // Remove quotes if present
        result[key] = value.replace(/^["'](.*)["']$/, '$1');
      }
    }
    return result;
  }
}
