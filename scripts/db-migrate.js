// Applies new files in supabase/migrations/ to the Aafia database, in
// order, each in one transaction. Uses the same bookkeeping table as the
// Supabase CLI, so either tool can be used later.
//
//   node scripts/db-migrate.js          apply what's new
//   node scripts/db-migrate.js --status list applied / pending
import { readdir, readFile } from "node:fs/promises";
import { literal, runSql } from "./supabase-api.js";

const dir = new URL("../supabase/migrations/", import.meta.url);

await runSql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  );
`);

const applied = new Set(
  (await runSql("select version from supabase_migrations.schema_migrations")).map((r) => r.version),
);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f.split("_")[0]));

if (process.argv.includes("--status")) {
  for (const f of files) console.log(`${pending.includes(f) ? "pending" : "applied"}  ${f}`);
  process.exit(0);
}

for (const file of pending) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const sql = await readFile(new URL(file, dir), "utf8");
  await runSql(`begin;
${sql}
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${literal(version)}, ${literal(rest.join("_"))}, array[${literal(sql)}]);
commit;`);
  console.log(`applied  ${file}`);
}
if (pending.length === 0) console.log("Database is up to date.");
