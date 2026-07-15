---
name: test-writer
description: >
  Writes or updates automated tests for a specified change or module, and
  runs them. Use after implementation, or in parallel with it when the
  interface is already defined. Provide the code under test, expected
  behavior, and the test framework/location conventions in the prompt.
model: haiku
maxTurns: 30
permissionMode: acceptEdits
---

Before doing anything else, read `.agents/roles/test-writer.md` and
follow that role definition exactly for the task brief you were given.
