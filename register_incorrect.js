import fs from 'fs';
import path from 'path';
import readline from 'readline';

const INCORRECT_PATH = path.resolve("data", "incorrect_answers.json");

function loadIncorrectData() {
  if (fs.existsSync(INCORRECT_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(INCORRECT_PATH, "utf8"));
    } catch (e) {
      console.warn("⚠️ 기존 오답 데이터를 읽어오는 데 실패했습니다. 새로 생성합니다.");
    }
  }
  return { accounting: [], facility: [] };
}

function saveIncorrectData(data) {
  fs.writeFileSync(INCORRECT_PATH, JSON.stringify(data, null, 2), "utf8");
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

// 오늘 날짜 YYYY-MM-DD
function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function showIncorrectList(data) {
  console.log("\n==============================================");
  console.log("             현재 등록된 오답 목록            ");
  console.log("==============================================");
  
  console.log("\n📈 [회계원리 취약점]");
  if (data.accounting.length === 0) {
    console.log("   - 등록된 취약 개념이 없습니다. 아주 잘하고 계십니다! 🎉");
  } else {
    data.accounting.forEach((item, idx) => {
      console.log(`   ${idx + 1}. [${item.date}] ${item.concept}`);
    });
  }

  console.log("\n🏢 [시설개론 취약점]");
  if (data.facility.length === 0) {
    console.log("   - 등록된 취약 개념이 없습니다. 아주 잘하고 계십니다! 🎉");
  } else {
    data.facility.forEach((item, idx) => {
      console.log(`   ${idx + 1}. [${item.date}] ${item.concept}`);
    });
  }
  console.log("==============================================\n");
}

async function main() {
  console.log("==================================================");
  console.log("      주택관리사보 오답 노트 관리 유틸리티        ");
  console.log("==================================================");

  if (!fs.existsSync("data")) {
    fs.mkdirSync("data");
  }

  let data = loadIncorrectData();

  while (true) {
    console.log("1. 현재 오답/취약점 목록 보기");
    console.log("2. 새로운 오답/취약 개념 등록");
    console.log("3. 특정 취약점 삭제");
    console.log("4. 전체 오답 노트 초기화");
    console.log("5. 종료");
    
    const choice = await askQuestion("\n원하시는 작업 번호를 선택하세요: ");

    if (choice === "1") {
      await showIncorrectList(data);
    } 
    else if (choice === "2") {
      console.log("\n[과목 선택]");
      console.log("1) 회계원리");
      console.log("2) 시설개론");
      const subChoice = await askQuestion("과목을 선택하세요 (1 또는 2): ");
      
      let subjectKey = "";
      let subjectName = "";
      if (subChoice === "1") {
        subjectKey = "accounting";
        subjectName = "회계원리";
      } else if (subChoice === "2") {
        subjectKey = "facility";
        subjectName = "시설개론";
      } else {
        console.log("❌ 잘못된 선택입니다. 처음 메뉴로 돌아갑니다.\n");
        continue;
      }

      console.log(`\n📝 [${subjectName}] 취약점 등록`);
      console.log("👉 예: '정률법 감가상각 누계액 계산 오류', '방수재료 중 아스팔트 루핑의 특징' 등");
      const concept = await askQuestion("틀린 문제의 지문이나 집중 학습할 취약 개념을 입력하세요:\n> ");

      if (!concept) {
        console.log("❌ 입력값이 비어있어 등록을 취소합니다.\n");
        continue;
      }

      data[subjectKey].push({
        concept: concept,
        date: getTodayString()
      });
      saveIncorrectData(data);
      console.log(`\n✅ [${subjectName}]에 새로운 취약점이 등록되었습니다!\n`);
    } 
    else if (choice === "3") {
      await showIncorrectList(data);
      console.log("[과목 선택]");
      console.log("1) 회계원리");
      console.log("2) 시설개론");
      const subChoice = await askQuestion("과목을 선택하세요 (1 또는 2): ");
      
      let subjectKey = "";
      if (subChoice === "1") subjectKey = "accounting";
      else if (subChoice === "2") subjectKey = "facility";
      else {
        console.log("❌ 잘못된 선택입니다.\n");
        continue;
      }

      const list = data[subjectKey];
      if (list.length === 0) {
        console.log("❌ 삭제할 취약점이 없습니다.\n");
        continue;
      }

      const delIdxStr = await askQuestion(`삭제할 항목의 번호를 입력하세요 (1 ~ ${list.length}): `);
      const delIdx = parseInt(delIdxStr, 10) - 1;

      if (isNaN(delIdx) || delIdx < 0 || delIdx >= list.length) {
        console.log("❌ 올바르지 않은 번호입니다.\n");
        continue;
      }

      const removed = list.splice(delIdx, 1);
      saveIncorrectData(data);
      console.log(`\n✅ 삭제 완료: "${removed[0].concept}" 항목이 제거되었습니다.\n`);
    } 
    else if (choice === "4") {
      const confirm = await askQuestion("⚠️ 정말로 모든 오답 노트를 초기화하시겠습니까? (y/n): ");
      if (confirm.toLowerCase() === 'y') {
        data = { accounting: [], facility: [] };
        saveIncorrectData(data);
        console.log("\n🧹 모든 오답 노드가 초기화되었습니다.\n");
      } else {
        console.log("\n취소되었습니다.\n");
      }
    } 
    else if (choice === "5" || choice === "") {
      console.log("\n👋 오답 노트 관리를 종료합니다. 오늘도 파이팅입니다!");
      break;
    } 
    else {
      console.log("❌ 올바르지 않은 입력입니다. 다시 시도해 주세요.\n");
    }
  }

  process.exit(0);
}

main();
