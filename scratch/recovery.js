import fs from 'fs';
import path from 'path';

const DAILY_TESTS_DIR = path.resolve("public", "daily_tests");
const FILE_PATH = path.join(DAILY_TESTS_DIR, "2026-05-24_민법.md");

function assembleGeneratedChunks(chunks, expectedTotalCount) {
  console.log(`🧩 [복원 파서] 총 ${chunks.length}개의 청크 복원 조립 기동...`);
  
  let allQuestions = []; 
  let allExplanations = []; 
  
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
      "## [시험 문제지] (제2부: 14번부터)",
      "## [시험 문제지] (제2부: 21번부터)",
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

  function parseItems(partText, isExplanation = false) {
    const lines = partText.split('\n');
    const items = [];
    
    const itemRegex = /^\s*(?:\*\*)?(?:문\s*|Q\s*|q\s*)?(\d+)\s*[\.번\)]\s*(?:\*\*)?\s*(.+)$/;
    
    let currentNum = null;
    let currentContent = [];
    let autoNumCounter = 1;
    
    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const match = trimmed.match(itemRegex);
      if (match) {
        if (currentNum !== null && currentContent.length > 0) {
          items.push({ num: currentNum, text: currentContent.join('\n').trim() });
        }
        currentNum = parseInt(match[1], 10);
        autoNumCounter = currentNum + 1;
        currentContent = [match[2]];
      } else {
        const hasOptions = trimmed.includes('①') || trimmed.includes('②') || trimmed.includes('③');
        const hasAnswerMarker = trimmed.includes('정답') || trimmed.includes('해설');
        
        const isNewItem = (!isExplanation && hasOptions) || (isExplanation && hasAnswerMarker);
        
        if (isNewItem) {
          if (currentNum !== null && currentContent.length > 0) {
            items.push({ num: currentNum, text: currentContent.join('\n').trim() });
          }
          currentNum = autoNumCounter++;
          currentContent = [trimmed];
        } else {
          if (currentNum !== null) {
            currentContent.push(line);
          }
        }
      }
    }
    
    if (currentNum !== null && currentContent.length > 0) {
      items.push({ num: currentNum, text: currentContent.join('\n').trim() });
    }
    
    return items;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const { qPart, ePart } = splitChunk(chunk);
    
    const chunkQs = parseItems(qPart, false);
    const chunkEs = parseItems(ePart, true);
    
    console.log(`  - [청크 #${i + 1}] 파싱 완료 (문제: ${chunkQs.length}개, 해설: ${chunkEs.length}개)`);
    
    allQuestions = allQuestions.concat(chunkQs);
    allExplanations = allExplanations.concat(chunkEs);
  }
  
  if (allQuestions.length === 0) {
    console.warn("⚠️ 파싱 실패로 롤백");
    return chunks.join("\n\n---\n\n");
  }
  
  let finalQuestionsMarkdown = "";
  let finalExplanationsMarkdown = "";
  
  const totalQs = allQuestions.length;
  const totalEs = allExplanations.length;
  
  console.log(`🧩 [조립 완료] 수집된 문항 수: 문제 ${totalQs}개, 해설 ${totalEs}개`);

  for (let idx = 0; idx < totalQs; idx++) {
    const newNum = idx + 1;
    const qItem = allQuestions[idx];
    finalQuestionsMarkdown += `${newNum}. ${qItem.text}\n\n`;
  }
  
  for (let idx = 0; idx < totalEs; idx++) {
    const newNum = idx + 1;
    const eItem = allExplanations[idx];
    
    let eText = eItem.text;
    const correctAnsMatch = eText.match(/정답\s*:\s*([①-⑤])/);
    if (correctAnsMatch) {
      eText = eText.replace(/정답\s*:\s*[①-⑤]/, `정답: ${correctAnsMatch[1]}`);
    }
    
    finalExplanationsMarkdown += `${newNum}. ${eText}\n\n`;
  }
  
  const assembled = `## [시험 문제지]

${finalQuestionsMarkdown.trim()}

## [정답 및 상세 해설]

${finalExplanationsMarkdown.trim()}`;

  return assembled;
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error("복원 대상 파일이 없습니다.");
    return;
  }
  
  const rawText = fs.readFileSync(FILE_PATH, "utf8");
  const chunks = rawText.split("\n\n---\n\n");
  
  console.log(`🛠️ 로컬 마크다운 복원 기동... 읽어온 청크 개수: ${chunks.length}`);
  
  const assembled = assembleGeneratedChunks(chunks, 25);
  
  fs.writeFileSync(FILE_PATH, assembled, "utf8");
  console.log("✅ 복원 완료 및 파일 덮어쓰기 성공!");
  
  const { execSync } = await import('child_process');
  try {
    execSync("git add public/daily_tests/2026-05-24_민법.md", { stdio: "inherit" });
    execSync('git commit -m "Fix empty/omitted numbering in daily civil exam via self-healing recovery"', { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("🎉 Git Push 복원 배포 대성공!");
  } catch(e) {
    console.error("Git 연동 오류:", e.message);
  }
}

main();
