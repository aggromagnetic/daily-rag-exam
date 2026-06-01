import fs from 'fs';
import path from 'path';

const INCORRECT_PATH = path.resolve("data", "incorrect_answers.json");
const GITHUB_CONFIG_PATH = path.resolve("data", "github_config.json");

async function main() {
  try {
    if (!fs.existsSync(INCORRECT_PATH)) {
      console.error("❌ 오답 파일(data/incorrect_answers.json)이 존재하지 않습니다.");
      return;
    }
    
    if (!fs.existsSync(GITHUB_CONFIG_PATH)) {
      console.error("❌ GitHub 설정 파일(data/github_config.json)이 존재하지 않습니다.");
      return;
    }

    const githubConfig = JSON.parse(fs.readFileSync(GITHUB_CONFIG_PATH, "utf8"));
    const pat = githubConfig.github_pat;
    const gistId = githubConfig.github_gist_id;

    if (!pat || !gistId) {
      console.error("❌ GITHUB_PAT 또는 GIST_ID가 누락되었습니다.");
      return;
    }

    const incorrectDataStr = fs.readFileSync(INCORRECT_PATH, "utf8");
    const incorrectData = JSON.parse(incorrectDataStr);

    console.log("🔄 로컬 오답 데이터를 Gist에 업로드 중...");
    
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AntigravityStudyAgent/1.0.0'
      },
      body: JSON.stringify({
        description: "주택관리사보 2.0 지능형 RAG 오답노트 데이터베이스 (백업 복원 완료)",
        files: {
          "incorrect_answers.json": {
            content: JSON.stringify(incorrectData, null, 2)
          }
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Gist 갱신 실패 (응답코드: ${res.status})`);
    }

    const gist = await res.json();
    console.log("✅ Gist 오답 데이터 동기화 완료!");
    console.log("Gist URL:", gist.html_url);
  } catch (error) {
    console.error("❌ 동기화 중 에러 발생:", error.message);
  }
}

main();
