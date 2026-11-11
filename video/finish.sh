#!/usr/bin/env bash
# Usage: bash finish.sh out/agentshelf-draft1.mp4 out/agentshelf-final.mp4
# Two-pass EBU R128 loudness normalisation to -14 LUFS (YouTube), video stream copied untouched.
set -euo pipefail
in="$1"; out="$2"
json=$(ffmpeg -hide_banner -i "$in" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$json" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
ffmpeg -v error -y -i "$in" -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$out"
ffmpeg -hide_banner -i "$out" -af ebur128=framelog=quiet -f null - 2>&1 | grep -E "I:|Peak" | tail -2
ffprobe -v error -show_entries format=duration -of csv=p=0 "$out"
