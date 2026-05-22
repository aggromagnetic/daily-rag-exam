import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const CONFIG_PATH = path.resolve("data", "config.json");

// 과목별 노트북 사전 정의 정보 (민법 포함)
const SUBJECT_NOTEBOOKS = {
  accounting: {
    name: "회계원리 시험 기출 분석",
    url: "https://notebooklm.google.com/notebook/7c698308-fc7b-4223-a05c-b5c33cfbd70b?authuser=1",
    shortId: "7c698308-fc7b-4223-a05c-b5c33cfbd70b",
    topics: ["회계원리", "주택관리사보"]
  },
  facility: {
    name: "시설개론 시험 기출 분석",
    url: "https://notebooklm.google.com/notebook/7c698308-fc7b-4223-a05c-b5c33cfbd70b?authuser=1",
    shortId: "7c698308-fc7b-4223-a05c-b5c33cfbd70b",
    topics: ["시설개론", "주택관리사보"]
  },
  civil: {
    name: "민법 시험 기출 분석",
    url: "https://notebooklm.google.com/notebook/3970b9b2-4087-440c-9fe3-dd10ef66bade?authuser=1",
    shortId: "3970b9b2-4087-440c-9fe3-dd10ef66bade",
    topics: ["민법", "주택관리사보"]
  }
};

// 입력 헬퍼
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  console.log("==================================================");
  console.log("   주택관리사보 2.0 다중 과목 RAG 셋업 유틸리티    ");
  console.log("==================================================");

  // data 디렉토리 보장
  if (!fs.existsSync("data")) {
    fs.mkdirSync("data");
  }

  // 1. MCP Transport 및 Client 생성
  console.log("🔄 NotebookLM MCP 서버를 시작하는 중...");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "notebooklm-mcp@latest"],
    env: { ...process.env, npm_config_cache: "/tmp/npm_cache" }
  });

  const client = new Client({
    name: "notebooklm-study-setup",
    version: "2.0.0"
  }, {
    capabilities: {}
  });

  try {
    await client.connect(transport);
    console.log("✅ MCP 서버와 연결되었습니다!");

    // 2. Google OAuth 인증 단계
    console.log("\n🔑 [1단계] Google 계정 로그인 인증을 진행합니다.");
    console.log("👉 이 작업은 크롬 브라우저가 열려 수동으로 구글 로그인을 진행합니다.");
    console.log("👉 로그인이 완료되면 이 터미널로 돌아와 Enter 키를 눌러주세요.\n");
    
    await askQuestion("계속하려면 [Enter] 키를 누르세요. 브라우저가 실행됩니다...");

    // setup_auth 도구 호출
    console.log("🔄 브라우저 창을 띄우는 중...");
    await client.callTool({
      name: "setup_auth",
      arguments: {}
    });

    console.log("🔓 브라우저 창이 열렸습니다. Google 계정 로그인을 완료해 주세요.");
    await askQuestion("구글 로그인을 정상적으로 완료하셨다면, 계속하기 위해 [Enter] 키를 누르세요...");

    // 3. 과목별 노트북 순차 등록
    console.log(`\n📚 [2단계] 다중 과목 RAG 노트북 등록 시작...`);
    const registeredNotebooks = {};

    for (const [subjectKey, info] of Object.entries(SUBJECT_NOTEBOOKS)) {
      console.log(`\n▶️ [${info.name}] 라이브러리 등록 시도 중...`);
      const addResult = await client.callTool({
        name: "add_notebook",
        arguments: {
          url: info.url,
          name: info.name,
          description: `${info.name}에 필요한 RAG 분석 컨텍스트`,
          topics: info.topics
        }
      }, undefined, {
        timeout: 900000 // 15분 타임아웃
      });
      console.log(`✅ [${info.name}] 등록 완료.`);

      // 라이브러리 목록 확인을 통한 실시간 내부 ID 획득
      console.log("🔄 라이브러리 동기화 및 내부 고유 ID 조회 중...");
      const listResult = await client.callTool({
        name: "list_notebooks",
        arguments: {}
      });

      let resolvedId = "";
      if (listResult && listResult.content && listResult.content[0] && listResult.content[0].text) {
        try {
          const parsed = JSON.parse(listResult.content[0].text);
          const notebooksList = Array.isArray(parsed)
            ? parsed
            : (parsed.data && Array.isArray(parsed.data.notebooks) ? parsed.data.notebooks : []);

          // URL 기반 매칭
          const matched = notebooksList.find(n => n.url && n.url.includes(info.shortId));
          if (matched) {
            resolvedId = matched.id;
          }
        } catch (_) {}
      }

      if (!resolvedId) {
        // 백업 추출
        resolvedId = info.shortId;
      }

      console.log(`🎯 배정된 고유 ID: ${resolvedId}`);
      registeredNotebooks[subjectKey] = {
        id: resolvedId,
        url: info.url,
        name: info.name
      };
    }

    // 4. 로컬 설정 저장
    const config = {
      notebooks: registeredNotebooks,
      initializedAt: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    console.log(`\n💾 2.0 설정 파일이 저장되었습니다: ${CONFIG_PATH}`);
    console.log("🎉 다중 과목 RAG 에이전트 초기 셋업이 성공적으로 완료되었습니다!");

  } catch (error) {
    console.error("❌ 셋업 중 에러가 발생했습니다:", error);
  } finally {
    try {
      await transport.close();
    } catch (_) {}
    process.exit(0);
  }
}

main();
