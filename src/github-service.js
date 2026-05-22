// ==========================================================================
// 🪐 GitHub & Serverless API 서비스 레이어 (github-service.js)
// ==========================================================================

/**
 * 1. 📅 공개 모의고사 목록 가져오기 (정적 tests_index.json 조회)
 * 백엔드 없이 public/daily_tests/tests_index.json 파일을 정적으로 조회합니다.
 */
export async function fetchExamsList() {
  try {
    const res = await fetch('/daily_tests/tests_index.json');
    if (!res.ok) {
      throw new Error(`시험지 인덱스 파일을 찾을 수 없습니다 (상태코드: ${res.status})`);
    }
    const data = await res.json();
    return data.tests || [];
  } catch (error) {
    console.warn('⚠️ 정적 인덱스 파일 조회 실패, 로컬 스토리지 또는 GitHub API 폴백을 시도합니다.', error);
    // 폴백: 저장된 시험지가 없을 경우 로컬 개발용 API 혹은 빈 배열 반환
    return [];
  }
}

/**
 * 2. 📄 개별 정적 모의고사 마크다운 가져오기
 */
export async function fetchExamContent(filename) {
  const res = await fetch(`/daily_tests/${filename}`);
  if (!res.ok) {
    throw new Error(`모의고사 파일을 불러오는 데 실패했습니다 (파일명: ${filename})`);
  }
  return await res.text();
}

/**
 * 3. 🔑 수험생 비공개 Gist 데이터 로드
 */
export async function fetchGistIncorrect(token, gistId) {
  if (!token || !gistId) {
    throw new Error('인증 토큰(PAT) 및 Gist ID가 누락되었습니다.');
  }

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  });

  if (!res.ok) {
    throw new Error(`오답 노트를 불러오는 데 실패했습니다. 토큰이나 Gist ID를 확인하세요. (코드: ${res.status})`);
  }

  const gist = await res.json();
  const file = gist.files['incorrect_answers.json'];
  if (!file) {
    throw new Error('Gist 내에 incorrect_answers.json 파일이 존재하지 않습니다.');
  }

  return JSON.parse(file.content);
}

/**
 * 4. ✏️ 수험생 비공개 Gist 데이터 업데이트 (Upsert/Delete 공용)
 */
export async function updateGistIncorrect(token, gistId, data) {
  if (!token || !gistId) {
    throw new Error('인증 토큰(PAT) 및 Gist ID가 누락되었습니다.');
  }

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: '주택관리사보 2.0 지능형 RAG 오답노트 데이터베이스 (자동 갱신)',
      files: {
        'incorrect_answers.json': {
          content: JSON.stringify(data, null, 2)
        }
      }
    })
  });

  if (!res.ok) {
    throw new Error(`오답 노트를 갱신하는 데 실패했습니다. (코드: ${res.status})`);
  }

  const gist = await res.json();
  const file = gist.files['incorrect_answers.json'];
  return JSON.parse(file.content);
}

/**
 * 5. 🌱 최초 사용자용 비공개 Gist 자동 생성
 */
export async function createGistIncorrect(token) {
  if (!token) {
    throw new Error('Gist를 자동 생성하기 위해서는 GitHub 개인 토큰(PAT)이 필요합니다.');
  }

  const initialData = {
    accounting: [],
    facility: [],
    civil: []
  };

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: '주택관리사보 2.0 지능형 RAG 오답노트 데이터베이스',
      public: false, // 철저한 비공개 설정
      files: {
        'incorrect_answers.json': {
          content: JSON.stringify(initialData, null, 2)
        }
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Gist 생성에 실패했습니다. 토큰 권한(gist scope)을 확인해 주세요. (코드: ${res.status})`);
  }

  const gist = await res.json();
  return gist.id; // 신규 생성된 Gist ID 반환
}
