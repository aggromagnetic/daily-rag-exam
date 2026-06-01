import fs from 'fs';
import path from 'path';

const DAILY_TESTS_DIR = path.resolve("public", "daily_tests");
const FILE_PATH = path.join(DAILY_TESTS_DIR, "2026-05-24_회계원리.md");

function parseItems(partText, isExplanation = false) {
  const lines = partText.split('\n');
  const items = [];
  
  // 볼드 마크다운(**), 문항 기호(Q/문), 마침표/번/괄호를 완벽 포용하는 정규식
  const itemRegex = /^\s*(?:\*\*)?(?:문\s*|Q\s*|q\s*)?(\d+)\s*[\.번\)]\s*(?:\*\*)?\s*(.+)$/;
  
  let currentNum = null;
  let currentContent = [];
  let autoNumCounter = 1;
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const match = trimmed.match(itemRegex);
    if (match) {
      // 정상적인 번호 마커 감지
      if (currentNum !== null && currentContent.length > 0) {
        items.push({ num: currentNum, text: currentContent.join('\n').trim() });
      }
      currentNum = parseInt(match[1], 10);
      autoNumCounter = currentNum + 1;
      currentContent = [match[2]];
    } else {
      // 💡 [번호 유실 자가 치유 방어막] 번호 마커는 없지만 오지선다 기호(①~⑤)를 가지고 있거나 (문제인 경우)
      // 혹은 '정답:' / '해설:' 키워드를 가지고 있다면 (해설인 경우) 독립 문항으로 자가 인지하여 강제 복원!
      const hasOptions = trimmed.includes('①') || trimmed.includes('②') || trimmed.includes('③');
      const hasAnswerMarker = trimmed.includes('정답') || trimmed.includes('해설');
      
      let isNewItem = false;
      
      if (!isExplanation && hasOptions) {
        if (currentNum === null) {
          isNewItem = true;
        } else {
          // 이미 수집 중인 문제가 있다면, 현재 문항에 이미 오지선다(①~③)가 포함되어 있는 경우에만 진짜 다음 문제로 판정해 쪼갬
          const currentHasOptions = currentContent.some(l => l.includes('①') || l.includes('②') || l.includes('③'));
          if (currentHasOptions) {
            isNewItem = true;
          }
        }
      } else if (isExplanation && hasAnswerMarker) {
        if (currentNum === null) {
          isNewItem = true;
        } else {
          const currentHasAnswer = currentContent.some(l => l.includes('정답') || l.includes('해설'));
          if (currentHasAnswer) {
            isNewItem = true;
          }
        }
      }
      
      // 💡 [지문 분리 감지 방어막]: 
      // 만약 현재 수집 중인 문항(currentContent)에 이미 오지선다(①~⑤)가 존재하는데,
      // 이번에 들어온 줄은 오지선다가 없는 일반 텍스트라면,
      // 이것은 이전 문항의 연장이 아니라 "새로운 문제의 지문"이 시작된 것이다!
      if (!isExplanation && currentNum !== null && !isNewItem) {
        const currentHasOptions = currentContent.some(l => l.includes('①') || l.includes('②') || l.includes('③'));
        if (currentHasOptions && !hasOptions) {
          isNewItem = true;
        }
      }
      
      if (isNewItem) {
        if (currentNum !== null && currentContent.length > 0) {
          items.push({ num: currentNum, text: currentContent.join('\n').trim() });
        }
        currentNum = autoNumCounter++;
        currentContent = [trimmed];
      } else {
        if (currentNum !== null) {
          currentContent.push(line);
        } else {
          // currentNum이 없는데 지문 스타일의 문구만 들어오는 경우
          currentNum = autoNumCounter++;
          currentContent = [line];
        }
      }
    }
  }
  
  if (currentNum !== null && currentContent.length > 0) {
    items.push({ num: currentNum, text: currentContent.join('\n').trim() });
  }
  
  // 🧩 [조립 파서-지능형 병합 후처리]
  // 지문(선지 없음)과 본문제(선지 있음)가 쪼개진 케이스를 하나로 결합 복원합니다.
  const mergedItems = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i];
    if (i + 1 < items.length) {
      const next = items[i + 1];
      const currentHasOptions = current.text.includes('①') || current.text.includes('②') || current.text.includes('③');
      const nextHasOptions = next.text.includes('①') || next.text.includes('②') || next.text.includes('③');
      
      if (!isExplanation && !currentHasOptions && nextHasOptions) {
        console.log(`🧩 [조립 파서-치유] 지문-선지 분리 복원: ${current.num}번과 ${next.num}번을 병합합니다. (최종 번호: ${next.num})`);
        mergedItems.push({
          num: next.num,
          text: current.text + "\n" + next.text
        });
        i += 2;
        continue;
      }
    }
    mergedItems.push(current);
    i++;
  }
  
  return mergedItems;
}

function splitChunk(md) {
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
    const afterHeader = md.substring(headerIndex + selectedHeader.length).trim();
    const firstNewline = afterHeader.indexOf('\n');
    ePart = firstNewline !== -1 ? afterHeader.substring(firstNewline).trim() : afterHeader;
  }
  
  const qHeaders = [
    "## [시험 문제지]",
    "### [시험 문제지]",
    "## 시험 문제지",
    "시험 문제지"
  ];
  for (const qH of qHeaders) {
    if (qPart.startsWith(qH)) {
      qPart = qPart.substring(qH.length).trim();
      break;
    }
  }
  
  return { qPart, ePart };
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error("❌ 복원 대상 회계원리 파일이 없습니다.");
    return;
  }
  
  console.log(`🛠️ 5월 24일 회계원리 지능형 조립 복원 기동...`);
  const rawText = fs.readFileSync(FILE_PATH, "utf8");
  
  const { qPart, ePart } = splitChunk(rawText);
  
  const questions = parseItems(qPart, false);
  const explanations = parseItems(ePart, true);
  
  console.log(`📊 1차 파싱 완료 (문제: ${questions.length}개, 해설: ${explanations.length}개)`);
  
  let finalQuestionsMarkdown = "";
  let finalExplanationsMarkdown = "";
  
  // 정상 정렬 조립
  for (let idx = 0; idx < questions.length; idx++) {
    const newNum = idx + 1;
    const qItem = questions[idx];
    // 만약 이미 번호 마크다운이 들어가 있다면 제거
    let text = qItem.text.replace(/^\s*\d+\s*[\.번\)]\s*/, '');
    finalQuestionsMarkdown += `${newNum}. ${text}\n\n`;
  }
  
  for (let idx = 0; idx < explanations.length; idx++) {
    const newNum = idx + 1;
    const eItem = explanations[idx];
    let text = eItem.text.replace(/^\s*\d+\s*[\.번\)]\s*/, '');
    
    // "정답:" 포맷 표준화
    const correctAnsMatch = text.match(/정답\s*:\s*([①-⑤])/);
    if (correctAnsMatch) {
      text = text.replace(/정답\s*:\s*[①-⑤]/, `정답: ${correctAnsMatch[1]}`);
    }
    
    finalExplanationsMarkdown += `${newNum}. ${text}\n\n`;
  }
  
  const assembled = `## [시험 문제지]

${finalQuestionsMarkdown.trim()}

## [정답 및 상세 해설]

${finalExplanationsMarkdown.trim()}`;

  fs.writeFileSync(FILE_PATH, assembled, "utf8");
  console.log(`✅ 복원 덮어쓰기 성공! (최종 조립 결과 - 문제: ${questions.length}개, 해설: ${explanations.length}개)`);
  
  const { execSync } = await import('child_process');
  try {
    execSync(`git add public/daily_tests/2026-05-24_회계원리.md`, { stdio: "inherit" });
    execSync('git commit -m "Fix fragmented question stems and options in daily accounting exam via smart parser healing"', { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("🎉 Git Push 복원 배포 대성공!");
  } catch(e) {
    console.error("❌ Git 연동 오류:", e.message);
  }
}

main();
