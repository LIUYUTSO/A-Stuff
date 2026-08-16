#!/bin/bash

# A-Stuff 3D Model Compressor
# Usage: ./scripts/compress.sh <filename.glb>

FILE=$1

if [ -z "$FILE" ]; then
    echo "Error: Please provide a filename."
    echo "Usage: ./scripts/compress.sh my-model.glb"
    exit 1
fi

if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found."
    exit 1
fi

echo "--- A-STUFF ASSET OPTIMIZER ---"
echo "Target: $FILE"
echo "Original size: $(du -h "$FILE" | cut -f1)"

# Use npx to run gltf-transform (more powerful than gltf-pipeline for textures)
# 1. Resize textures to 1024 max (most 12MB files have 4K textures)
# 2. Convert textures to WebP (huge savings)
# 3. Apply Draco geometry compression
BASENAME=$(basename "$FILE")
OUTPUT="compressed_${BASENAME}"

echo "Optimizing... (Step 1: Resizing Textures to 1024px & Converting to WebP)"
npx -y @gltf-transform/cli resize --width 1024 --height 1024 "$FILE" "$OUTPUT"
npx -y @gltf-transform/cli webp "$OUTPUT" "$OUTPUT"

echo "Optimizing... (Step 2: Applying Draco Geometry Compression)"
npx -y @gltf-transform/cli draco "$OUTPUT" "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "Success! Compressed version created: $OUTPUT"
    echo "New size: $(du -h "$OUTPUT" | cut -f1)"
    echo "----------------------------"
    echo "You can now upload $OUTPUT via the Admin UI."
else
    echo "Error: Compression failed. Make sure you have Node.js installed."
fi
