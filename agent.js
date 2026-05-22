import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { verifyQuizWithGemini } from './lib/gemini.js';

const CONFIG_PATH = path.resolve("data", "config.json");
const HISTORY_PATH = path.resolve("data", "history.json");
const INCORRECT_PATH = path.resolve("data", "incorrect_answers.json");
const DAILY_TESTS_DIR = path.resolve("public", "daily_tests");

// 누진 복리 가중치 연산 헬퍼 (10% -> 12% -> 15.6% -> 21.84% ...)
function calculateWeight(count) {
  if (!count || count <= 1) return 10;
  let weight = 10;
  for (let i = 2; i <= count; i++) {
    weight = weight * (1 + 0.1 * i);
  }
  return parseFloat(weight.toFixed(2));
}

// 데이터 로드 유틸리티
function loadJson(filePath, defaultValue) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      console.warn(`⚠️ Warning: Failed to parse ${filePath}. Using default value.`);
    }
  }
  return defaultValue;
}

// 데이터 저장 유틸리티
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// 오늘 날짜 문자열 YYYY-MM-DD
function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 🔄 GitHub Gist로부터 최신 오답 데이터를 다운로드하여 로컬 incorrect_answers.json 갱신
async function syncGistIncorrectAnswers() {
  let pat = process.env.GITHUB_PAT;
  let gistId = process.env.GITHUB_GIST_ID;

  // 로컬 github_config.json 탐색 (수험생 인증 정보를 로컬 기기에 수동으로 저장해두었을 경우)
  const GITHUB_CONFIG_PATH = path.resolve("data", "github_config.json");
  if (fs.existsSync(GITHUB_CONFIG_PATH)) {
    try {
      const githubConfig = JSON.parse(fs.readFileSync(GITHUB_CONFIG_PATH, "utf8"));
      if (githubConfig.github_pat) pat = githubConfig.github_pat;
      if (githubConfig.github_gist_id) gistId = githubConfig.github_gist_id;
    } catch (e) {
      console.warn("⚠️ data/github_config.json 파싱 실패:", e.message);
    }
  }

  if (!pat || !gistId) {
    console.log("ℹ️ GitHub PAT 또는 Gist ID를 찾지 못했습니다. 로컬 오답파일(data/incorrect_answers.json)을 그대로 사용하여 RAG를 수행합니다.");
    return;
  }

  console.log("🔄 GitHub Gist로부터 최신 오답 정보를 다운로드하는 중...");
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'AntigravityStudyAgent/1.0.0'
      }
    });

    if (!res.ok) {
      throw new Error(`Gist 로드 실패 (응답코드: ${res.status})`);
    }

    const gist = await res.json();
    const file = gist.files['incorrect_answers.json'];
    if (!file) {
      throw new Error("Gist 내에 incorrect_answers.json 파일이 존재하지 않습니다.");
    }

    const incorrectData = JSON.parse(file.content);
    saveJson(INCORRECT_PATH, incorrectData);
    console.log("✅ Gist 오답 정보를 성공적으로 가져와 data/incorrect_answers.json에 덮어썼습니다!");
  } catch (error) {
    console.error("❌ Gist 오답 연동 실패:", error.message);
    console.log("ℹ️ 로컬에 저장되어 있는 기존 오답 정보로 백업 구동합니다.");
  }
}

// 📊 정적 시험지 인덱스(tests_index.json)를 갱신
function updateTestsIndex() {
  console.log("📊 정적 시험지 인덱스(tests_index.json)를 갱신하는 중...");
  try {
    const files = fs.readdirSync(DAILY_TESTS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a)); // 최신 날짜 우선 정렬
    
    const tests = files.map(file => {
      const cleanName = file.replace('.md', '');
      const parts = cleanName.split('_');
      return {
        filename: file,
        date: parts[0] || '오늘',
        subject: parts[1] || cleanName
      };
    });

    saveJson(path.join(DAILY_TESTS_DIR, "tests_index.json"), { tests });
    console.log("✅ tests_index.json 갱신 완료!");
  } catch (error) {
    console.error("❌ tests_index.json 갱신 실패:", error.message);
  }
}

// 📤 GitHub Pages 자동 원격 배포(Git Push) 시도
function autoGitPush() {
  console.log("\n🚀 GitHub Pages 자동 원격 배포(Git Push)를 시도합니다...");
  try {
    // git이 초기화되어 있는지 체크
    if (!fs.existsSync(".git")) {
      console.log("ℹ️ .git 폴더가 존재하지 않아 Git Push를 스킵합니다.");
      return;
    }

    // git status 체크해서 변경된 파일이 있는지 확인
    const status = execSync("git status --porcelain", { encoding: "utf8" });
    if (!status.trim()) {
      console.log("ℹ️ 변경되거나 새로 생성된 시험지 파일이 없습니다. Git Push를 건너뜁니다.");
      return;
    }

    console.log("📦 Git 스테이징 추가 중 (git add public/daily_tests/)...");
    execSync("git add public/daily_tests/", { stdio: "inherit" });
    
    const commitMsg = `Add daily RAG exam for ${getTodayString()}`;
    console.log(`💬 Git 커밋 중 (git commit -m "${commitMsg}")...`);
    execSync(`git commit -m "${commitMsg}"`, { stdio: "inherit" });

    console.log("📤 GitHub Pages 원격지 전송 중 (git push)...");
    execSync("git push", { stdio: "inherit" });
    console.log("🎉 GitHub Pages 원격 배포에 성공했습니다! 수초 내로 실시간 반영됩니다.");
  } catch (error) {
    console.error("❌ Git 자동 배포 도중 에러가 발생했습니다:", error.message);
    console.warn("⚠️ Mac 로컬 Git 인증이 되어있지 않거나, 원격 저장소가 없을 수 있습니다. 직접 터미널에서 'git push'를 구성하거나 수동 배포해야 할 수 있습니다.");
  }
}

async function runQuizGeneration(client, notebookId, subjectKey, subjectName, docGuideName, count) {
  console.log(`\n📚 [${subjectName}] 문제지 생성 프로세스 시작...`);

  // 🎯 가상 로컬 ID가 문자열로 기입되더라도 숫자형으로 안전 변환하는 자가 치유 방어 로직
  let targetNotebookId = notebookId;
  if (typeof notebookId === 'string' && /^-?\d+$/.test(notebookId)) {
    targetNotebookId = parseInt(notebookId, 10);
  }

  // 🎯 과목에 특화된 RAG 노트북 ID를 실시간으로 교체 및 활성화 보장
  try {
    console.log(`🎯 [${subjectName}] 전용 RAG 노트북 활성화 중 (ID: ${targetNotebookId})...`);
    await client.callTool({
      name: "select_notebook",
      arguments: { id: targetNotebookId }
    });
  } catch (err) {
    console.warn(`⚠️ [${subjectName}] select_notebook 호출 실패:`, err.message);
  }

  // 1. 역사 및 오답 데이터 불러오기 (민법 'civil' 필드도 안전 지원)
  const historyData = loadJson(HISTORY_PATH, { accounting: [], facility: [], civil: [] });
  const incorrectData = loadJson(INCORRECT_PATH, { accounting: [], facility: [], civil: [] });

  const subjectHistory = historyData[subjectKey] || [];
  const subjectIncorrect = incorrectData[subjectKey] || [];

  // 프롬프트 가독성을 위한 문자열 가공
  const historySnippet = subjectHistory.length > 0 
    ? subjectHistory.slice(-50).map((h, idx) => `- ${h}`).join("\n") // 성능과 프롬프트 크기를 고려해 최근 50개 제한
    : "없음 (최초 출제)";

  const incorrectSnippet = subjectIncorrect.length > 0
    ? subjectIncorrect.map((item, idx) => {
        const cnt = item.count || 1;
        const weight = calculateWeight(cnt);
        return `- 취약점/개념: "${item.concept}" (누적 오답: ${cnt}회, 반영 비중 가중치: ${weight}%, 피드백 날짜: ${item.date})`;
      }).join("\n")
    : "없음 (현재 오답 리스트가 비어있습니다)";

  // 2. 고성능 출제 프롬프트 작성
  const prompt = `
당신은 대한민국 주택관리사보 자격시험의 최고 권위 출제위원입니다. 
제공된 노트북 소스 중 **"${docGuideName}"** 문서를 반드시 집중 참조하여, 수험생을 위한 고품질 기출 변형 문제지(${count}문제)를 만들어 주십시오.

### [출제 및 구성 조건]
1. **과목**: ${subjectName}
2. **출제 문항 수**: ${count}문제
3. **최우선 반영 사항 (오답 노트 및 누진 가중치)**:
   다음 오답 목록은 수험생이 최근에 틀렸던 개념들과 틀린 횟수에 기초해 동적으로 계산된 개별 반영 가중치(%)입니다. 
   각 오답 개념에 표기된 가중치(%) 비중에 걸맞게, 더 높은 가중치를 지닌 취약 개념들을 최우선순위로 삼아 이와 직간접적으로 연관된 변형 문제를 더 많이 안배(전체 출제 비중의 약 20%~35% 내외)하여 출제해 주십시오.
   ---
   [오답 목록]
   ${incorrectSnippet}
   ---
4. **중복 배제 규칙**:
   다음은 수험생이 이전에 이미 풀었던 문제의 정보(일부 본문 또는 식별 정보)입니다. 이 문제들과 완전히 동일하거나 거의 유사한 문제는 절대로 출제에서 제외해 주십시오.
   ---
   [이미 출제된 리스트]
   ${historySnippet}
   ---
5. **문제집 서식 및 서식 준수 규칙 (매우 중요)**:
   - 인사말, 출제 경향 분석, 과목 소개, 수험생을 격려하는 글 등 문제와 해설 외의 사족(예: "안녕하십니까...", "Q1~Q2를 반영하여...")은 **절대로** 작성하지 마십시오.
   - 텍스트의 맨 처음은 아무런 잡설 없이 곧바로 '## [시험 문제지]' 헤더로 시작하십시오.
   - 각 문항은 **반드시** '1. ', '2. ', '3. ' 와 같이 **아라비아 숫자와 마침표(온점) 및 공백**으로 시작하여야 합니다. 문제 번호를 생략하고 바로 문제 지문을 작성하는 것은 **절대로 금지**됩니다. (예: '1. ', '2. ' 등. 절대로 'Q1.', '문 1.', '[1]' 등으로 시작하지 마십시오.)
   - 보기는 반드시 '①', '②', '③', '④', '⑤' 기호만을 사용하고, 각 보기는 한 줄에 하나씩 줄바꿈하여 작성하십시오.
   - 문제 본문이나 보기 내용 중에 'Q1', 'Q2' 등 문제 번호와 혼동될 수 있는 표현은 포함하지 마십시오.
   - **반드시** 문제지 맨 마지막 섹션에 모든 문항의 '## [정답 및 상세 해설]'을 작성해 주십시오.
   - 해설 작성 시 각 문항의 정답은 '정답: ①' 또는 '정답: ②' 형태로 명확하게 표기해 주십시오.
`;

  console.log(`ℹ️ RAG 질의 전송 중 (오답 반영 수: ${subjectIncorrect.length}개, 제외 기록 수: ${subjectHistory.length}개)...`);
  
  // 3. MCP notebooklm-mcp `ask_question` 도구 호출
  const result = await client.callTool({
    name: "ask_question",
    arguments: {
      question: prompt,
      notebook_id: targetNotebookId,
      browser_options: {
        timeout_ms: 900000 // 내부 브라우저 Puppeteer 타임아웃을 15분으로 세팅
      }
    }
  }, undefined, {
    timeout: 950000 // MCP 클라이언트 호출 타임아웃은 브라우저보다 더 넉넉하게 (15.8분)
  });

  // MCP 응답 텍스트 추출
  const generatedText = result.content[0].text;
  let quizMarkdown = generatedText;

  // 💡 [RAG 에러 차단막] MCP 응답이 RAG 에러를 리턴했거나 JSON 형식의 에러인지 철저히 검사
  if (!generatedText || generatedText.includes('"success": false') || generatedText.includes('Could not find NotebookLM') || generatedText.includes('Failed to load')) {
    throw new Error(`RAG 1차 추출 과정에서 오류가 발생했습니다: ${generatedText}`);
  }

  // 💡 notebooklm-mcp 응답이 JSON 오브젝트 스트링인 경우 진짜 마크다운 텍스트만 언패킹
  try {
    if (typeof generatedText === 'string' && (generatedText.trim().startsWith('{') || generatedText.trim().startsWith('['))) {
      const parsedRes = JSON.parse(generatedText);
      if (parsedRes && parsedRes.success === false) {
        throw new Error(`RAG 1차 추출이 내부 실패했습니다: ${parsedRes.error || JSON.stringify(parsedRes)}`);
      }
      if (parsedRes && parsedRes.data && parsedRes.data.answer) {
        quizMarkdown = parsedRes.data.answer;
      } else if (parsedRes && parsedRes.answer) {
        quizMarkdown = parsedRes.answer;
      }
    }
  } catch (e) {
    if (e.message.includes('RAG 1차 추출')) throw e;
    console.log("ℹ️ Response is a plain markdown string, saving as-is.");
  }

  // 3.5 구글 Gemini API (무료) 기반 2차 정밀 검증 및 철벽 교정 레이어 적용
  try {
    const verifiedMarkdown = await verifyQuizWithGemini(quizMarkdown, subjectName, docGuideName);
    quizMarkdown = verifiedMarkdown;
  } catch (err) {
    console.error(`🚨 [${subjectName}] Gemini 2차 검증 도중 치명적 에러 발생:`, err.message);
    console.warn(`⚠️ [${subjectName}] 검증 오류로 인해 RAG 1차 초안 텍스트를 그대로 최종 저장합니다.`);
  }

  // 4. 결과 파일 저장
  const today = getTodayString();
  const fileName = `${today}_${subjectName}.md`;
  const filePath = path.join(DAILY_TESTS_DIR, fileName);

  fs.writeFileSync(filePath, quizMarkdown, "utf8");
  console.log(`✅ [${subjectName}] 문제지 저장 완료: ${filePath}`);

  // 5. history.json 업데이트
  const historyStamp = `[출제일: ${today}] ${subjectName} ${count}개 문제 출제 완료`;
  subjectHistory.push(historyStamp);
  historyData[subjectKey] = subjectHistory;
  saveJson(HISTORY_PATH, historyData);
  console.log(`💾 [${subjectName}] 출제 이력 업데이트 완료.`);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("==================================================");
  console.log("     주택관리사보 데일리 문제 추출 에이전트      ");
  console.log("==================================================");

  // 1. 설정 확인
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("❌ 에러: 설정 파일이 존재하지 않습니다.");
    console.error("👉 먼저 'npm run setup'을 실행해 구글 로그인 및 노트북 설정을 완료해 주세요.");
    process.exit(1);
  }

  const config = loadJson(CONFIG_PATH, {});
  const notebooks = config.notebooks || {};

  if (!fs.existsSync(DAILY_TESTS_DIR)) {
    fs.mkdirSync(DAILY_TESTS_DIR, { recursive: true });
  }

  // 2. MCP 연결
  console.log("🔄 NotebookLM MCP 서버에 연결하는 중...");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "notebooklm-mcp@latest"],
    env: { ...process.env, npm_config_cache: "/tmp/npm_cache" }
  });

  const client = new Client({
    name: "notebooklm-study-agent",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  try {
    await client.connect(transport);
    console.log("✅ MCP 에이전트 연결 완료!");

    // 💡 생성 시작 전 Gist와 동기화
    await syncGistIncorrectAnswers();

    // 4. 과목별로 선택 가동 (인자 지정 시 단일 과목 추출 지원)
    const targetSubject = process.argv[2]; // 'facility' 또는 'accounting' 또는 'civil'

    if (!targetSubject || targetSubject === 'accounting') {
      try {
        const accNotebookId = notebooks.accounting ? notebooks.accounting.id : -1;
        // 4-1. 회계원리 (35문제)
        await runQuizGeneration(
          client, 
          accNotebookId, 
          "accounting", 
          "회계원리", 
          "회계관리 기출 핵심 분석 및 출제 비중 가이드", 
          35
        );
      } catch (err) {
        console.error("❌ [회계원리] 생성 프로세스 최종 실패:", err.message);
      }
      if (!targetSubject) {
        console.log("⏳ 브라우저 충돌 및 락(Lock) 방지를 위해 15초간 대기 중...");
        await sleep(15000);
      }
    }

    if (!targetSubject || targetSubject === 'facility') {
      try {
        const facNotebookId = notebooks.facility ? notebooks.facility.id : -1;
        // 4-2. 시설개론 (25문제)
        await runQuizGeneration(
          client, 
          facNotebookId, 
          "facility", 
          "시설개론", 
          "공동주택시설개론 기출 분석 및 출제 비중 가이드", 
          25
        );
      } catch (err) {
        console.error("❌ [시설개론] 생성 프로세스 최종 실패:", err.message);
      }
      if (!targetSubject) {
        console.log("⏳ 브라우저 충돌 및 락(Lock) 방지를 위해 15초간 대기 중...");
        await sleep(15000);
      }
    }

    if (!targetSubject || targetSubject === 'civil') {
      try {
        const civilNotebookId = notebooks.civil ? notebooks.civil.id : -1;
        // 4-3. 민법 (25문제)
        await runQuizGeneration(
          client, 
          civilNotebookId, 
          "civil", 
          "민법", 
          "주택관리사 민법 시험 출제 경향 및 핵심 분석", 
          25
        );
      } catch (err) {
        console.error("❌ [민법] 생성 프로세스 최종 실패:", err.message);
      }
    }

    console.log("\n🎉 모든 과목의 오늘의 데일리 문제지 추출이 정상 완료되었습니다!");

    // 💡 갱신 및 배포
    updateTestsIndex();
    autoGitPush();

  } catch (error) {
    console.error("❌ 에러: 에이전트 실행 중 오류가 발생했습니다:", error);
  } finally {
    try {
      await transport.close();
    } catch (_) {}
    console.log("👋 에이전트가 정상적으로 종료되었습니다.");
    process.exit(0);
  }
}

main();
