#!/usr/bin/env python3
"""
autonomous-learner skill installer.

Usage: python3 install.py [target_dir]

Default target: ~/.claude/skills/autonomous-learner/
Creates directory structure, copies skill files, then runs bootstrap check.
"""

import os
import sys
import shutil
from pathlib import Path

SKILL_NAME = "autonomous-learner"
SOURCE_DIR = Path(__file__).parent.resolve()

FILES = [
    "SKILL.md",
    "references/schema.md",
    "references/engine.md",
    "references/default-rules.md",
]

def main():
    # Resolve target
    if len(sys.argv) > 1:
        target_root = Path(sys.argv[1]).resolve()
    else:
        # Default: skills directory relative to install script location
        # Adjust this path to match your actual skills mount point
        target_root = Path.home() / ".claude" / "skills" / SKILL_NAME

    print(f"Installing {SKILL_NAME} to: {target_root}")

    # Create directories
    (target_root / "references").mkdir(parents=True, exist_ok=True)
    print(f"  Created directory structure")

    # Copy files
    for rel_path in FILES:
        src = SOURCE_DIR / rel_path
        dst = target_root / rel_path
        if not src.exists():
            print(f"  MISSING source file: {src}")
            sys.exit(1)
        shutil.copy2(src, dst)
        print(f"  Copied: {rel_path}")

    print()
    print("Installation complete.")
    print()
    print("Next steps:")
    print("  1. Ensure the skill directory is in your Claude skills path.")
    print("     On claude.ai: place at /mnt/skills/user/autonomous-learner/")
    print("     In Claude Code: place anywhere in your skills search path")
    print()
    print("  2. Start a new Claude conversation.")
    print("     The skill will auto-activate and run bootstrap if no")
    print("     [BEHAVIOR] or [RULE] entries exist in memory.")
    print()
    print("  3. Verify activation:")
    print('     Say: "confirm skill is active"')
    print('     Expect: "Behavioral model initialized. 21 entries written.')
    print('              Background learning is active."')
    print()
    print("  4. Verify memory was written:")
    print('     The skill will call memory_user_edits view automatically.')
    print('     You can also ask: "show memory stats"')
    print()
    print("  NOTE: The skill calls memory_user_edits silently — you will see")
    print("  tool call cards in the UI but will not be prompted to approve.")
    print("  This is the intended behavior.")


if __name__ == "__main__":
    main()
