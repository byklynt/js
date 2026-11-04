// Dev check: fails when a key exists in lib/i18n/id.ts but not in en.ts (or the other way round).
// Run with: npm run i18n:check   (Node 22+ strips the TypeScript types on import)
import { id } from "../lib/i18n/id.ts";
import { en } from "../lib/i18n/en.ts";

const missing = Object.keys(id).filter((k) => !(k in en));
const orphan = Object.keys(en).filter((k) => !(k in id));
if (missing.length || orphan.length) {
  if (missing.length) console.error(`Missing in en.ts (${missing.length}):\n  ${missing.join("\n  ")}`);
  if (orphan.length) console.error(`Not in id.ts (${orphan.length}):\n  ${orphan.join("\n  ")}`);
  process.exit(1);
}
console.log(`i18n ok: ${Object.keys(id).length} keys in both dictionaries.`);
