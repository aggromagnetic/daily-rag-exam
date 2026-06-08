import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve('data', 'config.json');

/**
 * 🌟 안전한 JSON 로드 유틸리티 🌟
 */
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error('⚠️ [Gemini-Lib] 설정 파일을 읽는 데 실패했습니다.', e);
    }
  }
  return {};
}

/**
 * 💡 텍스트 내 비정상 반복 생성(무한 루프) 검출 필터 💡
 */
function hasRepetitionAnomaly(text) {
  // 3글자 이상 50글자 이하의 문구/단어가 연속 5회 이상 반복되는지 검출
  const repeatRegex = /(.{3,50}?)\1{4,}/g;
  if (repeatRegex.test(text)) {
    return true;
  }
  return false;
}

let currentKeyIndex = 0; // 🪐 Global API key rotator index
const disabledKeys = new Set(); // 🚫 Quota limit 0 (free tier) keys to skip

/**
 * ✂️ 마크다운 시험지를 Q20번 기준으로 2개의 배치로 분할 (Q1~20 / Q21~)
 */
function splitMarkdownIntoBatches(markdown, batchSize = 5) {
  const headers = [
    "## [정답 및 상세 해설]",
    "### [정답 및 상세 해설]",
    "[정답 및 상세 해설]",
    "## 정답 및 상세 해설",
    "정답 및 상세 해설",
    "## 정답 및 해설",
    "정답 및 해설",
    "## [정답 및 해설]"
  ];
  
  let headerIndex = -1;
  let selectedHeader = "";
  for (const header of headers) {
    const idx = markdown.indexOf(header);
    if (idx !== -1) {
      headerIndex = idx;
      selectedHeader = header;
      break;
    }
  }
  
  if (headerIndex === -1) {
    return [markdown];
  }
  
  const questionsPart = markdown.substring(0, headerIndex);
  const explanationsPart = markdown.substring(headerIndex + selectedHeader.length);
  
  // 5문항 단위 분할 지점 자동 계산 (6번, 11번, 16번, 21번...)
  const splitNumbers = [];
  for (let num = batchSize + 1; num <= 100; num += batchSize) {
    const qRegex = new RegExp(`\\n${num}\\s*[\\.\\s번]`);
    const eRegex = new RegExp(`\\n${num}\\s*[\\.\\s번]`);
    if (qRegex.test(questionsPart) && eRegex.test(explanationsPart)) {
      splitNumbers.push(num);
    }
  }
  
  if (splitNumbers.length === 0) {
    return [markdown];
  }
  
  const qSegments = [];
  const eSegments = [];
  
  let currentQ = questionsPart;
  let currentE = explanationsPart;
  
  for (let i = 0; i < splitNumbers.length; i++) {
    const num = splitNumbers[i];
    const qRegex = new RegExp(`\\n${num}\\s*[\\.\\s번]`);
    const eRegex = new RegExp(`\\n${num}\\s*[\\.\\s번]`);
    
    const qMatch = currentQ.match(qRegex);
    const eMatch = currentE.match(eRegex);
    
    if (qMatch && eMatch) {
      qSegments.push(currentQ.substring(0, qMatch.index).trim());
      currentQ = currentQ.substring(qMatch.index).trim();
      
      eSegments.push(currentE.substring(0, eMatch.index).trim());
      currentE = currentE.substring(eMatch.index).trim();
    }
  }
  qSegments.push(currentQ.trim());
  eSegments.push(currentE.trim());
  
  const batches = [];
  for (let i = 0; i < qSegments.length; i++) {
    const isFirst = (i === 0);
    const startNum = i * batchSize + 1;
    const batchTitleQ = isFirst ? "## [시험 문제지]" : `## [시험 문제지] (제${i+1}부: ${startNum}번부터)`;
    const batchTitleE = isFirst ? selectedHeader : `${selectedHeader} (제${i+1}부: ${startNum}번부터)`;
    
    let qSeg = qSegments[i];
    const qHeaders = ["## [시험 문제지]", "### [시험 문제지]", "## 시험 문제지", "시험 문제지"];
    for (const qH of qHeaders) {
      if (qSeg.startsWith(qH)) {
        qSeg = qSeg.substring(qH.length).trim();
      }
    }
    const partIndRegex = /^## \[시험 문제지\] \(제\d+부: \d+번부터\)/;
    qSeg = qSeg.replace(partIndRegex, '').trim();
    
    let eSeg = eSegments[i];
    const ePartIndRegex = new RegExp(`^${selectedHeader.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\(제\\d+부:\\s*\\d+번부터\\)`);
    eSeg = eSeg.replace(ePartIndRegex, '').trim();
    
    const batchContent = `${batchTitleQ}\n\n${qSeg}\n\n${batchTitleE}\n${eSeg}`;
    batches.push(batchContent);
  }
  
  return batches;
}

/**
 * 🧩 검증된 배치 마크다운에서 문제와 해설 파트를 정밀하게 추출
 */
function extractQuestionsAndExplanations(verifiedMarkdown) {
  const headers = [
    "## [정답 및 상세 해설]",
    "### [정답 및 상세 해설]",
    "[정답 및 상세 해설]",
    "## 정답 및 상세 해설",
    "정답 및 상세 해설",
    "## 정답 및 해설",
    "정답 및 해설",
    "## [정답 및 해설]"
  ];
  
  let headerIndex = -1;
  for (const header of headers) {
    const idx = verifiedMarkdown.indexOf(header);
    if (idx !== -1) {
      headerIndex = idx;
      break;
    }
  }
  
  if (headerIndex === -1) {
    return { questions: verifiedMarkdown, explanations: "" };
  }
  
  let questions = verifiedMarkdown.substring(0, headerIndex).trim();
  const qHeaders = ["## [시험 문제지] (제2부: 21번부터)", "## [시험 문제지]", "### [시험 문제지]", "## 시험 문제지", "시험 문제지"];
  
  // 동적 파트 헤더 청소
  const qHeaderRegex = /^##\s*\[?시험\s*문제지\]?\s*\(제\d+부:\s*\d+번부터\)/;
  questions = questions.replace(qHeaderRegex, '').trim();
  
  for (const qH of qHeaders) {
    if (questions.startsWith(qH)) {
      questions = questions.substring(qH.length).trim();
      break;
    }
  }
  
  const explanationPartRaw = verifiedMarkdown.substring(headerIndex);
  const firstNewline = explanationPartRaw.indexOf('\n');
  let explanations = firstNewline !== -1 
    ? explanationPartRaw.substring(firstNewline).trim() 
    : "";
    
  // 동적 해설 헤더 청소
  const eHeaderRegex = /^##\s*\[?정답\s*및\s*상세\s*해설\]?\s*\(제\d+부:\s*\d+번부터\)/;
  explanations = explanations.replace(eHeaderRegex, '').trim();
    
  return { questions, explanations };
}

/**
 * 📊 API 사용 요금 기록 및 누적 (USD, KRW 변환)
 */
function recordApiUsage(inputTokens, outputTokens, costUsd, costKrw, subjectName) {
  try {
    const usagePath = path.resolve('public', 'daily_tests', 'api_usage.json');
    let data = {
      total_cost_usd: 0.0,
      total_cost_krw: 0,
      last_updated: new Date().toISOString(),
      history: []
    };
    
    if (fs.existsSync(usagePath)) {
      try {
        data = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
      } catch (e) {
        console.warn("⚠️ data/api_usage.json 파싱 실패로 초기화합니다.");
      }
    }
    
    data.total_cost_usd += costUsd;
    data.total_cost_krw += costKrw;
    data.last_updated = new Date().toISOString();
    
    if (!data.history) data.history = [];
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    data.history.push({
      date: kstDate,
      timestamp: new Date().toISOString(),
      subject: subjectName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      cost_krw: costKrw
    });
    
    // 최근 50개 이력만 유지
    if (data.history.length > 50) {
      data.history = data.history.slice(data.history.length - 50);
    }
    
    const dir = path.dirname(usagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(usagePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`📊 [API 비용 기록] 이번 검증: 약 ${costKrw}원 ($${costUsd.toFixed(4)}) | 오늘 총 누적: 약 ${data.total_cost_krw}원 ($${data.total_cost_usd.toFixed(4)})`);
  } catch (err) {
    console.error("⚠️ API 사용 요금 기록 실패:", err.message);
  }
}

/**
 * 💡 단일 배치에 대한 Gemini 검증 및 교정 수행 (API 키 자동 로테이션 및 Failover 지원)
 */
async function verifySingleBatchWithGemini(rawBatchMarkdown, subjectName, docGuideName, batchLabel = "") {
  const config = loadConfig();
  const apiKeys = (config.geminiApiKeys || []).filter(k => !disabledKeys.has(k));

  if (apiKeys.length === 0) {
    console.warn(`⚠️ [Gemini-Warning] 등록된 API Key가 없거나 모두 비활성화되어 ${batchLabel} 검증을 건너뜁니다.`);
    return rawBatchMarkdown;
  }

  const systemRole = `당신은 대한민국 최고 권위의 주택관리사보 자격시험 수석 출제 검토관입니다. 
아래 전달받은 [초안 시험지]는 RAG가 1차 추출한 모의고사 본문(일부 배치)입니다. 시험지 내 오타, 비문, 부정확하거나 어색한 표현 등을 전문적인 국가자격시험 용어에 맞춰 매끄럽고 윤택하게 교정하고 정제해 주십시오.

[🚨 교정 및 정제 규칙 - 필독]
1. 지문 내 오류/어색한 표현 윤문 및 원본 논지 보존
   - 초안 시험지의 원래 핵심 질문 의도, 보기 선지 구성, 그리고 정답 배치 등 골자는 최대한 보존하십시오.
   - 단, 지문 및 선지 내의 **부정확한 용어 표현, 어색한 직역투의 문장, 비문(문법에 맞지 않는 문장), 오타 등은 대한민국 주택관리사보 자격시험 출제 기준에 부합하도록 아주 정밀하게 올바른 한국어 문장으로 교정 및 다듬기**를 수행하십시오. 문제를 새로 창조하거나 핵심 정답 논지를 훼손하지 않는 선에서 품위 있는 표준 문장으로 다듬어야 합니다.
2. 정답 및 해설의 논리적/사실적 오류 정밀 교정
   - 각 문제의 **정답 번호와 해설 내용이 서로 일치하는지 논리적 정합성을 엄격히 검증**하십시오. (예: 해설부에는 '2번이 옳은 설명이다'라고 적혀 있으나 정답 번호 마커는 '정답: ①'로 어긋나게 잘못 표기되어 있는 경우, 해설의 논리적 결론에 부합하도록 정답 번호를 정확하게 매칭 교정하십시오.)
   - 해설 텍스트 내의 **법률 조문 인용 오류, 회계 연산 수치 오류, 설비 기준 수치 오류 등 명백하게 틀린 설명이 포함된 경우, 올바른 관계 법령(민법 등) 및 K-IFRS 회계기준, 설비 기준에 완벽히 부합하도록 올바르게 해설 내용을 수정 및 보완**해 주십시오.
   - 문제 자체의 설계 오류로 인해 정답이 없거나 복수 정답이 발생하는 경우, 선지 내용 중 하나를 미세하게 조정하여 단 하나의 유일하고 명확한 정답만 존재하도록 문제를 정상화하십시오.
3. 서식 및 오류의 칼같은 정상화
   - 각 문제는 **반드시** 아라비아 숫자 번호와 마침표, 그리고 공백으로 시작해야 합니다. (예: "1. 민법의 법원...", "2. 신의성실의...")
   - "⚠️ 오지선다 정교화 파싱에 실패했습니다" 와 같은 파싱 실패 경고 문구는 **완전히 제거**하고, 해당 문제의 보기를 일반 5지선다 형태로 깨끗하게 복구하십시오.
   - 보기 마커는 무조건 '①', '②', '③', '④', '⑤' 특수 기호를 사용하고, 각 보기는 한 줄에 하나씩 단정하게 줄바꿈 정렬하십시오.
   - 지문 내부에 "ㄱ. ... ㄴ. ... ㄷ. ..." 이나 "㉠ ... ㉡ ... ㉢ ..." 과 같은 박스 조건 지문이 포함되어 있을 경우, **절대로 한 줄로 길게 이어 붙이거나 생략하지 말고, 각 조건마다 반드시 줄바꿈(\\n)을 정밀하게 삽입**하여 단정한 리스트 레이아웃으로 100% 완벽히 보존하십시오.
   - 문제지 마지막 부분에 해설이 있을 경우 각 해설 번호별 정답 마커는 반드시 "정답: ①", "해설: ..." 형식으로 정확하게 마감하십시오.
4. 출력 형식 극도로 준수: 
   - 검토 로그, 인사말, 교정 내역 요약, 완료 알림 등 부가 사족은 **절대로** 출력하지 마십시오.
   - 오직 위 규칙이 100% 적용된 **최종 마크다운 텍스트**만 그대로 반환하십시오. 절대 중간에 생략(예: "3. ~ 14. 동일함")하지 말고 끝까지 끝마쳐 주십시오.`;

  const promptContent = `
[초안 시험지] (${batchLabel})
---
${rawBatchMarkdown}
---

위 [초안 시험지]를 수석 출제 검토관 입장에서 엄밀히 교정하고, 사족 없이 정제 완료된 최종 마크다운 텍스트만 처음부터 끝까지 완전하게 출력하세요.
`;

  for (let i = 0; i < apiKeys.length; i++) {
    const keyIdx = (currentKeyIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIdx];
    const originalIndex = (config.geminiApiKeys || []).indexOf(apiKey);
    const keyMasked = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
    
    console.log(`📡 [Gemini-Verification] [${batchLabel}] [시도 ${i + 1}/${apiKeys.length}] API Key #${originalIndex + 1} (${keyMasked})로 요청을 전송 중...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemRole}\n\n${promptContent}` }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 65536
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        if (errText.includes("limit: 0") && errText.includes("gemini-3.1-pro")) {
          console.warn(`🚫 [Gemini-API] API Key #${originalIndex + 1}은 gemini-3.1-pro 한도가 0(무료 계정)이므로 세션 내 비활성화 처리합니다.`);
          disabledKeys.add(apiKey);
        }
        throw new Error(`HTTP Error ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const verifiedText = json.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!verifiedText || verifiedText.trim().length < 150) {
        throw new Error('응답의 텍스트가 유실되었거나 지나치게 짧습니다.');
      }

      if (hasRepetitionAnomaly(verifiedText)) {
        throw new Error('응답 텍스트에 비정상적인 문구 무한 반복 현상이 검출되었습니다.');
      }

      const minAcceptableLength = Math.max(1000, Math.floor(rawBatchMarkdown.length * 0.45));
      if (verifiedText.length < minAcceptableLength) {
        throw new Error(`응답이 중간에 잘렸습니다. (수신 크기: ${verifiedText.length}자, 최소 요구: ${minAcceptableLength}자)`);
      }

      console.log(`✅ [Gemini-Verification] [${batchLabel}] 교정 성공! (크기: ${verifiedText.length} 자)`);
      
      // 📊 요금 계산 및 로깅 구문
      const inputChars = (systemRole + "\n\n" + promptContent).length;
      const inputTokens = Math.ceil(inputChars * 1.3); // 한글 토큰 가중치 반영
      const outputTokens = Math.ceil(verifiedText.length * 1.3);
      const inputCostUsd = (inputTokens * 1.25) / 1000000;
      const outputCostUsd = (outputTokens * 5.00) / 1000000;
      const costUsd = inputCostUsd + outputCostUsd;
      const costKrw = Math.ceil(costUsd * 1400); // 1 USD = 1400원 변환
      
      recordApiUsage(inputTokens, outputTokens, costUsd, costKrw, subjectName);

      currentKeyIndex = (keyIdx + 1) % apiKeys.length;

      let cleanedMarkdown = verifiedText.trim();
      if (cleanedMarkdown.startsWith('```markdown')) {
        cleanedMarkdown = cleanedMarkdown.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      } else if (cleanedMarkdown.startsWith('```')) {
        cleanedMarkdown = cleanedMarkdown.replace(/^```\n/, '').replace(/\n```$/, '');
      }
      
      return cleanedMarkdown;

    } catch (error) {
      console.warn(`⚠️ [Gemini-Failover] [${batchLabel}] API Key #${keyIdx + 1} (${keyMasked}) 실패: ${error.message}`);
    }
  }

  console.error(`🚨 [Gemini-Emergency] [${batchLabel}] 모든 API Key가 만료되었거나 실패했습니다.`);
  return rawBatchMarkdown;
}

/**
 * 🪐 [Gemini 2차 정밀 검증 에이전트 (지능형 배치 분할 버전)] 🪐
 */
export async function verifyQuizWithGemini(rawQuizMarkdown, subjectName, docGuideName) {
  console.log(`\n🪐 [Gemini-Verification] '${subjectName}' 과목의 2차 정밀 검증 루틴을 기동합니다...`);

  if (!rawQuizMarkdown || rawQuizMarkdown.trim().length < 200 || rawQuizMarkdown.includes('success": false')) {
    return rawQuizMarkdown;
  }

  console.log(`⚡ [Gemini-Verification] 단일 배치 전체 검증 수행 (출력 한도 65,536 토큰 설정)`);
  return await verifySingleBatchWithGemini(rawQuizMarkdown, subjectName, docGuideName, "전체 배치");
}
