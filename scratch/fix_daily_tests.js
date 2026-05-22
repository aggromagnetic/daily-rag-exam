import fs from 'fs';
import path from 'path';

const DAILY_TESTS_DIR = './daily_tests';

const files = [
  '2026-05-20_민법.md',
  '2026-05-20_회계원리.md',
  '2026-05-20_시설개론.md'
];

files.forEach(filename => {
  const filePath = path.join(DAILY_TESTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 파일이 존재하지 않습니다: ${filePath}`);
    return;
  }

  console.log(`🔨 보정 작업 시작: ${filename}`);
  const content = fs.readFileSync(filePath, 'utf8');

  // 해설 섹션 분리
  const solutionKeywords = [
    '## [정답 및 상세 해설]',
    '### [정답 및 상세 해설]',
    '[정답 및 상세 해설]',
    '## 정답 및 상세 해설',
    '정답 및 상세 해설',
    '## 정답 및 해설',
    '정답 및 해설',
    '## [정답 및 해설]'
  ];

  let bodyPart = content;
  let solutionPart = '';
  let solutionKeywordUsed = '';

  for (const keyword of solutionKeywords) {
    const idx = content.indexOf(keyword);
    if (idx !== -1) {
      bodyPart = content.substring(0, idx);
      solutionPart = content.substring(idx);
      solutionKeywordUsed = keyword;
      break;
    }
  }

  // 본문 파트 줄바꿈으로 쪼개기
  const lines = bodyPart.split('\n');
  let questionCounter = 1;
  const processedLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      processedLines.push(line);
      continue;
    }

    // 1. 헤더 장식 문구나 이미 번호가 붙은 경우는 스킵
    if (trimmed.startsWith('[AI-GENERATED') || trimmed.startsWith('[시험 문제지') || trimmed.startsWith('##') || /^\d+[\.번\s]|^Q\d+/.test(trimmed)) {
      processedLines.push(line);
      continue;
    }

    // 2. 보기 기호가 있는 문항 줄인 경우
    const hasOptions = /[①-⑤]|\([1-5]\)|[1-5]\)/.test(trimmed);
    if (hasOptions) {
      // 앞에 'N. ' 형태로 번호를 붙여준다.
      // 공백 유지
      const leadingSpace = line.match(/^\s*/)[0];
      processedLines.push(`${leadingSpace}${questionCounter}. ${trimmed}`);
      questionCounter++;
    } else {
      processedLines.push(line);
    }
  }

  const newBody = processedLines.join('\n');
  const finalContent = solutionPart ? (newBody + solutionPart) : newBody;

  fs.writeFileSync(filePath, finalContent, 'utf8');
  console.log(`✅ 보정 완료: ${filename} (총 ${questionCounter - 1}개 문항 번호 부여됨)`);
});
