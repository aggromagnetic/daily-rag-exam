import fs from 'fs';
import path from 'path';

function parseMarkdownQuiz(rawContent, filename) {
  let markdownText = rawContent;

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

  const solutions = {};
  if (solutionPart) {
    let solBlocks = [];
    const hasNumberedSol = /\n\d+\s*[\.번]/.test(solutionPart) || /\nQ\d+\s*[\.번\s]/.test(solutionPart);
    
    if (hasNumberedSol) {
      solBlocks = solutionPart.split(/\n(?=\d+[\.번\s])|\n(?=Q\d+[\.번\s])/);
    } else {
      solBlocks = solutionPart.split(/\n(?=정답\s*[:은])|\n(?=\[정답\])/);
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

  let qBlocks = bodyPart.split(/\n(?=\d+[\.번\s])|\n(?=Q\d+[\.번\s])/);
  
  let currentHeader = '';
  if (qBlocks.length > 0 && !/^\d+[\.번\s]|^Q\d+/.test(qBlocks[0].trim())) {
    currentHeader = qBlocks.shift().trim();
  }

  const hasOptionsPattern = (bodyPart.match(/[①-⑤]/g) || []).length >= 5;
  if (qBlocks.length < 3 && hasOptionsPattern) {
    console.log("⚠️ [Parser-Guard] 번호 식별 불가 감지. 지능형 보기 기호(①-⑤) 컨텍스트 누적 파싱 가동!");
    const lines = bodyPart.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    qBlocks = [];
    let virtualId = 1;
    let accumulatedText = "";

    for (const line of lines) {
      const optionCount = (line.match(/[①-⑤]/g) || []).length;
      if (optionCount >= 2) {
        let fullQuestionLine = accumulatedText ? (accumulatedText + "\n" + line) : line;
        
        if (/^\d+[\.번\s]|^Q\d+/.test(fullQuestionLine)) {
          qBlocks.push(fullQuestionLine);
        } else {
          qBlocks.push(`${virtualId}. ${fullQuestionLine}`);
        }
        virtualId++;
        accumulatedText = "";
      } else {
        if (accumulatedText) {
          accumulatedText += "\n" + line;
        } else {
          accumulatedText = line;
        }
      }
    }
    if (virtualId === 1 && accumulatedText) {
      currentHeader = accumulatedText;
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
      answerNum: sol.answerNum,
      answerText: sol.answerText,
      explanation: sol.explanation
    });
  }

  return {
    subject,
    date,
    header: currentHeader,
    questionsCount: questions.length,
    questions: questions.slice(0, 3) // show first 3
  };
}

const civFile = fs.readFileSync('daily_tests/2026-05-20_민법.md', 'utf8');
console.log('--- CIVIL ---');
console.log(JSON.stringify(parseMarkdownQuiz(civFile, '2026-05-20_민법.md'), null, 2));

const accFile = fs.readFileSync('daily_tests/2026-05-20_회계원리.md', 'utf8');
console.log('--- ACCOUNTING ---');
console.log(JSON.stringify(parseMarkdownQuiz(accFile, '2026-05-20_회계원리.md'), null, 2));
