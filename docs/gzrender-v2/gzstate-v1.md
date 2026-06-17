# GZSTATE v1 Draft

## Purpose

GZSTATE is a canonical renderer-facing state packet. It is not raw WAD lumps. It represents post-load, resolved state in a form the renderer can import deterministically.

## Requirements

- deterministic
- versioned
- little-endian
- no raw pointers
- index-based references
- diffable section by section
- replayable
- backend-neutral
- suitable for corpus-scale validation

## Expected Sections

- header
- version
- engine/build hash
- map identifier
- string table
- texture table
- flat table
- vertices
- sectors
- sidedefs
- linedefs
- segs
- subsectors
- nodes
- resolved links
- render options
- camera defaults
- static lighting
- dynamic-capable sector state
- line/switch state
- animation state
- thing visual state
- voxel/model/sprite bindings
- event schema version

## Dynamic State Fields

Sectors should support:

- floor height
- ceiling height
- target floor/ceiling height
- movement speed
- crushing flags
- light level
- target light level
- special type
- tag
- active mover type
- floor/ceiling texture
- color/fog/light data

Lines should support:

- special/action type
- tag
- activation flags
- repeatable/one-shot state
- switch state
- front/back side refs
- blocking/two-sided/secret flags
- transparent/masked texture flags
- texture offsets
- scroll state

## Versioning Rule

Any structural change to GZSTATE requires a version bump and documentation.
