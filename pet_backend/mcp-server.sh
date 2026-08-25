#!/usr/bin/env bash
# pet_backend MCP stdio 서버 실행 스크립트 (루트 CLAUDE.md "Phase: MCP 대화형 입구").
#
# 사전 조건: 먼저 `./gradlew bootJar` 로 build/libs/ 에 jar를 만들어 둬야 한다.
# (이 스크립트는 jar를 새로 빌드하지 않는다 — MCP 호스트가 매번 컴파일을 기다리지 않게 하기 위함)
#
# .env 로딩 방식: 이 스크립트는 pet_backend/.env를 bash로 직접 source하지 않는다 —
# .env는 Spring properties 형식이라 일부 키(예: logging.level.org.springframework...)에
# 점(.)이 들어 있어 유효한 bash 변수명이 아니다(source 시 문법 오류로 죽는다).
# 대신 bootRun과 동일한 기존 메커니즘을 그대로 쓴다: application.properties의
# `spring.config.import=optional:file:.env[.properties]`가 **현재 작업 디렉터리 기준
# 상대경로**로 .env를 읽으므로, 이 스크립트는 실행 전 항상 pet_backend 디렉터리로 cd한다 —
# 그래야 MCP 호스트가 어떤 작업 디렉터리에서 이 스크립트를 실행하든 .env를 찾는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

JAR="$(ls build/libs/*.jar 2>/dev/null | grep -v -- '-plain\.jar$' | head -n1)"
if [ -z "$JAR" ]; then
  echo "빌드된 jar가 없습니다. 먼저 ./gradlew bootJar 를 실행하세요." >&2
  exit 1
fi

exec java -jar "$JAR" --spring.profiles.active=mcp
