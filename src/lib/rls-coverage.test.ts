import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Parse Prisma schema to extract model names and their table mappings.
 * Returns a Map of model name -> actual table name (from @@map or model name).
 */
function parseModelsFromSchema(schemaContent: string): Map<string, string> {
  const models = new Map<string, string>();

  // Regex to match model blocks: model ModelName { ... }
  // This handles multiline models and captures content until the closing brace
  const modelRegex = /model\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

  let match;
  while ((match = modelRegex.exec(schemaContent)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    // Look for @@map("table_name") in the model body
    const mapMatch = /@@map\s*\(\s*"([^"]+)"\s*\)/i.exec(modelBody);
    const tableName = mapMatch ? mapMatch[1] : modelName;

    models.set(modelName, tableName);
  }

  return models;
}

/**
 * Parse all migration files and extract table names that have RLS enabled.
 * Tolerates: case-insensitive keywords, optional "public." prefix,
 * double-quoted identifiers, and arbitrary whitespace/newlines.
 */
function parseRlsEnabledTables(migrationsDir: string): Set<string> {
  const rlsTables = new Set<string>();

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Regex to match: ALTER TABLE [public.]"?"table_name"? ENABLE ROW LEVEL SECURITY
    // Case-insensitive, handles optional schema prefix and quotes
    const alterRegex =
      /ALTER\s+TABLE\s+(?:public\s*\.\s*)?(?:")?(\w+)(?:")?[\s\n]+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

    let match;
    while ((match = alterRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      rlsTables.add(tableName);
    }
  }

  return rlsTables;
}

describe("RLS coverage", () => {
  it("finds at least one model in the schema", () => {
    const repoRoot = process.cwd();
    const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");

    const models = parseModelsFromSchema(schemaContent);

    expect(models.size, "Schema parser found no models — regex may be broken").toBeGreaterThan(0);
  });

  it("ensures all Prisma models have RLS enabled in migrations", () => {
    const repoRoot = process.cwd();

    // Parse schema
    const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const models = parseModelsFromSchema(schemaContent);

    // Parse migrations
    const migrationsDir = path.join(repoRoot, "supabase", "migrations");
    const rlsTables = parseRlsEnabledTables(migrationsDir);

    // Check coverage: every table must have RLS
    const tableNames = Array.from(models.values()).map((t) => t.toLowerCase());
    const missingRls = tableNames.filter((tableName) => !rlsTables.has(tableName));

    const failureMessage = `
The following table(s) lack ENABLE ROW LEVEL SECURITY in supabase/migrations/:
${missingRls.map((t) => `  - ${t}`).join("\n")}

Fix: Create a new migration file in supabase/migrations/ with:
${missingRls.map((t) => `  ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n")}

Do NOT edit an existing migration — add a new one.
Models with RLS: ${Array.from(rlsTables).sort().join(", ") || "(none)"}
Models in schema: ${tableNames.sort().join(", ")}
    `.trim();

    expect(missingRls, failureMessage).toEqual([]);
  });
});
