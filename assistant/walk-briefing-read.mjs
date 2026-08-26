#!/usr/bin/env node
/**
 * AI 강아지 관리 비서 — 브리핑 판정 결과 읽기 (발송 브리지용, 기획 v2 · 2026-08-24)
 *
 * 클로드 스케줄 세션(18:00 발송 브리지)이 실행한다. 역할은 "읽기"뿐이다:
 * 자바 스케줄러(17:55, pet_backend walk/WalkBriefingScheduler)가 walk_briefing 테이블에
 * 기록한 오늘의 판정을 조회해 JSON으로 출력한다. 기상청 호출·아스팔트 공식·게이트 판정은
 * 전부 자바에 있다 — 이 파일에 판정 로직을 추가하지 말 것 (복제 부채 금지, 기획 v2 원칙).
 *
 * 키는 pet_backend/.env 재사용 (규칙 1 — 이 파일에 키 없음).
 * 출력: { ok, found, briefing: { event, notify, reason, asphaltTemp, airTemp, humidity,
 *        precipitation, gapDays, riskLevel, petName, checkedAt }, link }
 *  - found=false: 오늘 판정 행 없음 → 자바 스케줄 미실행(백엔드 미가동) 또는 날씨 실패.
 *    브리지는 이 경우 조용히 종료한다 (기획 확정).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// 배포 도메인 기준 (2026-08-26 QA M-4 반영 — 폰에서도 열림). 도메인 변경 시
// pet_backend/.env의 WEB_BASE_URL을 따라간다 (미설정이면 배포 도메인 폴백).
// 주의: .env 로드 실패가 main의 JSON 에러 처리를 타도록 여기서 loadEnv()를 호출하지 않는다.
const DEPLOYED_WEB_URL = "https://dddang.duckdns.org";
const walkLink = (env) => `${env.WEB_BASE_URL || DEPLOYED_WEB_URL}/walk`;

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, "pet_backend", ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function supabaseGet(env, pathAndQuery) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// 오늘(KST) 0시 이후의 판정만 유효 — 어제 행을 읽어 낡은 알림을 보내는 것 방지
function kstTodayStartIso() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T00:00:00+09:00`;
}

async function main() {
  const env = loadEnv();
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[k]) return { ok: false, error: `pet_backend/.env에 ${k}가 없습니다` };
  }

  const since = encodeURIComponent(kstTodayStartIso());
  const rows = await supabaseGet(
    env,
    `walk_briefing?select=*&checked_at=gte.${since}&order=checked_at.desc&limit=1`
  );
  if (rows.length === 0) {
    return { ok: true, found: false, reason: "오늘 판정 행 없음 — 자바 스케줄 미실행(백엔드 미가동) 또는 날씨 조회 실패" };
  }

  // MCP Desktop 등록 여부 (읽기 전용) — 미등록이면 브리지가 알림 하단에 등록 안내
  // 배너를 붙이고, 등록되면 자동으로 배너가 사라진다 (2026-08-24 사용자 요청).
  let mcpDesktopRegistered = false;
  try {
    const cfg = JSON.parse(readFileSync(
      join(process.env.HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      "utf8"
    ));
    mcpDesktopRegistered = Boolean(cfg?.mcpServers?.["pet-care"]);
  } catch { /* 파일 없음/파싱 실패 = 미등록 취급 */ }

  const b = rows[0];
  let petName = null;
  if (b.pet_id != null) {
    try {
      const pets = await supabaseGet(env, `pet?select=pet_name&pet_id=eq.${b.pet_id}&limit=1`);
      petName = pets[0]?.pet_name ?? null;
    } catch { /* 이름 없이 진행 — "우리 아이"로 대체 */ }
  }

  return {
    ok: true,
    found: true,
    briefing: {
      event: b.event,
      notify: b.notify,
      reason: b.reason,
      asphaltTemp: b.asphalt_temp,
      airTemp: b.air_temp,
      humidity: b.humidity,
      precipitation: b.precipitation,
      gapDays: b.gap_days,
      riskLevel: b.risk_level,
      petName,
      checkedAt: b.checked_at,
    },
    link: walkLink(env),
    mcpDesktopRegistered,
  };
}

main()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
  })
  .catch((e) => {
    console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 2));
    process.exitCode = 1;
  });
