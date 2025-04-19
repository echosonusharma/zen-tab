#!/bin/bash
# bash ./scripts/unpack_zip.sh

unpack_path='packages/unpacked'

rm -rf "$unpack_path"
mkdir -p "$unpack_path"

find packages -type f -name '*zen*.zip' | while read file; do
    name=$(basename "$file" .zip)
    unzip -n "$file" -d "$unpack_path/$name"
done
