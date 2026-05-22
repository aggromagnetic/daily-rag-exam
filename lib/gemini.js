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
 * 💡 텍스트 내 비정상 반복 생성(무한 루프) 감출 필터 💡
 */
function hasRepetitionAnomaly(text) {
  // 3글자 이상 50글자 이하의 문구/단어가 연속 5회 이상 반복되는지 검출
  const repeatRegex = /(.{3,50}?)\1{4,}/g;
  if (repeatRegex.test(text)) {
    return true;
  }
  return false;
}

/**
 * 🪐 [Gemini 2차 정밀 검증 에이전트] 🪐
 * NotebookLM RAG가 생성한 초안 마크다운을 분석하여, 오류 교정, 정답 매핑 복구, 오지선다 정교화 및 오타 교정을 수행합니다.
 * 등록된 5개의 구글 Gemini API Key 풀을 순환하여 호출하므로 Rate Limit 및 네트워크 실효 위기를 완벽하게 극복합니다.
 *
 * @param {string} rawQuizMarkdown RAG 초안 퀴즈 마크다운
 * @param {string} subjectName 과목명 (예: 민법, 회계원리)
 * @param {string} docGuideName 타겟 RAG 가이드 문서명
 * @returns {Promise<string>} 정제 및 교정 완료된 최종 마크다운 시험지
 */
export async function verifyQuizWithGemini(rawQuizMarkdown, subjectName, docGuideName) {
  console.log(`\n🪐 [Gemini-Verification] '${subjectName}' 과목의 2차 정밀 검증 및 철벽 교정 루틴을 기동합니다...`);

  // 1차 RAG 원본 자체가 없거나 극도로 짧은 비정상(에러 메시지 등) 상태인 경우 검증을 패스하고 원본 그대로 리턴
  if (!rawQuizMarkdown || rawQuizMarkdown.trim().length < 200 || rawQuizMarkdown.includes('success": false')) {
    console.warn(`⚠️ [Gemini-Warning] RAG 초안이 비어있거나 에러 상태입니다. 검증을 건너뛰고 원본을 반환합니다.`);
    return rawQuizMarkdown;
  }

  const config = loadConfig();
  const apiKeys = config.geminiApiKeys || [];

  if (apiKeys.length === 0) {
    console.warn('⚠️ [Gemini-Warning] 등록된 Gemini API Key가 없습니다. RAG가 생성한 원본 초안 문제지를 그대로 사용합니다.');
    return rawQuizMarkdown;
  }

  // 1. 최고 권위 출제 검토위원 프롬프트 작성 (모델의 부하 및 반복 유도를 방지하기 위해 정교하고 직관적인 프롬프트 적용)
  const systemRole = `당신은 대한민국 최고 권위의 주택관리사보 자격시험 수석 출제 검토관입니다. 
아래 전달받은 [초안 시험지]는 RAG(NotebookLM)가 1차 추출한 모의고사 본문입니다. RAG 생성 한계로 인해 정답 불일치, "⚠️ 오지선다 정교화 파싱에 실패했습니다" 등의 오류 표시, 잘못된 문제 번호 포맷(예: Q1., 문 1. 등), 오타, 지문 줄바꿈 훼손 등이 섞여 있을 수 있습니다.

[🚨 교정 및 정제 규칙 - 필독]
1. 불필요한 전체 재작성 절대 금지 (최소 변경 원칙)
   - 초안 시험지의 원래 지문, 보기 내용, 문제 자체의 알맹이는 **100% 보존**하십시오. 쓸데없이 지문을 새로 만들거나 말을 화려하게 바꾸어 재생성 시간을 낭비하거나 출력 중단을 야기하지 마십시오.
2. 서식 및 오류의 칼같은 정상화
   - 각 문제는 **반드시** 아라비아 숫자 번호와 마침표, 그리고 공백으로 시작해야 합니다. (예: "1. 민법의 법원...", "2. 신의성실의...")
   - "⚠️ 오지선다 정교화 파싱에 실패했습니다" 와 같은 파싱 실패 경고 문구나 OMR 직접 마킹 요청 문구는 **완전히 제거**하고, 해당 문제의 보기를 일반 5지선다 형태로 깨끗하게 복구하십시오.
   - 보기 마커는 무조건 '①', '②', '③', '④', '⑤' 특수 기호를 사용하고, 각 보기는 한 줄에 하나씩 단정하게 줄바꿈 정렬하십시오.
   - 문제지 맨 마지막에 "## [정답 및 상세 해설]" 헤더를 위치시키고, 각 해설 번호별 정답 마커는 반드시 "정답: ①", "해설: ..." 형식으로 정확하게 마감하십시오.
3. 출력 형식 극도로 준수: 
   - 검토 로그, 인사말, 교정 내역 요약, 완료 알림 등 부가 사족은 **절대로** 출력하지 마십시오.
   - 오직 위 규칙이 100% 적용된 **최종 마크다운 텍스트(## [시험 문제지] 부터 시작하는 전체 내용)**만 Drop-in으로 사용할 수 있도록 그대로 반환하십시오. 절대 중간에 생략(예: "3. ~ 24. 동일함")하지 말고 끝까지 끝마쳐 주십시오.`;

  const promptContent = `
[초안 시험지]
---
${rawQuizMarkdown}
---

위 [초안 시험지]를 수석 출제 검토관 입장에서 엄밀히 교정하고, 사족 없이 정제 완료된 최종 마크다운 텍스트만 처음부터 끝까지 완전하게 출력하세요.
`;

  // 2. 다중 API Key Failover / Rotation 루프 실행
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyMasked = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
    
    console.log(`📡 [Gemini-Verification] [시도 ${i + 1}/${apiKeys.length}] API Key (${keyMasked})로 요청을 전송 중...`);

    // 추론력이 강력하고 컨텍스트 유실이 없는 Gemini 2.5 Pro 모델 사용
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemRole}\n\n${promptContent}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.25, // 지나치게 낮아서 발생하는 반복 생성 현상을 방지하면서도 일관성 확보
        maxOutputTokens: 8192
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP Error ${response.status}: ${errText}`);
      }

      const json = await response.json();
      const verifiedText = json.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!verifiedText || verifiedText.trim().length < 200) {
        throw new Error('응답의 텍스트가 유실되었거나 지나치게 짧습니다.');
      }

      // 💡 [안정화 가드 1] 무한 반복 생성 버그 검출
      if (hasRepetitionAnomaly(verifiedText)) {
        throw new Error('응답 텍스트에 비정상적인 문구 무한 반복 현상(Hallucination loop)이 검출되었습니다.');
      }

      // 💡 [안정화 가드 2] 응답 출력 잘림 현상 철벽 검출
      // 원본 RAG 텍스트 대비 지나치게 유실된 경우 (최소 75% 또는 최소 3000자 기준 중 최고치 적용)
      const minAcceptableLength = Math.max(3000, Math.floor(rawQuizMarkdown.length * 0.75));
      if (verifiedText.length < minAcceptableLength) {
        throw new Error(`응답 텍스트가 원본 대비 지나치게 유실되거나 중간에 잘렸습니다. (수신 크기: ${verifiedText.length}자, 최소 요구: ${minAcceptableLength}자)`);
      }

      console.log(`✅ [Gemini-Verification] 2차 정밀 검증 및 완벽 교정 성공! (최종 데이터 크기: ${verifiedText.length} 자)`);
      
      // 마크다운 코드 블록 백틱 (예: ```markdown ) 이 포함된 경우 순수 텍스트만 언패킹
      let cleanedMarkdown = verifiedText.trim();
      if (cleanedMarkdown.startsWith('```markdown')) {
        cleanedMarkdown = cleanedMarkdown.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      } else if (cleanedMarkdown.startsWith('```')) {
        cleanedMarkdown = cleanedMarkdown.replace(/^```\n/, '').replace(/\n```$/, '');
      }
      
      return cleanedMarkdown;

    } catch (error) {
      console.warn(`⚠️ [Gemini-Failover] API Key #${i + 1} (${keyMasked}) 요청 실패: ${error.message}`);
      if (i < apiKeys.length - 1) {
        console.log('🔄 [Gemini-Failover] 즉시 예비 API Key로 전환하여 재시도합니다...');
      }
    }
  }

  // 3. 3중 철벽 방어막 작동 (모든 API Key 실패 시 RAG 초안 폴백 반환)
  console.error('\n🚨 [Gemini-Emergency] 등록된 모든 Gemini API Key가 실패했거나, 잘림/루프 오류로 인해 유효성 검증을 통과하지 못했습니다.');
  console.warn('⚠️ [Gemini-Emergency] 서비스 연속성 확보를 위해 1차 RAG 초안 시험지를 바이패스하여 모의고사를 기동합니다.');
  return rawQuizMarkdown;
}
