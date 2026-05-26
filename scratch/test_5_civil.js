import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import { verifyQuizWithGemini } from '../lib/gemini.js';
import { compileInteractiveHtmlViaBrowser } from '../lib/gemini_browser.js';

const CONFIG_PATH = path.resolve("data", "config.json");
const DAILY_TESTS_DIR = path.resolve("public", "daily_tests");

function loadJson(filePath, defaultValue) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      console.warn(`⚠️ Warning: Failed to parse ${filePath}.`);
    }
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// tests_index.json 로컬 인덱서 갱신
function updateTestsIndex() {
  console.log("📊 정적 시험지 인덱스(tests_index.json)를 갱신하는 중...");
  try {
    const files = fs.readdirSync(DAILY_TESTS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a));
    
    const tests = files.map(file => {
      const cleanName = file.replace('.md', '');
      const parts = cleanName.split('_');
      const date = parts[0] || '오늘';
      const subject = parts[1] || cleanName;

      const htmlFilename = `${date}_${subject}_interactive.html`;
      const hasInteractive = fs.existsSync(path.join(DAILY_TESTS_DIR, htmlFilename));

      return {
        filename: file,
        date: date,
        subject: subject,
        interactive: hasInteractive,
        htmlFilename: hasInteractive ? htmlFilename : null
      };
    });

    saveJson(path.join(DAILY_TESTS_DIR, "tests_index.json"), { tests });
    console.log("✅ tests_index.json 갱신 완료!");
  } catch (error) {
    console.error("❌ tests_index.json 갱신 실패:", error.message);
  }
}

async function testCivilFiveQuestions() {
  console.log("==================================================");
  console.log(" ⚖️ [민법 5문제 테스트] 원스톱 자동화 파이프라인 구동 ");
  console.log("==================================================");

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("❌ 설정 파일(data/config.json)을 찾을 수 없습니다.");
    process.exit(1);
  }

  const config = loadJson(CONFIG_PATH, {});
  const notebooks = config.notebooks || {};
  const civilNotebookId = notebooks.civil ? notebooks.civil.id : -1;

  if (civilNotebookId === -1) {
    console.error("❌ 민법 노트북 ID 설정이 데이터베이스에 존재하지 않습니다.");
    process.exit(1);
  }

  console.log("🔄 NotebookLM MCP 서버에 연결하는 중...");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "notebooklm-mcp@latest"],
    env: { ...process.env, npm_config_cache: "/tmp/npm_cache" }
  });

  const client = new Client({
    name: "civil-5-tester",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  try {
    await client.connect(transport);
    console.log("✅ MCP 에이전트 연결 완료!");

    console.log(`🎯 민법 RAG 노트북 선택 활성화 중 (ID: ${civilNotebookId})...`);
    await client.callTool({
      name: "select_notebook",
      arguments: { id: civilNotebookId }
    });

    const subjectName = "민법5문제-TEST";
    const docGuideName = "주택관리사 민법 시험 출제 경향 및 핵심 분석";

    const prompt = `
당신은 대한민국 주택관리사보 자격시험의 최고 권위 출제위원입니다. 
제공된 노트북 소스 중 **"${docGuideName}"** 문서를 참조하여, 수험생을 위한 고품질 기출 변형 문제지를 작성해 주십시오.

### [출제 및 구성 조건]
1. **과목**: 민법 (총 5문항 출제)
2. **범위/단원**: 민법총칙 상편 (권리변동의 기본원칙, 권리의 주체/객체)
3. **문제 번호 시작**: 이 단계에서 출제할 문제 번호는 **1번부터 5번까지**입니다. (각 문항의 번호는 반드시 '1. ', '2. ' 와 같이 매겨주십시오.)
4. **문제집 서식 및 규칙**:
   - 인사말, 잡설 없이 곧바로 '## [시험 문제지]' 헤더로 시작하십시오.
   - 보기는 반드시 '①', '②', '③', '④', '⑤' 기호만을 사용하고, 각 보기는 한 줄에 하나씩 줄바꿈하여 작성하십시오.
   - **반드시** 이 파트의 마지막 섹션에 '## [정답 및 상세 해설]'을 작성해 주십시오.
   - 해설 작성 시 각 문항의 정답은 '정답: ①' 형태로 명확하게 표기해 주십시오.
`;

    console.log("⚡ [Pass 1] NotebookLM MCP로부터 1차 5문제 원시 드래프트 추출 중...");
    const result = await client.callTool({
      name: "ask_question",
      arguments: {
        question: prompt,
        notebook_id: civilNotebookId,
        browser_options: {
          timeout_ms: 120000
        }
      }
    }, undefined, {
      timeout: 330000
    });

    let generatedText = result.content[0].text;

    // JSON 언패킹 가드
    if (typeof generatedText === 'string' && (generatedText.trim().startsWith('{') || generatedText.trim().startsWith('['))) {
      const parsedRes = JSON.parse(generatedText);
      generatedText = parsedRes.data?.answer || parsedRes.answer || generatedText;
    }

    console.log(`✅ 원시 드래프트 추출 완료 (크기: ${generatedText.length} 자)`);

    console.log("🪐 [Pass 2] 구글 Gemini API를 호출하여 오류 정밀 검증 및 교정 수행 중...");
    const verifiedMarkdown = await verifyQuizWithGemini(generatedText, "민법", docGuideName);

    // 💡 [자원 반환 및 크롬 프로필 락 해제]
    // 3차 브라우저 수확기가 동일한 chrome_profile 폴더를 독점해서 사용할 수 있도록 
    // NotebookLM MCP 클라이언트를 먼저 명시적으로 닫아줍니다!
    console.log("🧹 3차 수확기 기동을 위해 NotebookLM MCP 세션을 안전하게 반환 중...");
    try {
      await transport.close();
    } catch (_) {}

    console.log("🪐 [Pass 3] Gemini Browser Automation 기반의 단일 파일 인터랙티브 HTML 웹앱으로 화려하게 컴파일 중...");
    const interactiveHtml = await compileInteractiveHtmlViaBrowser(verifiedMarkdown, "민법", "civil");

    // 결과 파일 저장
    const today = getTodayString();
    const mdPath = path.join(DAILY_TESTS_DIR, `${today}_${subjectName}.md`);
    const htmlPath = path.join(DAILY_TESTS_DIR, `${today}_${subjectName}_interactive.html`);

    fs.writeFileSync(mdPath, verifiedMarkdown, "utf8");
    console.log(`✅ [마크다운 저장 완료]: ${mdPath}`);

    if (interactiveHtml) {
      fs.writeFileSync(htmlPath, interactiveHtml, "utf8");
      console.log(`✅ [인터랙티브 HTML 저장 완료]: ${htmlPath}`);
    } else {
      console.error("❌ 에러: HTML 컴파일러가 빈 결과를 리턴했습니다.");
    }

    updateTestsIndex();
    console.log("\n🎉 민법 5문제 자동화 컴파일 테스트가 성공적으로 완료되었습니다!");

  } catch (error) {
    console.error("❌ 테스트 프로세스 도중 오류 발생:", error);
  } finally {
    try {
      await transport.close();
    } catch (_) {}
    process.exit(0);
  }
}

testCivilFiveQuestions();
