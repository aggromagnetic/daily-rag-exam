import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

/**
 * 🪐 [Gemini Gem Canvas] 브라우저 자동화 수확 컴파일러
 * @param {string} rawDraftMarkdown - 1차 교정된 RAG 마크다운 텍스트
 * @param {string} subjectName - 과목명 (예: 회계원리, 시설개론, 민법)
 * @param {string} subjectKey - 과목 영문 키 (accounting, facility, civil)
 * @returns {Promise<string|null>} - 수확된 프리미엄 인터랙티브 HTML 소스코드
 */
export async function compileInteractiveHtmlViaBrowser(rawDraftMarkdown, subjectName, subjectKey) {
  console.log("==================================================");
  console.log(` 🪐 [Gemini Canvas 수확기] '${subjectName}' 인터랙티브 컴파일 개시 `);
  console.log("==================================================");

  if (!rawDraftMarkdown || rawDraftMarkdown.trim().length < 200) {
    console.error("❌ 오류: 입력 마크다운 데이터가 유실되었거나 너무 작습니다.");
    return null;
  }

  const chromeProfilePath = '/Users/aggro/Library/Application Support/notebooklm-mcp/chrome_profile';
  console.log("🚀 Google Chrome 브라우저 실행 중 (인증 프로필 장착)...");
  
  const browser = await puppeteer.launch({
    headless: true, // 수험생님의 Mac 컴퓨터 사용을 방해하지 않는 진짜 무화면 백그라운드 모드 (완전 투명)
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: chromeProfilePath,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  
  // 브라우저 경고창 차단
  page.on('dialog', async dialog => {
    console.log(`💬 대화상자 차단: [${dialog.type()}] ${dialog.message()}`);
    await dialog.dismiss();
  });

  try {
    const gemUrl = "https://gemini.google.com/gem/1Y2rIF58xoc4vZYb_FRyGfTeFO9poQ9G3?authuser=1";
    console.log(`🎯 전용 일타강사 Gem 페이지로 이동 중:\n   ${gemUrl}`);
    
    await page.goto(gemUrl, {
      waitUntil: "networkidle2",
      timeout: 90000
    });

    console.log("⏳ 제미나이 웹 앱 로딩 대기 중 (5초)...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 입력창 탐색
    const inputSelector = 'div[aria-label="Gemini 프롬프트 입력"]';
    console.log("🔎 입력창 탐색 중...");
    await page.waitForSelector(inputSelector, { timeout: 45000 });
    
    console.log("⌨️ RAG 문제지 복사 내용 및 교정/컴파일 명령 입력 중...");
    const systemInstruction = `
[🚨 일타강사 Gem 지침에 의거한 긴급 요청]
아래 전달하는 [1차 RAG 문제지]를 당신의 고유 지침(계산 제외 논리 근거 충족, 오류/오타 교정)에 따라 고품질 퀴즈로 엄격 교정한 뒤, 수험생님이 클릭으로 풀 수 있는 **"프리미엄 인터랙티브 퀴즈 웹앱 HTML 소스코드"**로 즉석에서 깎아내 주십시오.

[🚨 절대 준수 사항]
1. HTML 소스코드는 아라비아 숫자 번호 문제를 누락 없이 100% 반영하여 완벽하게 마감해야 합니다.
2. 부모 창으로 오답 수첩 데이터를 쏘아주는 **syncToParentGist() 및 postMessage 코드**를 반드시 스크립트에 탑재해 주십시오.
3. 소스코드가 중간에 잘리지 않도록 극도로 슬림하고 초경량화된 단일 파일 구조로 출력하십시오.
4. 설명이나 잡설 없이 오직 \`<!doctype html>\`로 시작하여 \`</html>\`로 끝나는 HTML 소스 코드만 깔끔하게 출력하십시오.

[🚨 박스형 보기 지문(ㄱ, ㄴ, ㄷ, ㄹ / ㉠, ㉡, ㉢, ㉣) 철저 보존 및 줄바꿈 지침]
- 문제 지문 본문에 "ㄱ. ... ㄴ. ... ㄷ. ... ㄹ. ..." 또는 "㉠ ... ㉡ ... ㉢ ... ㉣ ..." 등과 같은 박스형 보기 조건이 포함되어 있는 경우, 이 조건들은 문제를 푸는 핵심 단서이므로 **절대로 소스코드에서 유실하거나 생략해서는 안 됩니다.**
- 보기 조건들은 문제 본문 영역(Question Text) 안에서 각각 알아보기 쉽게 반드시 줄바꿈(\`\\n\` 또는 \`<br>\` 태그) 처리하여 단정하게 정렬된 형태로 100% 온전하게 렌더링되도록 하십시오.

---
[1차 RAG 문제지]
${rawDraftMarkdown}
`;

    // DOM 주입 방식으로 대량 텍스트 안정적으로 입력
    await page.evaluate((selector, text) => {
      const el = document.querySelector(selector);
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputSelector, systemInstruction);

    console.log("⏳ 입력 데이터 안정화 대기 (1.5초)...");
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 전송 버튼 탐색 및 클릭
    const sendButtonSelector = 'button[aria-label="메시지 보내기"]';
    console.log("🔎 전송 버튼 탐색 및 클릭 중...");
    await page.waitForSelector(sendButtonSelector, { timeout: 30000 });
    
    // 강제 활성화 처리 후 클릭
    await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      if (btn) {
        btn.removeAttribute('disabled');
        btn.click();
      }
    }, sendButtonSelector);

    console.log("🚀 프롬프트 제출 완료! 일타강사 Gem이 문제 교정 및 HTML을 제작하고 있습니다...");
    console.log("⏳ 생성 완료될 때까지 지능형 HTML 크기 안정화 알고리즘으로 모니터링을 개시합니다...");

    // HTML 크기 안정화 Completion 감지 엔진
    let lastLength = 0;
    let unchangedCounter = 0;
    let harvestedHtml = null;
    let elapsed = 0;
    const timeoutLimit = 360000; // 최대 6분
    const checkInterval = 3000;  // 3초 단위 체크

    while (elapsed < timeoutLimit) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;

      // 1. Canvas의 '코드' 버튼 탐색 및 클릭 시도
      const codeButtonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const codeBtn = buttons.find(b => b.innerText.includes('코드') || b.textContent.includes('코드'));
        if (codeBtn) {
          codeBtn.click();
          return true;
        }
        return false;
      });

      if (codeButtonClicked) {
        // '코드' 버튼이 노출되기 시작함
      }

      // 2. Monaco Editor 또는 DOM 코드 영역에서 텍스트 수확 시도
      const currentHtml = await page.evaluate(() => {
        // A. Monaco Editor 전역 모델에서 추출 시도
        try {
          if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
              for (const model of models) {
                const text = model.getValue();
                if (text.includes('<!doctype html>') || text.includes('<html')) {
                  return text;
                }
              }
            }
          }
        } catch (e) {}

        // B. textarea 또는 Monaco DOM 구성 요소에서 직접 텍스트 추출 시도
        const textareas = Array.from(document.querySelectorAll('textarea'));
        for (const ta of textareas) {
          const val = ta.value || '';
          if (val.includes('<!doctype html>') || val.includes('<html')) {
            return val;
          }
        }

        // C. DOM의 일반 code 블록 또는 pre 블록 검사
        const codeBlocks = Array.from(document.querySelectorAll('code, pre code, .view-lines'));
        for (const block of codeBlocks) {
          const text = block.innerText || block.textContent || '';
          if (text.includes('<!doctype html>') || text.includes('<html')) {
            return text;
          }
        }

        // D. Canvas Iframe 예외 검사
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.srcdoc && iframe.srcdoc.trim().length > 500) {
          return iframe.srcdoc;
        }

        return null;
      });

      if (currentHtml) {
        const currentLength = currentHtml.trim().length;
        console.log(`⏱️ 수확기 동작 중 (${Math.round(elapsed/1000)}초 경과) -> HTML 획득 중! 크기: ${currentLength}자`);

        if (currentLength > 1000 && currentLength === lastLength) {
          unchangedCounter++;
          // 6초 동안 크기가 유지되면 완성으로 간주 (3초 * 2회)
          if (unchangedCounter >= 2) {
            harvestedHtml = currentHtml;
            console.log(`\n🎉 [수확 성공] '${subjectName}' HTML 안정화 판단 및 마감 처리 완료!`);
            break;
          }
        } else {
          unchangedCounter = 0;
          lastLength = currentLength;
        }
      } else {
        console.log(`⏱️ 수확기 동작 중 (${Math.round(elapsed/1000)}초 경과) -> Canvas 생성 대기 중...`);
      }
    }

    if (harvestedHtml && harvestedHtml.trim().length > 1000) {
      let cleanedHtml = harvestedHtml.trim();
      
      // 백틱 마크다운 래퍼 정제
      if (cleanedHtml.startsWith('```html')) {
        cleanedHtml = cleanedHtml.replace(/^```html\n/, '').replace(/\n```$/, '');
      } else if (cleanedHtml.startsWith('```')) {
        cleanedHtml = cleanedHtml.replace(/^```\n/, '').replace(/\n```$/, '');
      }
      return cleanedHtml;
    } else {
      console.error("❌ 오류: HTML 수확 실패 또는 크기 미달.");
      // 실패 시 분석용 스크린샷 기록
      try {
        const errScrPath = path.resolve('scratch', `err_${subjectKey}_canvas.png`);
        await page.screenshot({ path: errScrPath });
        console.log(`📸 분석용 스크린샷 덤프 저장 완료: ${errScrPath}`);
      } catch (scre) {}
      return null;
    }

  } catch (error) {
    console.error("❌ 수확기 내 치명적 예외 발생:", error);
    return null;
  } finally {
    console.log("🛑 브라우저 인스턴스를 정상적으로 소멸시킵니다.");
    await browser.close();
  }
}
