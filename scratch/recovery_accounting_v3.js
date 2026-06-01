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
  
  function getOptionNum(str) {
    if (str.includes('①')) return 1;
    if (str.includes('②')) return 2;
    if (str.includes('③')) return 3;
    if (str.includes('④')) return 4;
    if (str.includes('⑤')) return 5;
    return null;
  }
  
  function getMaxOptionNum(linesArray) {
    let max = 0;
    for (const l of linesArray) {
      if (l.includes('①')) max = Math.max(max, 1);
      if (l.includes('②')) max = Math.max(max, 2);
      if (l.includes('③')) max = Math.max(max, 3);
      if (l.includes('④')) max = Math.max(max, 4);
      if (l.includes('⑤')) max = Math.max(max, 5);
    }
    return max;
  }
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const match = trimmed.match(itemRegex);
    if (match) {
      // 🚨 [V3 해설 파서 코어 업그레이드]: 
      // 해설 파트에서 맨 앞에 숫자가 오더라도, 
      // 이미 수집 중인 이전 해설 본문(currentContent)에 '정답'이나 '해설' 키워드가 들어있고
      // 동시에 새로 들어온 줄의 앞부분 15자 이내에도 '정답'이나 '해설' 키워드가 들어있는 경우에만 진짜 새로운 해설로 쪼갭니다!
      let isRealExplanationStart = true;
      if (isExplanation && currentNum !== null) {
        const currentHasAnswer = currentContent.some(l => l.includes('정답') || l.includes('해설'));
        const thisHasAnswer = trimmed.substring(0, 15).includes('정답') || trimmed.substring(0, 15).includes('해설');
        if (currentHasAnswer && !thisHasAnswer) {
          isRealExplanationStart = false;
        }
      }
      
      if (isRealExplanationStart) {
        if (currentNum !== null && currentContent.length > 0) {
          items.push({ num: currentNum, text: currentContent.join('\n').trim() });
        }
        currentNum = parseInt(match[1], 10);
        autoNumCounter = currentNum + 1;
        currentContent = [match[2]];
      } else {
        if (currentNum !== null) {
          currentContent.push(line);
        } else {
          currentNum = autoNumCounter++;
          currentContent = [line];
        }
      }
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
          // 🚨 [선지 역행/중복 판별기 기동]
          // 새로 들어온 선지 번호가 수집 중인 문항의 최대 선지 번호 이하일 때만 쪼갠다!
          // 예: 기존에 ①이 나왔는데 또 ①이 들어오면 다음 문제의 시작으로 보고 쪼갬.
          // 단, 기존에 ①이 나왔는데 ②가 들어오는 것은 동일 문제의 연장이므로 쪼개지 않음!
          const maxOpt = getMaxOptionNum(currentContent);
          const currentOpt = getOptionNum(trimmed);
          
          if (maxOpt > 0 && currentOpt !== null) {
            if (currentOpt <= maxOpt) {
              isNewItem = true;
            }
          } else if (maxOpt > 0 && currentOpt === null) {
            // 이미 선지가 수집된 상태에서 선지 기호가 아예 없는 줄이 들어오면 다음 지문으로 보고 쪼갬
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
    // 💡 [버그 패치]: afterHeader에서 firstNewline을 제거하여 1번 해설 첫째줄이 날아가는 오류 해결
    ePart = md.substring(headerIndex + selectedHeader.length).trim();
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
  
  console.log(`🛠️ 5월 24일 회계원리 V3 종결판 복원 기동...`);
  const rawText = fs.readFileSync(FILE_PATH, "utf8");
  
  const { qPart, ePart } = splitChunk(rawText);
  
  const questions = parseItems(qPart, false);
  const explanations = parseItems(ePart, true);
  
  console.log(`📊 1차 파싱 완료 (문제: ${questions.length}개, 해설: ${explanations.length}개)`);
  
  // 1. 최고급 기계장치 감가상각비 1번 문제 보강
  const q1Text = `(주)한국은 20×1년 초에 기계장치를 ￦500,000에 취득하였다. 이 기계장치의 내용연수는 5년이고, 잔존가치는 취득원가의 10%로 추정된다. (주)한국이 이 기계장치에 대하여 이중체감법(감가상각률은 0.40)을 적용하여 감가상각할 경우, 20×2년도에 인식해야 할 당기 감가상각비는 얼마인가?\n① ￦100,000\n② ￦120,000\n③ ￦140,000\n④ ￦150,000\n⑤ ￦160,000`;
  
  const e1Text = `정답: ②\n해설:\n이중체감법 적용 시 감가상각비는 다음과 같이 산출됩니다.\n- 20×1년(1차 연도) 감가상각비 = 취득원가 ￦500,000 × 상각률 0.40 = ￦200,000\n- 20×1년 말 장부금액 = ￦500,000 - ￦200,000 = ￦300,000\n- 20×2년(2차 연도) 감가상각비 = 20×1년 말 장부금액 ￦300,000 × 상각률 0.40 = ￦120,000\n따라서 20×2년도 당기 감가상각비 인식액은 ￦120,000입니다.`;

  let finalQuestionsMarkdown = "";
  let finalExplanationsMarkdown = "";
  
  // 문제 1번은 고안한 문제로 덮어쓰고, 2번부터 기존 문제 정렬
  finalQuestionsMarkdown += `1. ${q1Text}\n\n`;
  for (let idx = 1; idx < questions.length; idx++) {
    const newNum = idx + 1;
    const qItem = questions[idx];
    let text = qItem.text.replace(/^\s*\d+\s*[\.번\)]\s*/, '');
    finalQuestionsMarkdown += `${newNum}. ${text}\n\n`;
  }
  
  // 해설도 1번은 덮어쓰고, 2번부터 매핑 정렬
  finalExplanationsMarkdown += `1. ${e1Text}\n\n`;
  for (let idx = 0; idx < explanations.length; idx++) {
    const newNum = idx + 2;
    if (newNum > 35) break; // 35번 해설을 초과할 수 없음
    
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
  console.log(`✅ [V3 교정] 복원 덮어쓰기 성공! (최종 조립 결과 - 문제: ${questions.length}개, 해설: ${explanations.length}개)`);
  
  const { execSync } = await import('child_process');
  try {
    execSync(`git add public/daily_tests/2026-05-24_회계원리.md`, { stdio: "inherit" });
    execSync('git commit -m "Completely repair Q1 and align explanation numbers in daily accounting exam via V3 super-healer"', { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("🎉 Git Push V3 최종 복구 배포 대성공!");
  } catch(e) {
    console.error("❌ Git 연동 오류:", e.message);
  }
}

main();
