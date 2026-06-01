import puppeteer from 'puppeteer';

async function probeGeminiSelectors() {
  console.log("🚀 Google Chrome 브라우저 실행 중...");
  
  const browser = await puppeteer.launch({
    headless: false, // 실제 화면 표시
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/Users/aggro/Library/Application Support/notebooklm-mcp/chrome_profile',
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  console.log("🎯 Gemini 전용 Gem 페이지로 이동 중...");
  
  try {
    await page.goto("https://gemini.google.com/gem/1Y2rIF58xoc4vZYb_FRyGfTeFO9poQ9G3?authuser=1", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    console.log("⏳ 페이지 로딩 및 안정화 대기 중 (5초)...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 현재 페이지의 contenteditable 요소 및 모든 버튼 정보 추출
    const pageElements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => ({
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label') || '',
        className: el.className,
        placeholder: el.getAttribute('placeholder') || ''
      }));

      const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
        ariaLabel: btn.getAttribute('aria-label') || '',
        text: btn.innerText || '',
        className: btn.className,
        id: btn.id
      }));

      return { inputs, buttons };
    });

    console.log("\n=============================================");
    console.log("🔍 [1] 발견된 입력창 (ContentEditable) 목록:");
    console.log("=============================================");
    console.log(JSON.stringify(pageElements.inputs, null, 2));

    console.log("\n=============================================");
    console.log("🔍 [2] 발견된 버튼 목록 (상위 25개):");
    console.log("=============================================");
    console.log(JSON.stringify(pageElements.buttons.slice(0, 25), null, 2));

  } catch (error) {
    console.error("❌ 프로브 실행 중 오류 발생:", error.message);
  } finally {
    console.log("\n🛑 브라우저를 닫지 않고 10초 대기 후 종료합니다...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    await browser.close();
    console.log("👋 브라우저 종료 완료.");
  }
}

probeGeminiSelectors();
