import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FilesystemSkillRegistry } from "../apps/worker/src/skillRegistry.js";

describe("FilesystemSkillRegistry", () => {
  let tempDir: string;
  let skillsDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-skills-"));
    skillsDir = path.join(tempDir, "docs", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    
    // Create a mock skill markdown
    const skillContent = `---
id: test-skill
name: Test Skill
phase: plan
summary: A test skill for the registry.
---
# Test Skill

This is a test skill.`;
    fs.writeFileSync(path.join(skillsDir, "test-skill.md"), skillContent);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should load skills from filesystem", () => {
    const registry = new FilesystemSkillRegistry(skillsDir);
    const skills = registry.list();
    
    const found = skills.find(s => s.id === "test-skill");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Test Skill");
    expect(found?.phase).toBe("plan");
    expect(found?.summary).toBe("A test skill for the registry.");
  });

  it("should fall back to default skills if no custom skills loaded", () => {
    const emptyDir = path.join(tempDir, "empty");
    const registry = new FilesystemSkillRegistry(emptyDir);
    const skills = registry.list();
    
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some(s => s.id === "spec-first")).toBe(true);
  });
});
