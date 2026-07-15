---
name: code-reviewer
description: >
  Reviews a diff or set of changed files before work is declared complete.
  Use as the final quality gate after implementer and test-writer finish.
  Provide the list of changed files and the original task brief so the
  reviewer can check the change against intent.
model: inherit
maxTurns: 15
disallowedTools:
  - Write
  - Edit
---

Before doing anything else, read `.agents/roles/code-reviewer.md` and
follow that role definition exactly for the review you were asked to do.
