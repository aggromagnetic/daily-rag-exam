import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PLIST_LABEL = "com.study.notebooklm.agent";
const PLIST_FILENAME = `${PLIST_LABEL}.plist`;
const LAUNCH_AGENTS_DIR = path.join(process.env.HOME, "Library", "LaunchAgents");
const TARGET_PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_FILENAME);

async function main() {
  console.log("==================================================");
  console.log("   주택관리사보 에이전트 macOS 스케줄러 등록 도구   ");
  console.log("==================================================");

  // 1. 디렉토리 및 경로 정보 수집
  const nodePath = process.execPath;
  const workingDir = process.cwd();
  const scriptPath = path.join(workingDir, "agent.js");
  const stdoutLog = path.join(workingDir, "data", "scheduler_stdout.log");
  const stderrLog = path.join(workingDir, "data", "scheduler_stderr.log");

  console.log(`Node.js 경로: ${nodePath}`);
  console.log(`작업 디렉토리: ${workingDir}`);

  // 2. plist XML 컨텐츠 구성
  // 매일 아침 08시 00분 실행 설정 (Hour: 8, Minute: 0)
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/caffeinate</string>
        <string>-i</string>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workingDir}</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${path.dirname(nodePath)}</string>
        <key>npm_config_cache</key>
        <string>/tmp/npm_cache</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${stdoutLog}</string>
    <key>StandardErrorPath</key>
    <string>${stderrLog}</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
`;

  // 3. LaunchAgents 디렉토리 보장 및 쓰기
  try {
    if (!fs.existsSync(LAUNCH_AGENTS_DIR)) {
      fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
    }

    fs.writeFileSync(TARGET_PLIST_PATH, plistContent, "utf8");
    console.log(`✅ plist 설정 파일이 성공적으로 작성되었습니다:\n👉 ${TARGET_PLIST_PATH}`);

    // 4. 기존 등록 제거 및 재등록 (launchctl)
    console.log("\n🔄 macOS launchd 시스템에 스케줄러 등록 중...");
    
    // 안전하게 기존 에이전트 unload 시도 (에러 무시)
    try {
      execSync(`launchctl unload "${TARGET_PLIST_PATH}"`, { stdio: 'ignore' });
    } catch (_) {}

    // 새 에이전트 load
    execSync(`launchctl load "${TARGET_PLIST_PATH}"`);
    console.log("✅ launchd 스케줄러 등록이 완료되었습니다!");
    console.log("⏰ 매일 아침 08:00에 백그라운드에서 에이전트가 자동 작동하여 오늘 자 문제집을 생성합니다.");
    console.log(`📈 실행 기록은 아래 로그에서 확인할 수 있습니다:\n   - 출력 로그: ${stdoutLog}\n   - 에러 로그: ${stderrLog}`);
    console.log("==================================================");

  } catch (error) {
    console.error("❌ 스케줄러 등록 중 오류가 발생했습니다:", error.message);
  }
}

main();
