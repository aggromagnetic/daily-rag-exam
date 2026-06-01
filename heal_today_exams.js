import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// 📂 파일 경로 설정
const DAILY_TESTS_DIR = path.resolve('public', 'daily_tests');
const TARGET_FILES = [
  '2026-05-26_민법.md',
  '2026-05-26_시설개론.md',
  '2026-05-26_회계원리.md'
];

function cleanQuestionText(text) {
  // 기존의 앞부분 번호 패턴(예: 1. , Q1., [Step ...] 등) 제거
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^Q?\d+[\.번\s]*/, '');
  cleaned = cleaned.replace(/^\[AI-GENERATED.*?\]\s*/gi, '');
  cleaned = cleaned.replace(/^\[시험 문제지\]\s*/i, '');
  return cleaned.trim();
}

function healFile(filename) {
  const filePath = path.join(DAILY_TESTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ 파일이 존재하지 않습니다: ${filePath}`);
    return;
  }

  console.log(`\n🩺 [Healer] '${filename}' 복구 및 포맷 정렬 중...`);
  const content = fs.readFileSync(filePath, 'utf8');

  // 1. 문제지와 해설부 분리
  const headers = [
    '## [정답 및 상세 해설]',
    '### [정답 및 상세 해설]',
    '[정답 및 상세 해설]',
    '## 정답 및 상세 해설',
    '정답 및 상세 해설',
    '## 정답 및 해설',
    '정답 및 해설',
    '## [정답 및 해설]'
  ];

  let headerIndex = -1;
  let selectedHeader = '## [정답 및 상세 해설]';
  for (const header of headers) {
    const idx = content.indexOf(header);
    if (idx !== -1) {
      headerIndex = idx;
      selectedHeader = header;
      break;
    }
  }

  if (headerIndex === -1) {
    console.error(`❌ 해설 섹션 헤더를 찾을 수 없어 복구를 중단합니다.`);
    return;
  }

  const questionsPart = content.substring(0, headerIndex);
  const explanationsPart = content.substring(headerIndex + selectedHeader.length);

  // 2. 문제 추출
  const qLines = questionsPart.split('\n');
  const questionsList = [];

  for (let line of qLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 무시할 메타 성격의 라인 필터링
    if (trimmed.startsWith('##') || 
        trimmed.startsWith('###') || 
        trimmed.startsWith('[-') || 
        trimmed.startsWith('---') || 
        trimmed.startsWith('==') ||
        trimmed.includes('AI-GENERATED') ||
        trimmed === '[시험 문제지]' ||
        trimmed === '시험 문제지') {
      continue;
    }

    // 5지선다 보기 기호(①-⑤)를 포함하고 있는 경우에만 진짜 질문으로 매핑
    if (trimmed.includes('①') && trimmed.includes('⑤')) {
      questionsList.push(cleanQuestionText(trimmed));
    }
  }

  // 3. 해설 추출 (정밀 파서)
  // 정답 및 해설 블록들을 추출하기 위해 줄바꿈 후 '정답:' 이나 '정답: \d+.' 등 패턴으로 분할
  const eBlocks = explanationsPart.split(/\n(?=정답\s*[:은])|\n(?=\[정답\])/i);
  const explanationsList = [];

  for (const block of eBlocks) {
    const cleanBlock = block.trim();
    if (!cleanBlock) continue;

    // 정답 기호(①-⑤) 추출
    const ansMatch = cleanBlock.match(/(?:정답|답)\s*(?::|은)?\s*(?:\d+[\.\s]*)?([①-⑤1-5])/);
    let answerText = '①';
    if (ansMatch) {
      answerText = ansMatch[1];
    } else {
      const fallbackAnsMatch = cleanBlock.match(/([①-⑤])/);
      if (fallbackAnsMatch) {
        answerText = fallbackAnsMatch[1];
      }
    }

    // 해설 문구 추출
    let explanationText = cleanBlock
      .replace(/^(?:정답|답)\s*(?::|은)?\s*(?:\d+[\.\s]*)?[①-⑤1-5\s\n]*/i, '')
      .replace(/^-\s*해설\s*:\s*/i, '')
      .replace(/^해설\s*:\s*/i, '')
      .replace(/^\d+\.\s*/, '')
      .trim();

    if (explanationText.startsWith('해설:')) {
      explanationText = explanationText.substring(3).trim();
    }

    explanationsList.push({
      answer: answerText,
      explanation: explanationText || '상세 해설은 본문 및 기본서를 참고해 주십시오.'
    });
  }

  // 4. 무결성 정렬 체크 및 강제 동기화 보장
  console.log(`📊 [Healer-Stat] 추출 결과 -> 문제: ${questionsList.length}개, 해설: ${explanationsList.length}개`);
  
  const finalCount = Math.max(questionsList.length, explanationsList.length);
  if (questionsList.length !== explanationsList.length) {
    console.warn(`⚠️ [Healer-Warning] 문제 수와 해설 수가 불일치합니다! 안전 동기화를 수행합니다.`);
  }

  // 5. 프리미엄 최종 마크다운 조립
  const healedQuestions = [];
  const healedExplanations = [];

  for (let i = 0; i < finalCount; i++) {
    const qNum = i + 1;
    
    // 문제 구성
    const rawQText = questionsList[i] || '기출 변형 문제 데이터를 불러오는 중 오류가 발생했습니다. 전용 Gem을 참조해 주세요. ① ① ② ② ③ ③ ④ ④ ⑤ ⑤';
    // 보기 줄바꿈 정렬 강화 (한 줄에 다닥다닥 붙어있는 보기를 보기 좋게 줄바꿈)
    let formattedQ = rawQText;
    for (let opt = 1; opt <= 5; opt++) {
      const marker = ['①', '②', '③', '④', '⑤'][opt - 1];
      formattedQ = formattedQ.replace(marker, `\n${marker}`);
    }
    // 첫 보기 앞 줄바꿈은 하나만
    formattedQ = formattedQ.replace(/\n①/, '\n①');

    healedQuestions.push(`${qNum}. ${formattedQ.trim()}`);

    // 해설 구성
    const expObj = explanationsList[i] || { answer: '①', explanation: '상세 해설 데이터를 정상적으로 조립하지 못했습니다.' };
    healedExplanations.push(`${qNum}. 정답: ${expObj.answer}\n해설: ${expObj.explanation}`);
  }

  const finalMarkdown = `## [시험 문제지]

${healedQuestions.join('\n\n')}

## [정답 및 상세 해설]

${healedExplanations.join('\n\n')}`;

  fs.writeFileSync(filePath, finalMarkdown, 'utf8');
  console.log(`✅ [Healer] '${filename}' 복구 및 1~${finalCount}번 순차 정렬 완료!`);
}

function main() {
  console.log("==================================================");
  console.log("      주택관리사보 시험지 자가 치유 정렬 헬퍼     ");
  console.log("==================================================");

  for (const file of TARGET_FILES) {
    healFile(file);
  }

  console.log("\n📊 정적 시험지 인덱스(tests_index.json) 갱신 중...");
  // tests_index.json 강제 갱신
  try {
    const files = fs.readdirSync(DAILY_TESTS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a));
    
    const tests = files.map(file => {
      const cleanName = file.replace('.md', '');
      const parts = cleanName.split('_');
      return {
        filename: file,
        date: parts[0] || '오늘',
        subject: parts[1] || cleanName
      };
    });

    fs.writeFileSync(
      path.join(DAILY_TESTS_DIR, "tests_index.json"), 
      JSON.stringify({ tests }, null, 2), 
      "utf8"
    );
    console.log("✅ tests_index.json 갱신 완료!");
  } catch (error) {
    console.error("❌ tests_index.json 갱신 실패:", error.message);
  }

  // Git Push 수행
  console.log("\n🚀 GitHub Pages 최종 반영(Git Push) 구동 중...");
  try {
    execSync("git add public/daily_tests/", { stdio: "inherit" });
    
    // index.html 도 같이 스테이징
    if (fs.existsSync("index.html")) {
      execSync("git add index.html", { stdio: "inherit" });
    }

    const commitMsg = `Heal and format daily RAG exams with custom Gem landing integration`;
    execSync(`git commit -m "${commitMsg}"`, { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("🎉 원격 배포 완료! 수초 내로 완벽하게 포맷 정돈된 시험지가 반영됩니다.");
  } catch (error) {
    console.warn("⚠️ 자동 Git Push 스킵 또는 실패:", error.message);
  }
}

main();
