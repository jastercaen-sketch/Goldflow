// Regenerates supabase/seed_recipes.sql from recipes.js
import { STARTER_RECIPES } from '../recipes.js';
import { writeFileSync } from 'node:fs';
const q = (s) => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
let sql = `-- Goldflow starter recipes (generated from recipes.js). Safe to run once.\n`;
sql += `-- Reagents are matched to item IDs by name automatically after each AH scan.\n\n`;
for (const r of STARTER_RECIPES) {
  sql += `with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)\n`;
  sql += `  values (${q(r.name)}, ${q(r.profession)}, ${q(r.product)}, ${r.yield}, ${r.verified}, ${q(r.notes || null)}) returning id)\n`;
  sql += `insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values\n`;
  sql += r.reagents.map(g => `  ((select id from r), ${q(g.item)}, ${g.qty}, ${q(g.source)}, ${g.vendor_price ?? 'null'})`).join(',\n') + ';\n\n';
}
sql += `select public.resolve_recipe_items();\n`;
writeFileSync(new URL('../supabase/seed_recipes.sql', import.meta.url), sql);
console.log('recipes:', STARTER_RECIPES.length);
