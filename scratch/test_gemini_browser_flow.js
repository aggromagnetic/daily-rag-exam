import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const DRAFT_PATH = path.resolve('public', 'daily_tests', '2026-05-26_민법.md');
const OUTPUT_PATH = path.resolve('scratch', 'harvested_quiz.html');

async function automateGeminiQuizHarvest() {
  console.log("==================================================");
  console.log(" 🪐 [Gemini Gem] 브라우저 자동화 수확 에이전트 구동 ");
  console.log("==================================================");

  if (!fs.existsSync(DRAFT_PATH)) {
    console.error("❌ 오류: 1차 민법 드래프트 파일이 존재하지 않습니다.");
    process.exit(1);
  }

  const rawDraft = fs.readFileSync(DRAFT_PATH, 'utf8');
  console.log(`📝 1차 RAG 드래프트 로딩 완료 (크기: ${rawDraft.length}자)`);

  console.log("🚀 Google Chrome 브라우저 실행 중 (인증 프로필 장착)...");
  const browser = await puppeteer.launch({
    headless: false, // 실제 크롬 창 띄움 (Canvas 및 세션 로딩 감상용)
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/Users/aggro/Library/Application Support/notebooklm-mcp/chrome_profile',
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  
  // 브라우저 내부 경고창 자동 차단
  page.on('dialog', async dialog => {
    console.log(`💬 대화상자 차단: [${dialog.type()}] ${dialog.message()}`);
    await dialog.dismiss();
  });

  try {
    const gemUrl = "https://gemini.google.com/gem/1Y2rIF58xoc4vZYb_FRyGfTeFO9poQ9G3?authuser=1";
    console.log(`🎯 전용 일타강사 Gem 페이지로 이동 중:\n   ${gemUrl}`);
    
    await page.goto(gemUrl, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    console.log("⏳ 제미나이 웹 앱 로딩 대기 중 (5초)...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 입력창 탐색
    const inputSelector = 'div[aria-label="Gemini 프롬프트 입력"]';
    console.log("🔎 입력창 탐색 중...");
    await page.waitForSelector(inputSelector, { visible: true, timeout: 20000 });
    
    console.log("⌨️ RAG 문제지 복사 내용 및 교정/컴파일 명령 입력 중...");
    const systemInstruction = `
[🚨 일타강사 Gem 지침에 의거한 긴급 요청]
아래 전달하는 [1차 RAG 문제지]를 당신의 고유 지침(계산 제외 논리 근거 충족, 오류/오타 교정)에 따라 고품질 5문항 퀴즈로 엄격 교정한 뒤, 수험생님이 클릭으로 풀 수 있는 **"프리미엄 인터랙티브 퀴즈 웹앱 HTML 소스코드"**로 즉석에서 깎아내 주십시오.

[🚨 절대 준수 사항]
1. HTML 소스코드는 아라비아 숫자 1번부터 5번까지의 문제를 누락 없이 100% 반영하여 완벽하게 마감해야 합니다.
2. 부모 창으로 오답 수첩 데이터를 쏘아주는 **syncToParentGist() 및 postMessage 코드**를 반드시 스크립트에 탑재해 주십시오.
3. 소스코드가 중간에 잘리지 않도록 극도로 슬림하고 초경량화된 단일 파일 구조로 출력하십시오.
4. 설명이나 잡설 없이 오직 \`<!doctype html>\`로 시작하여 \`</html>\`로 끝나는 HTML 소스 코드만 깔끔하게 출력하십시오.

---
[1차 RAG 문제지]
${rawDraft}
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
    await page.waitForSelector(sendButtonSelector, { visible: true, timeout: 10000 });
    
    // 버튼 상태 검사 및 강제 활성화 처리 (DOM 주입 직후 클릭 불가 방지)
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
    const timeoutLimit = 300000; // 5분
    const checkInterval = 3000;  // 3초

    while (elapsed < timeoutLimit) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;

      // 1. Canvas의 '코드' 버튼 탐색 및 클릭 시도
      const codeButtonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const codeBtn = buttons.find(b => b.innerText.includes('코드') || b.textContent.includes('코드'));
        if (codeBtn) {
          // 아직 활성화(클릭)되지 않았다면 클릭 시도
          const parent = codeBtn.parentElement;
          // 버튼이나 부모가 selected 상태인지 혹은 클릭이 가능한지 체크
          codeBtn.click();
          return true;
        }
        return false;
      });

      if (codeButtonClicked) {
        console.log(`⏱️ 모니터링 중 (${Math.round(elapsed/1000)}초 경과) -> '코드' 버튼 클릭 시도함. 코드 영역 탐색 시작...`);
      }

      // 2. Monaco Editor 또는 DOM 코드 영역에서 텍스트 수확 시도
      const currentHtml = await page.evaluate(() => {
        // A. Monaco Editor 전역 모델에서 추출 시도 (가장 완벽한 방법)
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
        } catch (e) {
          // 무시하고 다음 단계 진행
        }

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
        console.log(`⏱️ 모니터링 중 (${Math.round(elapsed/1000)}초 경과) -> HTML 소스 코드 추출 성공! 크기: ${currentLength}자`);

        if (currentLength > 1000 && currentLength === lastLength) {
          unchangedCounter++;
          // 6초간 크기 변화가 없으면 완성으로 간주 (3초 * 2회)
          if (unchangedCounter >= 2) {
            harvestedHtml = currentHtml;
            console.log("\n🎉 [지능형 완료 감지] HTML 코드 수확 완료 및 안정화 판단!");
            break;
          }
        } else {
          unchangedCounter = 0;
          lastLength = currentLength;
        }
      } else {
        console.log(`⏱️ 모니터링 중 (${Math.round(elapsed/1000)}초 경과) -> Canvas 활성화 또는 코드 블록 노출 대기 중...`);
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

      fs.writeFileSync(OUTPUT_PATH, cleanedHtml, 'utf8');
      console.log(`\n💾 [수확 성공] Canvas 프리미엄 HTML 저장 완료: ${OUTPUT_PATH}`);
    } else {
      console.error("\n❌ 오류: HTML 코드를 최종 수확하지 못했거나 크기가 너무 작습니다.");
      // 디버깅을 위해 페이지 스크린샷 덤프
      const screenshotPath = path.resolve('scratch', 'gemini_error.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 디버깅용 스크린샷 저장 완료: ${screenshotPath}`);
    }

  } catch (error) {
    console.error("❌ 자동 수확 중 에러 발생:", error);
  } finally {
    console.log("🛑 브라우저를 종료합니다.");
    await browser.close();
  }
}

automateGeminiQuizHarvest();
