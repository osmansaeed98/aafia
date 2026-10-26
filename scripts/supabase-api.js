// Runs SQL on the Aafia database through Supabase's Management API.
// In Claude's cloud session the access token is added automatically by
// the network; elsewhere set SUPABASE_ACCESS_TOKEN.
export const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "wexdrgrmkhjlwjklkris";

export async function runSql(query) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.message ?? `Supabase API error ${res.status}`);
  }
  return body;
}

// Quote a value as a SQL string literal.
export function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
