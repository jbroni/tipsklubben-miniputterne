import { prisma } from "../src/lib/prisma";

interface TableRow {
  schema: string;
  table_name: string;
  relkind: string;
  relrowsecurity: boolean;
  policy_count: number;
}

interface ViewRow {
  schema: string;
  table_name: string;
  relkind: string;
}

/**
 * Query all tables in the public schema with their RLS status and policy counts.
 */
async function checkTablesRLS(): Promise<{
  tables: TableRow[];
  views: ViewRow[];
  tablesWithoutRLS: string[];
}> {
  // Query tables and partitioned tables with RLS status
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT
      n.nspname::text as schema,
      c.relname::text as table_name,
      c.relkind::text as relkind,
      c.relrowsecurity as relrowsecurity,
      COUNT(p.policyname)::int as policy_count
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    GROUP BY n.nspname, c.relname, c.relkind, c.relrowsecurity
    ORDER BY c.relname
  `;

  // Query views separately (informational only)
  const views = await prisma.$queryRaw<ViewRow[]>`
    SELECT
      n.nspname::text as schema,
      c.relname::text as table_name,
      c.relkind::text as relkind
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
    ORDER BY c.relname
  `;

  // Identify tables without RLS
  const tablesWithoutRLS = tables
    .filter((row) => !row.relrowsecurity)
    .map((row) => row.table_name);

  return { tables, views, tablesWithoutRLS };
}

/**
 * Main function to check RLS configuration.
 */
async function main() {
  try {
    const { tables, views, tablesWithoutRLS } = await checkTablesRLS();

    console.log("=== RLS Configuration Report ===\n");

    // Print table status
    console.log("Tables in public schema:");
    for (const table of tables) {
      const glyph = table.relrowsecurity ? "✓" : "✗";
      const rlsStatus = table.relrowsecurity ? "ENABLED" : "DISABLED";
      const policyInfo = ` (${table.policy_count} policies)`;
      console.log(`  ${glyph} ${table.table_name}: RLS ${rlsStatus}${policyInfo}`);
    }

    // Warn about policies
    const tablesWithPolicies = tables.filter((row) => row.policy_count > 0);
    if (tablesWithPolicies.length > 0) {
      console.log(
        "\n⚠ WARNING: The following tables have RLS policies defined. " +
          "This project expects zero policies (all access is server-side via the owner role):"
      );
      for (const table of tablesWithPolicies) {
        console.log(`  - ${table.table_name} (${table.policy_count} policies)`);
      }
    }

    // Print view status (informational only)
    if (views.length > 0) {
      console.log("\nViews/Materialized Views in public schema (informational):");
      for (const view of views) {
        const type = view.relkind === "v" ? "View" : "Materialized View";
        console.log(`  ℹ ${view.table_name} (${type})`);
      }
    }

    // Exit with appropriate code
    if (tablesWithoutRLS.length > 0) {
      console.error(
        "\n❌ FAILED: The following public tables have RLS disabled:\n" +
          tablesWithoutRLS.map((t) => `  - ${t}`).join("\n")
      );
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log("\n✓ All public tables have RLS enabled.");
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fatal error: ${message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
