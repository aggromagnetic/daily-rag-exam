import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const DAILY_TESTS_DIR = path.resolve('daily_tests');
const INCORRECT_PATH = path.resolve('data', 'incorrect_answers.json');

// 디렉토리/파일 자가 진단 및 초기화
if (!fs.existsSync(DAILY_TESTS_DIR)) {
  fs.mkdirSync(DAILY_TESTS_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(INCORRECT_PATH))) {
  fs.mkdirSync(path.dirname(INCORRECT_PATH), { recursive: true });
}
if (!fs.existsSync(INCORRECT_PATH)) {
  fs.writeFileSync(INCORRECT_PATH, JSON.stringify({ accounting: [], facility: [] }, null, 2), 'utf8');
}

// 헬퍼: JSON 로드/저장
function loadJson(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`⚠️ Failed to parse json: ${filePath}`, e);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 🌟 정교한 마크다운 시험지 파서 🌟
 * 마크다운 텍스트를 파싱하여 { questions: [...], subject: string, date: string } 구조로 반환합니다.
 */
function parseMarkdownQuiz(rawContent, filename) {
  let markdownText = rawContent;

  // 💡 철벽 자동 복구: 만약 파일 전체가 JSON 포맷 문자열이라면 안쪽의 진짜 마크다운 텍스트를 추출
  try {
    if (typeof rawContent === 'string' && (rawContent.trim().startsWith('{') || rawContent.trim().startsWith('['))) {
      const parsedObj = JSON.parse(rawContent);
      if (parsedObj.data && parsedObj.data.answer) {
        markdownText = parsedObj.data.answer;
      } else if (parsedObj.answer) {
        markdownText = parsedObj.answer;
      }
    }
  } catch (e) {
    console.log("ℹ️ parseMarkdownQuiz: File content is normal markdown text.");
  }

  // 파일명에서 과목명 및 날짜 추출 (예: 2026-05-19_시설개론.md)
  let subject = '주택관리사보 시험';
  let date = '오늘';
  const cleanName = filename.replace('.md', '');
  const parts = cleanName.split('_');
  if (parts.length >= 2) {
    date = parts[0];
    subject = parts[1];
  } else {
    subject = cleanName;
  }

  // 1. 해설 섹션 분리
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

  let bodyPart = markdownText;
  let solutionPart = '';

  for (const keyword of solutionKeywords) {
    const idx = markdownText.indexOf(keyword);
    if (idx !== -1) {
      bodyPart = markdownText.substring(0, idx);
      solutionPart = markdownText.substring(idx + keyword.length);
      break;
    }
  }

  // 1.5 문제 시작 부분 특정하여 이전 잡설 강제 제거 (2중 철벽 가드)
  const bodyKeywords = [
    '## [시험 문제지]',
    '### [시험 문제지]',
    '[시험 문제지]',
    '## 시험 문제지',
    '시험 문제지',
    '## 문제지',
    '문제지'
  ];

  let quizStartIdx = -1;
  for (const keyword of bodyKeywords) {
    const idx = bodyPart.indexOf(keyword);
    if (idx !== -1) {
      quizStartIdx = idx + keyword.length;
      break;
    }
  }
  if (quizStartIdx !== -1) {
    bodyPart = bodyPart.substring(quizStartIdx);
  }

  // 2. 해설부 파싱 ({ [문제번호]: { answerText: string, explanation: string, answerNum: number } })
  const solutions = {};
  if (solutionPart) {
    // 💡 [자가 치유 해설 파서] 문제 번호가 없는 해설을 처리하기 위해 "정답:" 또는 "\n정답" 또는 "\n[정답]" 앞부분을 기준으로 쪼갭니다.
    let solBlocks = [];
    const hasNumberedSol = /\n\d+\s*[\.번]/.test(solutionPart) || /\nQ\d+\s*[\.번\s]/.test(solutionPart);
    
    if (hasNumberedSol) {
      solBlocks = solutionPart.split(/\n(?=\d+[\.번\s])|\n(?=Q\d+[\.번\s])/);
    } else {
      solBlocks = solutionPart.split(/\n(?=정답\s*[:은])|\n(?=\[정답\])/);
      console.log(`ℹ️ [Parser-Guard] 해설부 번호 없음 감지. 정답 키워드 기준 ${solBlocks.length}개 블록 분할 완료.`);
    }

    let virtualSolId = 1;

    for (const block of solBlocks) {
      const cleanBlock = block.trim();
      if (!cleanBlock) continue;

      let qNum = null;
      if (hasNumberedSol) {
        const numMatch = cleanBlock.match(/^Q?(\d+)/);
        if (numMatch) {
          qNum = parseInt(numMatch[1], 10);
        }
      } else {
        qNum = virtualSolId;
      }

      if (qNum !== null) {
        const optMapping = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
        let answerNum = null;
        let rawAnswerText = '';

        const ansMatch = cleanBlock.match(/(?:정답|답)\s*(?::|은)?\s*([①-⑤1-5])/);
        if (ansMatch) {
          rawAnswerText = ansMatch[1];
          answerNum = optMapping[rawAnswerText] || null;
        } else {
          const fallbackAnsMatch = cleanBlock.match(/([①-⑤])/);
          if (fallbackAnsMatch) {
            rawAnswerText = fallbackAnsMatch[1];
            answerNum = optMapping[rawAnswerText] || null;
          }
        }

        let explanation = cleanBlock;
        const expMatch = cleanBlock.replace(/^(?:정답|답)\s*(?::|은)?\s*[①-⑤1-5\s\n]*|^(?:정답|답)\s*(?::|은)?\s*.*?번\s*/i, '');
        if (expMatch && expMatch.trim()) {
          explanation = expMatch.trim();
        }

        // 지저분한 꼬리 제거
        explanation = explanation.replace(/\n[1-9]$/g, '').trim();

        solutions[qNum] = {
          answerText: rawAnswerText || '미확인',
          answerNum: answerNum || 0,
          explanation: explanation
        };

        if (!hasNumberedSol) {
          virtualSolId++;
        }
      }
    }
  }

  // 3. 본문부 문항 파싱
  let qBlocks = bodyPart.split(/\n(?=\d+[\.번\s])|\n(?=Q\d+[\.번\s])/);
  
  let currentHeader = '';
  if (qBlocks.length > 0 && !/^\d+[\.번\s]|^Q\d+/.test(qBlocks[0].trim())) {
    currentHeader = qBlocks.shift().trim(); // 문제 앞단 소개글/헤더 격리
  }

  // 💡 [초지능형 자가 치유 폴백] 문제 번호(1. 2.)가 통째로 유실되어 생성된 경우 자동 복구
  const hasOptionsPattern = (bodyPart.match(/[①-⑤]/g) || []).length >= 5;
  if (qBlocks.length < 3 && hasOptionsPattern) {
    console.log("⚠️ [Parser-Guard] 번호 식별 불가 감지. 지능형 보기 기호(①-⑤) 컨텍스트 누적 파싱 가동!");
    currentHeader = ''; // 기존 잘못 격리된 헤더 원천 초기화
    const lines = bodyPart.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    qBlocks = [];
    let virtualId = 1;
    let accumulatedText = "";
    let isFirstQuestionFound = false;

    for (const line of lines) {
      const optionCount = (line.match(/[①-⑤]/g) || []).length;
      if (optionCount >= 2) {
        isFirstQuestionFound = true;
        let fullQuestionLine = accumulatedText ? (accumulatedText + "\n" + line) : line;
        
        if (/^\d+[\.번\s]|^Q\d+/.test(fullQuestionLine)) {
          qBlocks.push(fullQuestionLine);
        } else {
          qBlocks.push(`${virtualId}. ${fullQuestionLine}`);
        }
        virtualId++;
        accumulatedText = "";
      } else {
        if (!isFirstQuestionFound) {
          if (currentHeader) {
            currentHeader += "\n" + line;
          } else {
            currentHeader = line;
          }
        } else {
          if (accumulatedText) {
            accumulatedText += "\n" + line;
          } else {
            accumulatedText = line;
          }
        }
      }
    }
    if (accumulatedText && isFirstQuestionFound) {
      if (qBlocks.length > 0) {
        qBlocks[qBlocks.length - 1] += "\n" + accumulatedText;
      }
    }
  }

  const questions = [];

  for (const block of qBlocks) {
    const cleanBlock = block.trim();
    if (!cleanBlock) continue;

    const numMatch = cleanBlock.match(/^Q?(\d+)/);
    if (!numMatch) continue;

    const qNum = parseInt(numMatch[1], 10);

    const options = [];
    const optRegex = /([①-⑤]|\([1-5]\)|[1-5]\))/g;
    const pieces = cleanBlock.split(optRegex);
    
    let questionText = pieces[0].replace(/^Q?(\d+[\.번\s]*)/, '').trim();
    
    for (let i = 1; i < pieces.length; i += 2) {
      const marker = pieces[i];
      const content = pieces[i + 1] ? pieces[i + 1].trim() : '';
      if (content) {
        options.push({
          marker: marker,
          content: content
        });
      }
    }

    if (options.length === 0) {
      questionText = cleanBlock.replace(/^Q?(\d+[\.번\s]*)/, '').trim();
    }

    const sol = solutions[qNum] || { answerNum: 0, answerText: '미확인', explanation: '해설을 파싱하지 못했습니다.' };

    questions.push({
      id: qNum,
      question: questionText,
      options: options,
      rawBlock: cleanBlock,
      answerNum: sol.answerNum,
      answerText: sol.answerText,
      explanation: sol.explanation
    });
  }

  return {
    subject,
    date,
    header: currentHeader,
    questions
  };
}

// -------------------------------------------------------------
// 🌐 API 라우터 정의
// -------------------------------------------------------------

// 1. 시험지 목록 가져오기
app.get('/api/tests', (req, res) => {
  try {
    const files = fs.readdirSync(DAILY_TESTS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a)); // 최신 날짜 우선 정렬
    
    const testList = files.map(file => {
      const cleanName = file.replace('.md', '');
      const parts = cleanName.split('_');
      return {
        filename: file,
        date: parts[0] || '오늘',
        subject: parts[1] || cleanName
      };
    });

    res.json({ success: true, tests: testList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. 개별 시험지 상세 구조화해서 가져오기
app.get('/api/tests/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(DAILY_TESTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '해당 시험지 파일을 찾을 수 없습니다.' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsedQuiz = parseMarkdownQuiz(content, filename);
    res.json({ success: true, rawMarkdown: content, ...parsedQuiz });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. 오답 목록 가져오기
app.get('/api/incorrect', (req, res) => {
  try {
    const data = loadJson(INCORRECT_PATH, { accounting: [], facility: [], civil: [] });
    res.json({ success: true, incorrect: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. 오답 목록 수기 입력 등록 (틀린 횟수 count 관리)
app.post('/api/incorrect', (req, res) => {
  const { subject, concept } = req.body;
  if (!subject || !concept) {
    return res.status(400).json({ success: false, error: 'subject(accounting/facility/civil) 및 concept가 필수로 필요합니다.' });
  }

  try {
    const data = loadJson(INCORRECT_PATH, { accounting: [], facility: [], civil: [] });
    if (!data[subject]) {
      data[subject] = [];
    }

    const today = new Date().toISOString().split('T')[0];
    const targetConcept = concept.trim();
    
    // 기존에 등록된 취약 개념인지 확인
    const existingItem = data[subject].find(item => item.concept.trim() === targetConcept);
    if (existingItem) {
      // 2회 이상 오답일 경우 횟수를 누진하여 가중치 복리 적용 대상이 되도록 처리
      existingItem.count = (existingItem.count || 1) + 1;
      existingItem.date = today;
    } else {
      // 1회 최초 등록
      data[subject].push({
        concept: targetConcept,
        date: today,
        count: 1
      });
    }
    
    saveJson(INCORRECT_PATH, data);
    res.json({ success: true, incorrect: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. 오답 간편 삭제
app.post('/api/incorrect/delete', (req, res) => {
  const { subject, concept } = req.body;
  if (!subject || !concept) {
    return res.status(400).json({ success: false, error: 'subject(accounting/facility/civil) 및 concept 정보가 필요합니다.' });
  }

  try {
    const data = loadJson(INCORRECT_PATH, { accounting: [], facility: [], civil: [] });
    if (data[subject]) {
      data[subject] = data[subject].filter(item => item.concept.trim() !== concept.trim());
      saveJson(INCORRECT_PATH, data);
    }
    res.json({ success: true, incorrect: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. 시험지 채점 및 오답 자동 환류 처리
app.post('/api/submit-test', (req, res) => {
  const { filename, userAnswers } = req.body; // userAnswers: { "1": 2, "2": 5, ... } (1-indexed)
  
  if (!filename || !userAnswers) {
    return res.status(400).json({ success: false, error: 'filename 및 userAnswers가 누락되었습니다.' });
  }

  const filePath = path.join(DAILY_TESTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '해당 시험지 파일을 찾을 수 없습니다.' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsedQuiz = parseMarkdownQuiz(content, filename);
    
    // 과목 매핑 결정
    let subjectKey = 'facility';
    if (parsedQuiz.subject.includes('회계')) {
      subjectKey = 'accounting';
    } else if (parsedQuiz.subject.includes('민법')) {
      subjectKey = 'civil';
    }

    const report = [];
    let correctCount = 0;
    const totalQuestions = parsedQuiz.questions.length;
    
    const incorrectData = loadJson(INCORRECT_PATH, { accounting: [], facility: [], civil: [] });
    const today = new Date().toISOString().split('T')[0];

    for (const q of parsedQuiz.questions) {
      const userAnsNum = parseInt(userAnswers[q.id], 10) || 0;
      const isCorrect = userAnsNum === q.answerNum;

      if (isCorrect) {
        correctCount++;
      } else {
        // ℹ️ [피봇 전환] 자동 오답 등록은 중단하고 사용자의 수동 등록으로 오답 노트를 일관성 있게 관리합니다.
      }

      report.push({
        id: q.id,
        question: q.question,
        options: q.options,
        userAnswer: userAnsNum,
        correctAnswer: q.answerNum,
        correctAnswerText: q.answerText,
        isCorrect: isCorrect,
        explanation: q.explanation
      });
    }

    // 오답 파일 디스크 저장
    saveJson(INCORRECT_PATH, incorrectData);

    const score = Math.round((correctCount / totalQuestions) * 100);

    res.json({
      success: true,
      score: score,
      correctCount: correctCount,
      totalCount: totalQuestions,
      subject: parsedQuiz.subject,
      date: parsedQuiz.date,
      report: report
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 서버 기동
app.listen(PORT, () => {
  console.log(`🚀 [API Server] Express가 포트 ${PORT}에서 정상 작동 중입니다!`);
});
