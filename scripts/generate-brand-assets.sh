#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
master="$project_root/assets/brand/settle-app-icon-gpt.png"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick is required (missing: magick)." >&2
  exit 1
fi

if [[ ! -f "$master" ]]; then
  echo "Missing brand master: $master" >&2
  exit 1
fi

scratch="$(mktemp -d)"
trap 'rm -r "$scratch"' EXIT

resize_square() {
  local source="$1"
  local size="$2"
  local output="$3"
  magick "$source" -auto-orient -resize "${size}x${size}^" -gravity center \
    -extent "${size}x${size}" -colorspace sRGB -strip "$output"
}

rounded_icon() {
  local source="$1"
  local size="$2"
  local radius="$3"
  local output="$4"
  resize_square "$source" "$size" "$scratch/icon.png"
  magick -size "${size}x${size}" xc:none -fill white \
    -draw "roundrectangle 0,0,$((size - 1)),$((size - 1)),$radius,$radius" \
    "$scratch/mask.png"
  magick "$scratch/icon.png" "$scratch/mask.png" -alpha off \
    -compose CopyOpacity -composite -strip "$output"
}

round_icon() {
  local source="$1"
  local size="$2"
  local output="$3"
  resize_square "$source" "$size" "$scratch/icon.png"
  magick -size "${size}x${size}" xc:none -fill white \
    -draw "circle $((size / 2)),$((size / 2)) $((size / 2)),0" \
    "$scratch/mask.png"
  magick "$scratch/icon.png" "$scratch/mask.png" -alpha off \
    -compose CopyOpacity -composite -strip "$output"
}

compose_splash() {
  local output="$1"
  local background="$2"
  local icon_ratio="$3"
  local width height short_side icon_size radius
  width="$(magick identify -format '%w' "$output")"
  height="$(magick identify -format '%h' "$output")"
  if (( width < height )); then short_side="$width"; else short_side="$height"; fi
  icon_size="$((short_side * icon_ratio / 100))"
  radius="$((icon_size * 22 / 100))"
  rounded_icon "$master" "$icon_size" "$radius" "$scratch/splash-icon.png"
  magick -size "${width}x${height}" "xc:${background}" \
    "$scratch/splash-icon.png" -gravity center -compose over -composite -strip "$output"
}

resize_square "$master" 512 "$project_root/public/app-icon.png"
resize_square "$master" 180 "$project_root/public/apple-touch-icon.png"
resize_square "$master" 1024 \
  "$project_root/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

while read -r density legacy adaptive; do
  directory="$project_root/android/app/src/main/res/mipmap-$density"
  resize_square "$master" "$legacy" "$directory/ic_launcher.png"
  round_icon "$master" "$legacy" "$directory/ic_launcher_round.png"
  resize_square "$master" "$adaptive" "$directory/ic_launcher_foreground.png"
  magick -size "${adaptive}x${adaptive}" xc:'#18231c' -strip \
    "$directory/ic_launcher_background.png"
done <<'SIZES'
ldpi 36 81
mdpi 48 108
hdpi 72 162
xhdpi 96 216
xxhdpi 144 324
xxxhdpi 192 432
SIZES

for splash in "$project_root"/android/app/src/main/res/drawable*/splash.png; do
  if [[ "$splash" == *night* ]]; then
    compose_splash "$splash" '#101511' 28
  else
    compose_splash "$splash" '#f4f1e8' 28
  fi
done

for splash in "$project_root"/ios/App/App/Assets.xcassets/Splash.imageset/*.png; do
  if [[ "$splash" == *dark* ]]; then
    compose_splash "$splash" '#101511' 14
  else
    compose_splash "$splash" '#f4f1e8' 14
  fi
done

echo "Generated web, iOS, Android, and splash assets from $master"
