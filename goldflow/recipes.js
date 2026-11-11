// Goldflow starter recipe book.
// Reagents are stored by item NAME, because WoW: Forever added and renamed items and
// many IDs are new. The database matches names to item IDs automatically once the
// collector has seen the item on the auction house (or looked it up).
//
// verified: true  -> reagents taken from WoW: Forever recipe data (wow.gg, Nov 2026)
// verified: false -> Classic recipe carried over; check the in-game recipe once, then tick "verified"

export const VENDOR_REAGENTS = {
  'Empty Vial': 20,      // 20c
  'Leaded Vial': 200,    // 2s
  'Crystal Vial': 2500,  // 25s
};

const r = (name, profession, reagents, opts = {}) => ({
  name,
  profession,
  product: opts.product || name,
  yield: opts.yield || 1,
  verified: opts.verified ?? true,
  notes: opts.notes || '',
  reagents: reagents.map(([qty, item]) => ({
    item,
    qty,
    source: VENDOR_REAGENTS[item] ? 'vendor' : 'ah',
    vendor_price: VENDOR_REAGENTS[item] || null,
  })),
});

export const STARTER_RECIPES = [
  // ---------- Alchemy (WoW: Forever recipes) ----------
  r('Minor Mana Potion', 'Alchemy', [[1, 'Mageroyal'], [1, 'Peacebloom'], [1, 'Empty Vial']]),
  r('Lesser Mana Potion', 'Alchemy', [[1, 'Mageroyal'], [1, 'Stranglekelp'], [1, 'Empty Vial']]),
  r('Mana Potion', 'Alchemy', [[1, 'Stranglekelp'], [1, 'Kingsblood'], [1, 'Leaded Vial']]),
  r('Swiftness Potion', 'Alchemy', [[1, 'Swiftthistle'], [1, 'Briarthorn'], [1, 'Empty Vial']]),
  r('Blackmouth Oil', 'Alchemy', [[2, 'Oily Blackmouth'], [1, 'Empty Vial']]),
  r('Free Action Potion', 'Alchemy', [[2, 'Blackmouth Oil'], [1, 'Stranglekelp'], [1, 'Leaded Vial']]),
  r("Lesser Mender's Potion", 'Alchemy', [[2, 'Kingsblood'], [2, 'Liferoot'], [1, 'Leaded Vial']]),
  r("Mender's Potion", 'Alchemy', [[2, 'Wintersbite'], [2, 'Firebloom'], [1, 'Leaded Vial']]),
  r("Greater Mender's Potion", 'Alchemy', [[2, "Arthas' Tears"], [1, 'Purple Lotus'], [1, 'Crystal Vial']]),
  r('Elixir of Fortitude', 'Alchemy', [[4, 'Goldthorn'], [1, 'Leaded Vial']]),
  r('Elixir of Greater Fortitude', 'Alchemy', [[4, 'Sungrass'], [1, 'Crystal Vial']]),
  r('Elixir of Ogre Strength', 'Alchemy', [[1, 'Earthroot'], [1, 'Kingsblood'], [1, 'Leaded Vial']]),
  r('Elixir of Lesser Agility', 'Alchemy', [[1, 'Wild Steelbloom'], [1, 'Swiftthistle'], [1, 'Leaded Vial']]),
  r('Elixir of Greater Spirit', 'Alchemy', [[3, "Arthas' Tears"], [2, 'Purple Lotus'], [1, 'Crystal Vial']]),
  r('Lesser Invisibility Potion', 'Alchemy', [[1, 'Fadeleaf'], [1, 'Wild Steelbloom'], [1, 'Leaded Vial']]),
  r('Shadow Oil', 'Alchemy', [[4, 'Fadeleaf'], [4, 'Grave Moss'], [1, 'Leaded Vial']]),
  r('Fire Oil', 'Alchemy', [[2, 'Firefin Snapper'], [1, 'Empty Vial']]),
  r('Frost Protection Potion', 'Alchemy', [[1, 'Wintersbite'], [1, 'Goldthorn'], [1, 'Leaded Vial']]),
  r('Nature Protection Potion', 'Alchemy', [[1, 'Liferoot'], [1, 'Stranglekelp'], [1, 'Leaded Vial']]),
  r('Shadow Protection Potion', 'Alchemy', [[1, 'Grave Moss'], [1, 'Kingsblood'], [1, 'Leaded Vial']]),
  r('Major Rejuvenation Potion', 'Alchemy', [[4, 'Heart of the Wild'], [4, 'Golden Sansam'], [1, 'Dreamfoil'], [1, 'Imbued Vial']]),
  r('Flask of the Titans', 'Alchemy', [[10, 'Gromsblood'], [1, 'Stonescale Oil'], [1, 'Black Lotus'], [1, 'Crystal Vial']]),
  r('Flask of Supreme Power', 'Alchemy', [[10, 'Dreamfoil'], [1, 'Mountain Silversage'], [1, 'Black Lotus'], [1, 'Crystal Vial']]),
  r('Flask of Distilled Wisdom', 'Alchemy', [[10, 'Dreamfoil'], [1, 'Icecap'], [1, 'Black Lotus'], [1, 'Crystal Vial']]),
  r('Flask of Petrification', 'Alchemy', [[10, 'Stonescale Oil'], [1, 'Mountain Silversage'], [1, 'Black Lotus'], [1, 'Crystal Vial']]),
  r('Flask of Chromatic Resistance', 'Alchemy', [[10, 'Icecap'], [1, 'Mountain Silversage'], [1, 'Black Lotus'], [1, 'Crystal Vial']]),

  // ---------- Mining / smelting ----------
  r('Copper Bar', 'Mining', [[1, 'Copper Ore']], { verified: false }),
  r('Tin Bar', 'Mining', [[1, 'Tin Ore']], { verified: false }),
  r('Bronze Bar', 'Mining', [[1, 'Copper Bar'], [1, 'Tin Bar']], { yield: 2, notes: 'Forever change: makes 2 bars' }),
  r('Silver Bar', 'Mining', [[1, 'Silver Ore']], { verified: false }),
  r('Iron Bar', 'Mining', [[1, 'Iron Ore']], { verified: false }),
  r('Gold Bar', 'Mining', [[1, 'Gold Ore']], { verified: false }),
  r('Steel Bar', 'Mining', [[1, 'Iron Bar'], [1, 'Coal']], { verified: false }),
  r('Mithril Bar', 'Mining', [[1, 'Mithril Ore']], { verified: false }),
  r('Truesilver Bar', 'Mining', [[1, 'Truesilver Ore']], { verified: false }),
  r('Thorium Bar', 'Mining', [[1, 'Thorium Ore']], { verified: false }),

  // ---------- Tailoring cloth bolts ----------
  r('Bolt of Linen Cloth', 'Tailoring', [[2, 'Linen Cloth']], { verified: false }),
  r('Bolt of Woolen Cloth', 'Tailoring', [[3, 'Wool Cloth']], { verified: false }),
  r('Bolt of Silk Cloth', 'Tailoring', [[4, 'Silk Cloth']], { verified: false }),
  r('Bolt of Mageweave', 'Tailoring', [[5, 'Mageweave Cloth']], { verified: false }),
  r('Bolt of Runecloth', 'Tailoring', [[4, 'Runecloth']], { verified: false }),

  // ---------- First Aid ----------
  r('Heavy Wool Bandage', 'First Aid', [[2, 'Wool Cloth']], { verified: false }),
  r('Heavy Silk Bandage', 'First Aid', [[2, 'Silk Cloth']], { verified: false }),
  r('Heavy Mageweave Bandage', 'First Aid', [[2, 'Mageweave Cloth']], { verified: false }),
  r('Heavy Runecloth Bandage', 'First Aid', [[2, 'Runecloth']], { verified: false }),
];
