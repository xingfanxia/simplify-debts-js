#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  elif [[ -x /usr/libexec/java_home ]] && java_21_home="$(/usr/libexec/java_home -v 21 2>/dev/null)"; then
    export JAVA_HOME="$java_21_home"
  fi
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "Android builds require JDK 21. Set JAVA_HOME to a JDK 21 installation." >&2
  exit 1
fi

java_major="$($JAVA_HOME/bin/java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
if [[ "$java_major" != "21" ]]; then
  echo "Android builds require JDK 21; JAVA_HOME currently points to Java ${java_major:-unknown}." >&2
  exit 1
fi

exec "$repo_root/android/gradlew" -p "$repo_root/android" "$@"
