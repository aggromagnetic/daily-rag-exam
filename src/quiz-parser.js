// ==========================================================================
// 🪐 지능형 클라이언트 사이드 마크다운 시험지 파서 (quiz-parser.js)
// ==========================================================================

/**
 * 마크다운 텍스트를 파싱하여 { questions: [...], subject: string, date: string } 구조로 반환합니다.
 * 100% 브라우저(클라이언트) 환경에서 구동 가능하도록 Node.js 디펜던시 없이 작성되었습니다.
 */
export function parseMarkdownQuiz(rawContent, filename) {
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
    console.log("ℹ[] parseMarkdownQuiz: File content is normal markdown text.");
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
