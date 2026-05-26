import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { verifyQuizWithGemini } from './lib/gemini.js';
import { compileInteractiveHtmlViaBrowser } from './lib/gemini_browser.js';

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

// 🎲 오답 노하우 가중치 기반 확률적 추첨 (Ebbinghaus spaced repetition 대비 추첨 기법)
function selectIncorrectAnswersForToday(subjectIncorrect, maxSelect = 2) {
  if (!subjectIncorrect || subjectIncorrect.length === 0) return [];
  
  const listWithWeights = subjectIncorrect.map(item => {
    const cnt = item.count || 1;
    const weight = calculateWeight(cnt);
    return { ...item, calculatedWeight: weight };
  });
  
  const scoredList = listWithWeights.map(item => {
    const score = item.calculatedWeight * Math.random();
    return { ...item, score };
  });
  
  scoredList.sort((a, b) => b.score - a.score);
  const selected = scoredList.slice(0, maxSelect);
  
  console.log(`🎲 [오답 추첨] 전체 ${subjectIncorrect.length}개 오답 중 ${selected.length}개 선별 완료 (추첨된 취약 개념: ${selected.map(s => s.concept).join(", ")})`);
  return selected;
}

// 📝 생성된 문제지 마크다운에서 구체적인 문항 요약(Q1~QN)을 파싱하여 history.json 기입용
function extractQuestionSummaries(markdown) {
  const lines = markdown.split('\n');
  const questions = [];
  const questionRegex = /^\s*(\d+)[\.번]\s*(.+)$/;
  
  for (let line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(questionRegex);
    if (match) {
      const qNum = match[1];
      let qText = match[2].trim();
      const optionIndex = qText.search(/[①-⑤]/);
      if (optionIndex !== -1) {
        qText = qText.substring(0, optionIndex).trim();
      }
      if (qText.length > 80) {
        qText = qText.substring(0, 80) + "...";
      }
      questions.push(`Q${qNum}: ${qText}`);
    }
  }
  
  if (questions.length === 0) {
    return ["상세 문항 요약이 파싱되지 않았습니다. 전체 컨텐츠 중복 배제 적용 요망."];
  }
  return questions;
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

// 🪐 과목별 단원 분할 구성 정보 (대용량 RAG 타임아웃 방지용)
const SUBJECT_PARTITIONS = {
  accounting: [
    {
      step: 1,
      title: "재무회계 상편 1 (회계의 기초 원리, 개념체계 및 재무제표 표시)",
      count: 6
    },
    {
      step: 2,
      title: "재무회계 상편 2 (자산론 1 - 현금및현금성자산, 매출채권 및 손실충당금)",
      count: 6
    },
    {
      step: 3,
      title: "재무회계 상편 3 (자산론 2 - 재고자산, 유형자산, 무형자산 및 투자부동산)",
      count: 6
    },
    {
      step: 4,
      title: "재무회계 하편 1 (금융부채, 충당부채, 우발부채 및 우발자산, 자본거래)",
      count: 6
    },
    {
      step: 5,
      title: "재무회계 하편 2 (수익인식, 회계변경 및 오류수정, 현금흐름표 등)",
      count: 6
    },
    {
      step: 6,
      title: "원가관리회계 (원가흐름, 부문별/개별/종합/결합원가계산, CVP분석, 단기의사결정 등)",
      count: 5
    }
  ],
  facility: [
    {
      step: 1,
      title: "건축구조 및 시공 1 (토공사, 기초구조, 조적구조)",
      count: 5
    },
    {
      step: 2,
      title: "건축구조 및 시공 2 (철근콘크리트구조, 철골구조, 지붕/방수/수장 등)",
      count: 5
    },
    {
      step: 3,
      title: "건축설비 1 (급수설비, 급탕설비, 배수 및 통기설비)",
      count: 5
    },
    {
      step: 4,
      title: "건축설비 2 (소방설비, 가스설비, 난방 및 환기설비)",
      count: 5
    },
    {
      step: 5,
      title: "건축설비 3 (전기설비, 홈네트워크설비, 승강기설비 등)",
      count: 5
    }
  ],
  civil: [
    {
      step: 1,
      title: "민법총칙 1 (권리변동의 기본원칙, 권리의 주체/객체)",
      count: 5
    },
    {
      step: 2,
      title: "민법총칙 2 (법률행위 - 의사표시, 대리, 무효와 취소, 조건과 기한, 소멸시효)",
      count: 5
    },
    {
      step: 3,
      title: "물권법 1 (물권법 총론, 점유권, 소유권)",
      count: 5
    },
    {
      step: 4,
      title: "물권법 2 (용익물권, 담보물권 - 유치권/저당권 등)",
      count: 5
    },
    {
      step: 5,
      title: "채권/계약법 (채권법 총론, 계약총론, 계약각론 등)",
      count: 5
    }
  ]
};

// 🧩 마크다운 초안에서 문제지와 해설 파트를 분할 추출하는 헬퍼 함수
function splitQuestionsAndExplanations(md) {
  const headers = [
    "## [정답 및 상세 해설]",
    "### [정답 및 상세 해설]",
    "[정답 및 상세 해설]",
    "## 정답 및 상세 해설",
    "정답 및 상세 해설",
    "## 정답 및 해설",
    "정답 및 해설",
    "## [정답 및 해설]",
    "## 해설",
    "## 정답",
    "정답과 해설",
    "정답 및 풀이"
  ];
  
  let headerIndex = -1;
  let selectedHeader = "";
  for (const header of headers) {
    const idx = md.indexOf(header);
    if (idx !== -1) {
      headerIndex = idx;
      selectedHeader = header;
      break;
    }
  }
  
  let qPart = md;
  let ePart = "";
  
  if (headerIndex !== -1) {
    qPart = md.substring(0, headerIndex).trim();
    ePart = md.substring(headerIndex + selectedHeader.length).trim();
  }
  
  const qHeaders = [
    "## [시험 문제지] (제2부: 21번부터)",
    "## [시험 문제지] (제2부: 13번부터)",
    "## [시험 문제지] (제3부: 25번부터)",
    "## [시험 문제지]",
    "### [시험 문제지]",
    "## 시험 문제지",
    "시험 문제지",
    "## 문제지",
    "문제지"
  ];
  for (const qH of qHeaders) {
    if (qPart.startsWith(qH)) {
      qPart = qPart.substring(qH.length).trim();
      break;
    }
  }
  
  return { questions: qPart, explanations: ePart };
}

async function runQuizGeneration(client, notebookId, subjectKey, subjectName, docGuideName, count) {
  console.log(`\n📚 [${subjectName}] 문제지 생성 프로세스 시작... (총 ${count}문항 단원별 분할출제 기동)`);

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

  // 프롬프트 가독성을 위한 문자열 가공 (중복 방지 역사 메모리 강화)
  // 너무 비대한 역사 정보로 인한 브라우저 다운 및 RAG 연산 타임아웃 방지를 위해 최대 400자 이내로 자동 생략 압축합니다.
  let rawHistorySnippet = subjectHistory.length > 0 
    ? subjectHistory.slice(-1).join("\n\n")
    : "없음 (최초 출제)";
  if (rawHistorySnippet.length > 400) {
    rawHistorySnippet = rawHistorySnippet.substring(0, 400) + "... [생략됨. 최근 출제 문제와 유사하지 않도록 고르게 참신하게 출제해 주세요]";
  }
  const historySnippet = rawHistorySnippet;

  // 🎯 가중치 확률적 추첨 기법 적용: 전체 오답 중 오늘 시험지에 녹여낼 핵심 취약개념 2개 무작위 추첨
  const selectedIncorrect = selectIncorrectAnswersForToday(subjectIncorrect, 2);

  const incorrectSnippet = selectedIncorrect.length > 0
    ? selectedIncorrect.map((item, idx) => {
        const cnt = item.count || 1;
        const weight = calculateWeight(cnt);
        return `- 취약점/개념: "${item.concept}" (누적 오답: ${cnt}회, 반영 비중 가중치: ${weight}%, 피드백 날짜: ${item.date})`;
      }).join("\n")
    : "없음 (현재 추첨된 오답 개념이 없거나 오답 리스트가 비어있습니다. 일반 커리큘럼 기준 고르게 출제해 주세요.)";

  // 🚀 순차 분할 RAG 생성 루틴 작동
  const partitions = SUBJECT_PARTITIONS[subjectKey] || [{ step: 1, title: "전체 범위", count: count }];
  const questionsChunks = [];
  const explanationsChunks = [];
  let sessionId = undefined; // 동일한 브라우저 세션(대화 내용) 연속 유지를 위한 변수
  let startQuestionNum = 1;

  for (let i = 0; i < partitions.length; i++) {
    const part = partitions[i];
    const endQuestionNum = startQuestionNum + part.count - 1;
    const isFirstStep = (i === 0);
    const sessionStatus = sessionId ? "유지 중" : "최초 시작";

    console.log(`\n⚡ [${subjectName}] [Step ${i + 1}/${partitions.length}] RAG 질의 수행 중... (단원: ${part.title}, 출제수: ${part.count}문제)`);
    console.log(`ℹ️ [Step ${i + 1}] RAG 질의 전송 중... (세션 ID 보존 상태: ${sessionStatus})`);

    const prompt = `
당신은 대한민국 주택관리사보 자격시험의 최고 권위 출제위원입니다. 
제공된 노트북 소스 중 **"${docGuideName}"** 문서를 반드시 집중 참조하여, 수험생을 위한 고품질 기출 변형 문제지 중 **[제 ${i + 1}단계 분할 출제]** 파트를 작성해 주십시오.

### [출제 및 구성 조건]
1. **과목**: ${subjectName} (총 ${count}문항 중 이번 단계에서는 **${part.count}문항** 출제)
2. **범위/단원**: ${part.title}
3. **문제 번호 시작**: 이 단계에서 출제할 문제 번호는 **${startQuestionNum}번부터 ${endQuestionNum}번까지**입니다. (각 문항의 번호는 반드시 '${startQuestionNum}. ', '${startQuestionNum + 1}. ' 와 같이 시작하여야 하며, 문제 번호를 생략하거나 다르게 매겨서는 절대로 안 됩니다!)
${isFirstStep ? `
4. **최우선 반영 사항 (오답 및 누진 가중치)**:
   다음 오답 목록은 수험생이 그동안 틀렸던 전체 오답 중 특별히 안배대상으로 선정된 취약 개념입니다. 이와 관련된 변형 문제를 이번 범위 내에 자연스럽게 1~2문제 녹여 출제해 주십시오.
   ---
   [오늘 출제할 오답 목록]
   ${incorrectSnippet}
   ---
` : ''}
4. **중복 배제 규칙 (극도로 중요 - 절대 동일 문제 출제 금지)**:
   다음 리스트에 등장하는 질문, 보기 구조, 계산 조건 또는 정답 구도와 **완전히 동일하거나 극도로 유사한(숫자만 살짝 바꾼 수준 등) 문제는 절대로, 단 한 문제도 중복 출제해서는 안 됩니다.**
   반드시 새로운 유형, 새로운 관점, 다른 계산 요소를 적용하여 '완전히 새로운 참신한 변형 문제'를 설계해 주십시오.
   ---
   [이미 출제되었던 리스트 (중복 배제 필수)]
   ${historySnippet}
   ---
5. **문제집 서식 및 규칙 (매우 중요)**:
   - 인사말, 출제 경향 분석, 수험생을 격려하는 글 등 문제와 해설 외의 사족(예: "안녕하십니까...", "Q1~Q2를 반영하여...")은 **절대로** 작성하지 마십시오.
   - 텍스트의 맨 처음은 아무런 잡설 없이 곧바로 '## [시험 문제지]' 헤더로 시작하십시오.
   - 각 문항은 **반드시** '${startQuestionNum}. ', '${startQuestionNum + 1}. ' 와 같이 **아라비아 숫자와 마침표(온점) 및 공백**으로 시작하여야 합니다. 문제 번호를 생략하고 바로 문제 지문을 작성하는 것은 **절대로 금지**됩니다.
   - 보기는 반드시 '①', '②', '③', '④', '⑤' 기호만을 사용하고, 각 보기는 한 줄에 하나씩 줄바꿈하여 작성하십시오.
   - 문제 본문이나 보기 내용 중에 'Q1', 'Q2' 등 문제 번호와 혼동될 수 있는 표현은 포함하지 마십시오.
   - **반드시** 이 파트의 마지막 섹션에 이번에 출제한 문항들의 '## [정답 및 상세 해설]'을 작성해 주십시오.
   - 해설 작성 시 각 문항의 정답은 '정답: ①' 형태로 명확하게 표기해 주십시오.
`;

    let stepMarkdown = "";
    let retryCount = 0;
    const maxRetries = 3;
    let stepSuccess = false;

    while (retryCount < maxRetries && !stepSuccess) {
      try {
        if (retryCount > 0) {
          console.log(`⚠️ [${subjectName}] [Step ${i + 1}] [재시도 ${retryCount}/${maxRetries}] RAG 오류 혹은 답변 거절(Soft Refusal)이 감지되어 15초 후 재시도합니다...`);
          await sleep(15000);
        }

        const askArguments = {
          question: prompt,
          notebook_id: targetNotebookId,
          browser_options: {
            timeout_ms: 900000,
            stealth: {
              human_typing: false
            }
          }
        };

        if (sessionId) {
          askArguments.session_id = sessionId;
        }

        const result = await client.callTool({
          name: "ask_question",
          arguments: askArguments
        }, undefined, {
          timeout: 950000
        });

        const generatedText = result.content[0].text;
        stepMarkdown = generatedText;

        // 💡 [RAG 에러 차단막] MCP 응답이 RAG 에러를 리턴했거나 JSON 형식의 에러인지 철저히 검사
        if (!generatedText || generatedText.includes('"success": false') || generatedText.includes('Could not find NotebookLM') || generatedText.includes('Failed to load') || generatedText.includes('Timeout waiting')) {
          throw new Error(`RAG 오류 문자열 검출`);
        }

        // 💡 notebooklm-mcp 응답이 JSON 오브젝트 스트링인 경우 진짜 마크다운 텍스트만 언패킹
        try {
          if (typeof generatedText === 'string' && (generatedText.trim().startsWith('{') || generatedText.trim().startsWith('['))) {
            const parsedRes = JSON.parse(generatedText);
            if (parsedRes && parsedRes.success === false) {
              throw new Error(`RAG 내부 실패`);
            }
            if (parsedRes && parsedRes.data && parsedRes.data.answer) {
              stepMarkdown = parsedRes.data.answer;
            } else if (parsedRes && parsedRes.answer) {
              stepMarkdown = parsedRes.answer;
            }
          }
        } catch (e) {
          throw e;
        }

        // 💡 [Soft Refusal (친절한 거절) 및 과도하게 짧은 텍스트(300자 미만) 차단 필터]
        const lowerText = stepMarkdown.toLowerCase();
        const isRefusal = 
          lowerText.includes("답변을 제공할") || 
          lowerText.includes("찾을 수 없") || 
          lowerText.includes("죄송합니다만") || 
          lowerText.includes("답변하기 어렵") || 
          lowerText.includes("i cannot") || 
          lowerText.includes("i'm sorry") ||
          stepMarkdown.length < 300;

        if (isRefusal) {
          throw new Error(`NotebookLM 답변 거절(Soft Refusal) 또는 텍스트 길이 미달 감지 (획득 크기: ${stepMarkdown.length}자)`);
        }

        // 💡 지능형 세션 ID 추출 및 갱신 보장
        if (result.session_id) {
          sessionId = result.session_id;
        } else if (result.data && result.data.session_id) {
          sessionId = result.data.session_id;
        } else {
          try {
            if (typeof generatedText === 'string' && (generatedText.trim().startsWith('{') || generatedText.trim().startsWith('['))) {
              const parsedRes = JSON.parse(generatedText);
              if (parsedRes.session_id) {
                sessionId = parsedRes.session_id;
              } else if (parsedRes.data && parsedRes.data.session_id) {
                sessionId = parsedRes.data.session_id;
              }
            }
          } catch (_) {}
        }

        stepSuccess = true;
      } catch (err) {
        retryCount++;
        console.warn(`⚠️ [${subjectName}] [Step ${i + 1}] 시도 ${retryCount}회 실패:`, err.message);
        if (retryCount >= maxRetries) {
          throw new Error(`RAG [Step ${i + 1}] 추출 최종 실패 (시도: ${retryCount}회): ${err.message}`);
        }
      }
    }

    console.log(`✅ [Step ${i + 1}] 완료! (획득 세션 ID: ${sessionId || "없음"}, 크기: ${stepMarkdown.length}자)`);

    // 초안 청크 분할 및 저장
    const { questions, explanations } = splitQuestionsAndExplanations(stepMarkdown);
    questionsChunks.push(questions);
    explanationsChunks.push(explanations);

    // 다음 분할 번호 갱신
    startQuestionNum += part.count;

    // 단계 간 대기 (브라우저 과부하 및 락 방지용)
    if (i < partitions.length - 1) {
      console.log("⏳ 브라우저 충돌 및 락(Lock) 방지를 위해 15초간 대기 중...");
      await sleep(15000);
    }
  }

  // 🧩 지능형 청크 조립 및 자가 치유 파서 기동
  console.log(`\n🧩 [${subjectName}] 지능형 청크 조립 및 자가 치유 파서 기동...`);
  console.log(`🧩 [조립 파서] 총 ${questionsChunks.length}개의 마크다운 청크를 통합 조립하는 중...`);
  
  const mergedQuestions = questionsChunks.join("\n\n").trim();
  const mergedExplanations = explanationsChunks.join("\n\n").trim();

  let quizMarkdown = `## [시험 문제지]

${mergedQuestions}

## [정답 및 상세 해설]

${mergedExplanations}`;

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
  console.log(`✅ [${subjectName}] 최종 마크다운 통합 문제지 저장 완료: ${filePath}`);

  // 5. history.json 업데이트 (구체적인 문항 요약을 추출해 저장하여 실질적 중복 방지)
  const todayQuestions = extractQuestionSummaries(quizMarkdown);
  const historyStamp = `[출제일: ${today}] ${subjectName} ${count}문항 기출 내용:\n` + todayQuestions.map(q => `  - ${q}`).join("\n");
  
  subjectHistory.push(historyStamp);
  
  // 무한 누적 방지를 위해 최근 20개 시험지 내용만 sliding window로 보존
  if (subjectHistory.length > 20) {
    subjectHistory.shift();
  }
  
  historyData[subjectKey] = subjectHistory;
  saveJson(HISTORY_PATH, historyData);
  console.log(`💾 [${subjectName}] 구체적 문항 요약을 출제 이력에 저장 완료.`);
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

    // 💡 [크롬 프로필 락 해제 및 자원 반환]
    // Browser Automation 수확기가 충돌 없이 정상 가동될 수 있도록 
    // NotebookLM MCP 클라이언트 브라우저 인스턴스를 먼저 완전히 소멸시킵니다.
    console.log("🧹 HTML 퀴즈 수확기 안전 기동을 위해 NotebookLM MCP 세션을 완전히 종료합니다...");
    try {
      await transport.close();
    } catch (_) {}

    // 💡 [Browser Automation] 마크다운 데이터를 토대로 프리미엄 인터랙티브 HTML 웹앱 순차 수확
    const today = getTodayString();
    const subjectsToCompile = [];
    if (!targetSubject || targetSubject === 'accounting') {
      subjectsToCompile.push({ key: 'accounting', name: '회계원리' });
    }
    if (!targetSubject || targetSubject === 'facility') {
      subjectsToCompile.push({ key: 'facility', name: '시설개론' });
    }
    if (!targetSubject || targetSubject === 'civil') {
      subjectsToCompile.push({ key: 'civil', name: '민법' });
    }

    console.log("\n⚡ [수확기 루프] 교정된 마크다운을 프리미엄 HTML로 즉석 수확 컴파일 시작...");
    for (const sub of subjectsToCompile) {
      const mdFileName = `${today}_${sub.name}.md`;
      const mdFilePath = path.join(DAILY_TESTS_DIR, mdFileName);

      if (fs.existsSync(mdFilePath)) {
        try {
          const mdContent = fs.readFileSync(mdFilePath, 'utf8');
          const interactiveHtml = await compileInteractiveHtmlViaBrowser(mdContent, sub.name, sub.key);
          if (interactiveHtml) {
            const htmlFileName = `${today}_${sub.name}_interactive.html`;
            const htmlFilePath = path.join(DAILY_TESTS_DIR, htmlFileName);
            fs.writeFileSync(htmlFilePath, interactiveHtml, "utf8");
            console.log(`✅ [${sub.name}] 프리미엄 퀴즈 HTML 최종 수확 및 저장 완료: ${htmlFilePath}`);
          } else {
            console.warn(`⚠️ [${sub.name}] HTML 수확 실패 (컴파일러 결과 빈 문자열)`);
          }
        } catch (htmlErr) {
          console.error(`🚨 [${sub.name}] HTML 수확 도중 에러 발생:`, htmlErr.message);
        }
      }
    }

    // 💡 갱신 및 배포
    updateTestsIndex();
    autoGitPush();

  } catch (error) {
    console.error("❌ 에러: 에이전트 실행 중 오류가 발생했습니다:", error);
  } finally {
    console.log("👋 에이전트가 정상적으로 종료되었습니다.");
    process.exit(0);
  }
}

main();
