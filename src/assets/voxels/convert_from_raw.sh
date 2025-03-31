#!/bin/bash

INPUT_DIR="./raw_from_pk3"
OUTPUT_DIR="."

# Ensure the input folder exists
if [ ! -d "$INPUT_DIR" ]; then
  echo "❌ Folder 'raw_from_pk3' not found!"
  exit 1
fi

for voxel in "$INPUT_DIR"/*; do
  base=$(basename "$voxel" | sed 's/\.[^.]*$//')  # remove extension if any
  echo "Converting $base..."

  # Convert using kvox to KVX format
  kvox "$voxel" "$OUTPUT_DIR/$base.kvx"
done

echo "✅ Conversion complete! All .kvx files saved to current directory."