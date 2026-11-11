-- Goldflow starter recipes (generated from recipes.js). Safe to run once.
-- Reagents are matched to item IDs by name automatically after each AH scan.

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Minor Mana Potion', 'Alchemy', 'Minor Mana Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Mageroyal', 1, 'ah', null),
  ((select id from r), 'Peacebloom', 1, 'ah', null),
  ((select id from r), 'Empty Vial', 1, 'vendor', 20);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Lesser Mana Potion', 'Alchemy', 'Lesser Mana Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Mageroyal', 1, 'ah', null),
  ((select id from r), 'Stranglekelp', 1, 'ah', null),
  ((select id from r), 'Empty Vial', 1, 'vendor', 20);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Mana Potion', 'Alchemy', 'Mana Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Stranglekelp', 1, 'ah', null),
  ((select id from r), 'Kingsblood', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Swiftness Potion', 'Alchemy', 'Swiftness Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Swiftthistle', 1, 'ah', null),
  ((select id from r), 'Briarthorn', 1, 'ah', null),
  ((select id from r), 'Empty Vial', 1, 'vendor', 20);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Blackmouth Oil', 'Alchemy', 'Blackmouth Oil', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Oily Blackmouth', 2, 'ah', null),
  ((select id from r), 'Empty Vial', 1, 'vendor', 20);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Free Action Potion', 'Alchemy', 'Free Action Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Blackmouth Oil', 2, 'ah', null),
  ((select id from r), 'Stranglekelp', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Lesser Mender''s Potion', 'Alchemy', 'Lesser Mender''s Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Kingsblood', 2, 'ah', null),
  ((select id from r), 'Liferoot', 2, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Mender''s Potion', 'Alchemy', 'Mender''s Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Wintersbite', 2, 'ah', null),
  ((select id from r), 'Firebloom', 2, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Greater Mender''s Potion', 'Alchemy', 'Greater Mender''s Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Arthas'' Tears', 2, 'ah', null),
  ((select id from r), 'Purple Lotus', 1, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Elixir of Fortitude', 'Alchemy', 'Elixir of Fortitude', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Goldthorn', 4, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Elixir of Greater Fortitude', 'Alchemy', 'Elixir of Greater Fortitude', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Sungrass', 4, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Elixir of Ogre Strength', 'Alchemy', 'Elixir of Ogre Strength', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Earthroot', 1, 'ah', null),
  ((select id from r), 'Kingsblood', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Elixir of Lesser Agility', 'Alchemy', 'Elixir of Lesser Agility', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Wild Steelbloom', 1, 'ah', null),
  ((select id from r), 'Swiftthistle', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Elixir of Greater Spirit', 'Alchemy', 'Elixir of Greater Spirit', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Arthas'' Tears', 3, 'ah', null),
  ((select id from r), 'Purple Lotus', 2, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Lesser Invisibility Potion', 'Alchemy', 'Lesser Invisibility Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Fadeleaf', 1, 'ah', null),
  ((select id from r), 'Wild Steelbloom', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Shadow Oil', 'Alchemy', 'Shadow Oil', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Fadeleaf', 4, 'ah', null),
  ((select id from r), 'Grave Moss', 4, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Fire Oil', 'Alchemy', 'Fire Oil', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Firefin Snapper', 2, 'ah', null),
  ((select id from r), 'Empty Vial', 1, 'vendor', 20);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Frost Protection Potion', 'Alchemy', 'Frost Protection Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Wintersbite', 1, 'ah', null),
  ((select id from r), 'Goldthorn', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Nature Protection Potion', 'Alchemy', 'Nature Protection Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Liferoot', 1, 'ah', null),
  ((select id from r), 'Stranglekelp', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Shadow Protection Potion', 'Alchemy', 'Shadow Protection Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Grave Moss', 1, 'ah', null),
  ((select id from r), 'Kingsblood', 1, 'ah', null),
  ((select id from r), 'Leaded Vial', 1, 'vendor', 200);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Major Rejuvenation Potion', 'Alchemy', 'Major Rejuvenation Potion', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Heart of the Wild', 4, 'ah', null),
  ((select id from r), 'Golden Sansam', 4, 'ah', null),
  ((select id from r), 'Dreamfoil', 1, 'ah', null),
  ((select id from r), 'Imbued Vial', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Flask of the Titans', 'Alchemy', 'Flask of the Titans', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Gromsblood', 10, 'ah', null),
  ((select id from r), 'Stonescale Oil', 1, 'ah', null),
  ((select id from r), 'Black Lotus', 1, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Flask of Supreme Power', 'Alchemy', 'Flask of Supreme Power', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Dreamfoil', 10, 'ah', null),
  ((select id from r), 'Mountain Silversage', 1, 'ah', null),
  ((select id from r), 'Black Lotus', 1, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Flask of Distilled Wisdom', 'Alchemy', 'Flask of Distilled Wisdom', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Dreamfoil', 10, 'ah', null),
  ((select id from r), 'Icecap', 1, 'ah', null),
  ((select id from r), 'Black Lotus', 1, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Flask of Petrification', 'Alchemy', 'Flask of Petrification', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Stonescale Oil', 10, 'ah', null),
  ((select id from r), 'Mountain Silversage', 1, 'ah', null),
  ((select id from r), 'Black Lotus', 1, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Flask of Chromatic Resistance', 'Alchemy', 'Flask of Chromatic Resistance', 1, true, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Icecap', 10, 'ah', null),
  ((select id from r), 'Mountain Silversage', 1, 'ah', null),
  ((select id from r), 'Black Lotus', 1, 'ah', null),
  ((select id from r), 'Crystal Vial', 1, 'vendor', 2500);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Copper Bar', 'Mining', 'Copper Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Copper Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Tin Bar', 'Mining', 'Tin Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Tin Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Bronze Bar', 'Mining', 'Bronze Bar', 2, true, 'Forever change: makes 2 bars') returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Copper Bar', 1, 'ah', null),
  ((select id from r), 'Tin Bar', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Silver Bar', 'Mining', 'Silver Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Silver Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Iron Bar', 'Mining', 'Iron Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Iron Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Gold Bar', 'Mining', 'Gold Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Gold Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Steel Bar', 'Mining', 'Steel Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Iron Bar', 1, 'ah', null),
  ((select id from r), 'Coal', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Mithril Bar', 'Mining', 'Mithril Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Mithril Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Truesilver Bar', 'Mining', 'Truesilver Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Truesilver Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Thorium Bar', 'Mining', 'Thorium Bar', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Thorium Ore', 1, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Bolt of Linen Cloth', 'Tailoring', 'Bolt of Linen Cloth', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Linen Cloth', 2, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Bolt of Woolen Cloth', 'Tailoring', 'Bolt of Woolen Cloth', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Wool Cloth', 3, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Bolt of Silk Cloth', 'Tailoring', 'Bolt of Silk Cloth', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Silk Cloth', 4, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Bolt of Mageweave', 'Tailoring', 'Bolt of Mageweave', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Mageweave Cloth', 5, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Bolt of Runecloth', 'Tailoring', 'Bolt of Runecloth', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Runecloth', 4, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Heavy Wool Bandage', 'First Aid', 'Heavy Wool Bandage', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Wool Cloth', 2, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Heavy Silk Bandage', 'First Aid', 'Heavy Silk Bandage', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Silk Cloth', 2, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Heavy Mageweave Bandage', 'First Aid', 'Heavy Mageweave Bandage', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Mageweave Cloth', 2, 'ah', null);

with r as (insert into public.recipes (name, profession, product_name, yield, verified, notes)
  values ('Heavy Runecloth Bandage', 'First Aid', 'Heavy Runecloth Bandage', 1, false, null) returning id)
insert into public.recipe_reagents (recipe_id, item_name, quantity, source, vendor_price) values
  ((select id from r), 'Runecloth', 2, 'ah', null);

select public.resolve_recipe_items();
