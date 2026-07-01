# 08 — Switches, Textures & Linedef Flags

Switch textures are wall composites that flip on activation. Linedef **flags** control blocking, sidedness, pegging, and (in extended maps) activation modes. This chapter documents naming conventions, doom-wad-lab flip logic, and the full flags bit table.

← [07 — Sprites & Animations](./07-sprites-and-animations.md) | [TOC](./README.md) | Next: [09 — Linedef Specials](./09-linedef-specials.md)

---

## Switch texture naming

Doom encodes switch state in texture **names**, not separate state lumps:

| Prefix | State | Typical use |
|--------|-------|-------------|
| `SW1` | Off / unpressed | Light switch, manual door button |
| `SW2` | On / pressed | After activation |
| `DB1` | Off | Big door switch (Doom II) |
| `DB2` | On | Big door switch pressed |

The suffix identifies the switch style, e.g. `SW1BRCOM` ↔ `SW2BRCOM`.

Switch textures are ordinary TEXTURE1/2 composites — see [04-graphics-patches-textures.md](./04-graphics-patches-textures.md).

---

## doom-wad-lab switch detection

`/Users/williamfarmer/IdeaProjects/doom/doom-wad-lab/src/wad/game/switchTextures.ts`

### Detection

```5:14:/Users/williamfarmer/IdeaProjects/doom/doom-wad-lab/src/wad/game/switchTextures.ts
function isSwitchTextureName(name: string | undefined): boolean {
  if (!name || name === '-') return false;
  const upper = name.toUpperCase();
  return (
    upper.startsWith('SW1') ||
    upper.startsWith('SW2') ||
    upper.startsWith('DB1') ||
    upper.startsWith('DB2')
  );
}
```

`lineHasSwitchTexture()` scans both sidedefs referenced by the linedef for switch names on upper, middle, or lower tiers.

### Flip logic

On switch activation, textures toggle pairwise:

```32:39:/Users/williamfarmer/IdeaProjects/doom/doom-wad-lab/src/wad/game/switchTextures.ts
function flipSwitchName(name: string): string | null {
  if (name.length < 4) return null;
  const upper = name.toUpperCase();
  if (upper.startsWith('SW1')) return `SW2${name.slice(3)}`;
  if (upper.startsWith('SW2')) return `SW1${name.slice(3)}`;
  if (upper.startsWith('DB1')) return `DB2${name.slice(3)}`;
  if (upper.startsWith('DB2')) return `DB1${name.slice(3)}`;
  return null;
}
```

`flipSwitchLineTextures()` mutates `WadMap.SIDEDEFS` in place and returns whether any texture changed. Switched lines are tracked for mesh refresh via `getSwitchedLineIndices()`.

See also [../../line-specials.md](../../line-specials.md) — Switch visuals section.

---

## Linedef flags — classic (bits 0–8)

Raw field: **uint16** at offset 4 in classic LINEDEFS record.

Decoded in `lineFlagBits()` + `extractLinedefs()`:

| Bit | Mask | Field | Meaning when set |
|-----|------|-------|------------------|
| 0 | 0x0001 | impassible | Blocking line (players) |
| 1 | 0x0002 | blockMonsters | Blocking line (monsters) |
| 2 | 0x0004 | twoSided | Two-sided line (portal) |
| 3 | 0x0008 | upperUnpegged | Upper texture unpegged |
| 4 | 0x0010 | lowerUnpegged | Lower texture unpegged |
| 5 | 0x0020 | secret | Secret line (automap) |
| 6 | 0x0040 | blockSound | Block sound propagation |
| 7 | 0x0080 | notOnMap | Hide from automap |
| 8 | 0x0100 | alreadyOnMap | Always show on automap |

TypeScript object:

```236:248:/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/src/parser/loadWad.ts
        flags: {
          impassible: !!flags[0],
          blockMonsters: !!flags[1],
          twoSided: !!flags[2],
          upperUnpegged: !!flags[3],
          lowerUnpegged: !!flags[4],
          secret: !!flags[5],
          blockSound: !!flags[6],
          notOnMap: !!flags[7],
          alreadyOnMap: !!flags[8],
        },
```

### Pegging semantics

| Flag | Default (pegged) | When set (unpegged) |
|------|------------------|---------------------|
| upperUnpegged | Upper texture top aligns to ceiling | Top pegs to highest reference |
| lowerUnpegged | Lower texture bottom aligns to floor | Bottom pegs to lowest reference |

GZDoom renderer implements pegging in wall drawer — see GZDoom Bible chapter 05.

---

## Extended flags (bits 9–15)

When `isExtended` is true (BEHAVIOR lump in WAD):

| Bit | Field | Meaning |
|-----|-------|---------|
| 9 | activateAgain | Repeatable activation |
| 10–12 | activation combo | Player / monster / hit / bump / shoot |
| 13 | activatePlayerMonster | Monster can activate for player |
| 15 | blockAll | Block everything including pickups |

Extended decode:

```203:222:/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/src/parser/loadWad.ts
        flags: {
          ...
          activateAgain: Boolean(flags[9]),
          activatePlayer: Boolean(flags[10] && !flags[11] && !flags[12]),
          activateMonster: Boolean(!flags[10] && flags[11] && !flags[12]),
          activateHit: Boolean(flags[10] && flags[11]),
          activateBumped: Boolean(!flags[10] && !flags[11] && flags[12]),
          activateShotThrough: Boolean(flags[10] && flags[12]),
          activatePlayerPassthrough: Boolean(flags[11] && flags[12]),
          activatePlayerMonster: Boolean(flags[13]),
          blockAll: Boolean(flags[15]),
        },
```

Stock 68-map corpus uses classic flags only.

---

## rawFlags preservation

`LineDef.rawFlags` stores the original uint16 for GZSTATE parity:

```54:66:/Users/williamfarmer/IdeaProjects/doom/doom-wad-core/src/export/buildMapSections.ts
export function buildLinedefs(map: WadMap): GzstateLineDef[] {
  return map.LINEDEFS.map((line) => ({
    ...
    flags: line.rawFlags ?? encodeClassicLineFlags(line.flags),
    ...
  }));
}
```

Re-encoding from booleans may not round-trip extended activation combos — always prefer `rawFlags` when present.

---

## Two-sided lines and sidedef indices

| sidenum[0] | sidenum[1] | Configuration |
|------------|------------|---------------|
| ≥ 0 | −1 | One-sided solid wall |
| ≥ 0 | ≥ 0 | Two-sided portal (flag bit 2 set) |
| −1 | ≥ 0 | Invalid in stock maps |

Front side is the direction the linedef is drawn (v1 → v2); viewer must be on front side for manual use activation.

---

## Secret lines vs secret sectors

| Mechanism | Effect |
|-----------|--------|
| Line flag bit 5 (secret) | Line hidden on automap until revealed |
| Sector type 9 | Secret area percentage |
| Sector type 7 | Glow / special lighting |

Different systems — line secret flag ≠ sector secret type.

---

## Encoding for export

`encodeClassicLineFlags()` in `encodeDoomFormats.ts` rebuilds bits 0–8 from booleans for maps without stored rawFlags.

---

## External references

| Resource | URL |
|----------|-----|
| Linedef flags | https://doomwiki.org/wiki/Linedef |
| Switch texture | https://doomwiki.org/wiki/Switch |

---

## Code index

| File | Role |
|------|------|
| `doom-wad-lab/src/wad/game/switchTextures.ts` | SW1↔SW2 flip |
| `doom-wad-core/src/parser/loadWad.ts` | Flag decode |
| `doom-wad-core/src/formats/encodeDoomFormats.ts` | Flag encode |
| `doom-wad-lab/src/wad/game/mapActionController.ts` | Activation dispatch |

---

← [07 — Sprites & Animations](./07-sprites-and-animations.md) | [TOC](./README.md) | Next: [09 — Linedef Specials](./09-linedef-specials.md)
