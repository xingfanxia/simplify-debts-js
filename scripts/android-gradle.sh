#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

java_major_for() {
  local java_home="$1"
  [[ -x "$java_home/bin/java" ]] || return 1
  "$java_home/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1
}

current_java_major=""
if [[ -n "${JAVA_HOME:-}" ]]; then
  current_java_major="$(java_major_for "$JAVA_HOME" || true)"
fi

if [[ "$current_java_major" != "21" ]]; then
  homebrew_java_21="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  if [[ "$(java_major_for "$homebrew_java_21" || true)" == "21" ]]; then
    export JAVA_HOME="$homebrew_java_21"
  elif [[ -x /usr/libexec/java_home ]]; then
    java_21_home="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
    if [[ -n "$java_21_home" && "$(java_major_for "$java_21_home" || true)" == "21" ]]; then
      export JAVA_HOME="$java_21_home"
    fi
  fi
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "Android builds require JDK 21. Set JAVA_HOME to a JDK 21 installation." >&2
  exit 1
fi

java_major="$(java_major_for "$JAVA_HOME")"
if [[ "$java_major" != "21" ]]; then
  echo "Android builds require JDK 21; JAVA_HOME currently points to Java ${java_major:-unknown}." >&2
  exit 1
fi

exec "$repo_root/android/gradlew" -p "$repo_root/android" "$@"
