import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

  const baseProfile = '/Users/aggro/Library/Application Support/notebooklm-mcp/chrome_profile';
  const instanceProfile = `/Users/aggro/Library/Application Support/notebooklm-mcp/chrome_profile_instances/gemini_browser_instance_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  console.log(`🧬 Cloning base Chrome profile into isolated instance for HTML compiler...`);
  try {
    fs.mkdirSync(path.dirname(instanceProfile), { recursive: true });
    // Copy base profile to instance profile
    execSync(`cp -R "${baseProfile}" "${instanceProfile}"`);
    
    // Remove lock files
    const lockFiles = ['SingletonLock', 'lock', 'SingletonSocket', 'SingletonCookie'];
    for (const file of lockFiles) {
      const lockPath = path.join(instanceProfile, file);
      try {
        fs.unlinkSync(lockPath);
      } catch (_) {}
    }
    console.log(`✅ Clone complete. Isolated Profile: ${instanceProfile}`);
  } catch (cloneErr) {
    console.warn(`⚠️ Warning: Profile cloning failed, falling back to base profile:`, cloneErr.message);
  }

  const chromeProfilePath = fs.existsSync(instanceProfile) ? instanceProfile : baseProfile;

  let browser;
  let isConnectedToRemote = false;

  console.log("📡 [Gemini-Browser] 9222번 원격 디버깅 크롬 포트 접속 시도 중...");
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });
    isConnectedToRemote = true;
    console.log("✅ [Gemini-Browser] 사용자의 실제 크롬 브라우저 원격 디버깅 포트(9222) 접속 성공!");
  } catch (connectErr) {
    console.log("ℹ️ [Gemini-Browser] 원격 크롬 디버깅 포트가 닫혀있습니다. 기존 백그라운드 크롬을 실행합니다.");
  }

  if (!isConnectedToRemote) {
    console.log("🚀 Google Chrome 브라우저 실행 중 (인증 프로필 장착)...");
    browser = await puppeteer.launch({
      headless: true, // 수험생님 Mac 사용을 방해하지 않는 백그라운드 모드
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: chromeProfilePath,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
  }

  const page = await browser.newPage();
  
  // 브라우저 경고창 차단
  page.on('dialog', async dialog => {
    console.log(`💬 대화상자 차단: [${dialog.type()}] ${dialog.message()}`);
    await dialog.dismiss();
  });

  try {
    const gemUrl = "https://gemini.google.com/gem/6dc34a834033";
    const inputSelector = 'div[aria-label="Gemini 프롬프트 입력"]';
    
    let loaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`🎯 전용 일타강사 Gem 페이지로 이동 중 (시도 ${attempt}/3):\n   ${gemUrl}`);
      try {
        await page.goto(gemUrl, {
          waitUntil: "networkidle2",
          timeout: 60000
        });

        console.log("⏳ 제미나이 웹 앱 로딩 대기 중 (5초)...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 입력창 혹은 로그인 여부 검사
        const hasInputOrLogin = await page.evaluate((sel) => {
          const hasInput = !!document.querySelector(sel);
          const buttons = Array.from(document.querySelectorAll('button, a'));
          const isLoggedOut = buttons.some(b => {
            const text = b.innerText || b.textContent || '';
            return text.includes('로그인') || text.includes('Sign in');
          });
          return { hasInput, isLoggedOut };
        }, inputSelector);
        
        if (hasInputOrLogin.isLoggedOut) {
          console.error(`\n🚨 [보안 차단] '${subjectName}' 컴파일 중 실패: 구글 크롬 프로필의 세션이 만료되었거나 로그아웃 상태입니다.`);
          console.error("👉 이대로 진행하면 엉뚱한 OMR(Flash 게스트 모드)이 만들어지므로 빌드를 강제 중단합니다.");
          console.error("👉 'npm run setup' 또는 순정 크롬 브라우저를 띄워 구글 로그인을 다시 진행해 주십시오.\n");
          throw new Error(`Gemini-Browser Session Expired (Logged Out) for ${subjectName}`);
        }
        
        let currentUrl = page.url();
        console.log(`📡 [Gemini-Browser] 현재 브라우저 URL: ${currentUrl}`);
        
        let isOnCustomGem = currentUrl.includes('/gem/');
        if (hasInputOrLogin.hasInput && !isOnCustomGem) {
          console.warn("⚠️ [Gemini-Browser] Custom Gem에서 일반 Gemini 앱으로 리다이렉트가 감지되었습니다. 전용 Gem 페이지로 재진입을 시도합니다...");
          for (let redirectAttempt = 1; redirectAttempt <= 2; redirectAttempt++) {
            await page.goto(gemUrl, {
              waitUntil: "networkidle2",
              timeout: 60000
            });
            await new Promise(resolve => setTimeout(resolve, 5000));
            currentUrl = page.url();
            console.log(`📡 [Gemini-Browser] 재진입 시도 ${redirectAttempt} 후 URL: ${currentUrl}`);
            if (currentUrl.includes('/gem/')) {
              isOnCustomGem = true;
              break;
            }
          }
        }
        
        if (hasInputOrLogin.hasInput && isOnCustomGem) {
          console.log("✅ 제미나이 입력창 및 Custom Gem 페이지 확인 완료!");
          loaded = true;
          break;
        } else if (!hasInputOrLogin.hasInput) {
          console.warn("⚠️ 입력창이 감지되지 않았습니다. 페이지를 재로드합니다.");
        } else {
          console.error("🚨 오류: Custom Gem 페이지 진입에 최종 실패하여 일반 Gemini 상태입니다. 재시도합니다.");
        }
      } catch (gotoErr) {
        if (gotoErr.message.includes("Session Expired")) {
          throw gotoErr; // 로그인 만료 에러는 그대로 위로 던짐
        }
        console.warn(`⚠️ 페이지 이동 실패 (시도 ${attempt}):`, gotoErr.message);
      }
    }
    
    if (!loaded) {
      throw new Error("❌ 3회 시도 후에도 제미나이 입력창 로드 실패");
    }

    // 🪐 [대화방 초기화 (New Chat) - 세션 오염 및 레이스 컨디션 차단]
    console.log("📡 [Gemini-Browser] 이전 대화 기록 간섭 방지를 위해 '새 채팅(New Chat)' 시작 시도...");
    try {
      const newChatClicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, a, div[role="button"], span, mat-icon'));
        const newChatBtn = els.find(el => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const text = (el.innerText || el.textContent || '').toLowerCase();
          return (aria.includes('new chat') || aria.includes('새 채팅') || text.includes('new chat') || text.includes('새 채팅'))
                 && !text.includes('chat history') && !text.includes('대화 기록');
        });
        if (newChatBtn) {
          newChatBtn.click();
          return true;
        }
        return false;
      });

      if (newChatClicked) {
        console.log("✅ [Gemini-Browser] '새 채팅' 버튼 클릭 성공. 세션 초기화 대기 (3초)...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log("📡 [Gemini-Browser] 버튼 클릭 실패. 단축키(Ctrl+Shift+O / Cmd+Shift+O) 전송 시도...");
        // Windows/Linux/Mac fallback keyboard shortcut
        await page.keyboard.down('Control');
        await page.keyboard.down('Shift');
        await page.keyboard.press('KeyO');
        await page.keyboard.up('Shift');
        await page.keyboard.up('Control');
        
        await page.keyboard.down('Meta');
        await page.keyboard.down('Shift');
        await page.keyboard.press('KeyO');
        await page.keyboard.up('Shift');
        await page.keyboard.up('Meta');
        
        console.log("⏳ 단축키 전송 완료. 세션 초기화 대기 (3초)...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (newChatErr) {
      console.warn("⚠️ [Gemini-Browser] 새 채팅 시작 중 에러 발생, 기존 세션에서 계속 진행합니다:", newChatErr.message);
    }

    // 🪐 [지능형 모델 스위처 & 안전장치] 3.5 Flash에서 Pro 모델로 자동 전환 비활성화 (사용자 지정 모델을 사용하기 위해 건너뜀)
    /*
    console.log("📡 [Gemini-Browser] 3.5 Flash에서 Pro 모델로 자동 강제 전환 시도...");
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const selectorBtn = buttons.find(b => {
          const aria = b.getAttribute('aria-label') || '';
          return aria.includes('모드 선택') || aria.includes('현재 Gemini Flash');
        });
        if (selectorBtn) {
          selectorBtn.click();
          return { success: true, text: selectorBtn.innerText };
        }
        const fallbackBtn = buttons.find(b => b.innerText.includes('Flash'));
        if (fallbackBtn) {
          fallbackBtn.click();
          return { success: true, text: fallbackBtn.innerText };
        }
        return { success: false };
      });

      if (clicked.success) {
        console.log(`📡 [Gemini-Browser] 모델 선택 드롭다운 버튼 클릭 완료 (${clicked.text.replace(/\n/g, ' ')}). 메뉴 렌더링 대기...`);
        await new Promise(r => setTimeout(r, 3000));

        const optionClicked = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, div[role="menuitem"], div[role="option"], [role="button"]'));
          const targets = els.filter(el => {
            // 입력창(textbox)이나 프롬프트 영역은 후보에서 원천 제외
            if (el.closest('div[role="textbox"]') || el.closest('[aria-label*="프롬프트"]') || el.closest('.input-area')) {
              return false;
            }
            const text = (el.innerText || el.textContent || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            return (text.includes('pro') || text.includes('프로') || aria.includes('pro') || aria.includes('프로')) 
                   && !text.includes('lite') && !text.includes('flash');
          });

          if (targets.length > 0) {
            targets.sort((a, b) => {
              const scoreA = (a.tagName === 'SPAN' || a.tagName === 'BUTTON') ? 1 : 0;
              const scoreB = (b.tagName === 'SPAN' || b.tagName === 'BUTTON') ? 1 : 0;
              return scoreB - scoreA;
            });
            targets[0].click();
            return { success: true, text: targets[0].innerText.replace(/\n/g, ' ') };
          }
          return { success: false };
        });

        if (optionClicked.success) {
          console.log(`📡 [Gemini-Browser] Pro 옵션 클릭 완료 (${optionClicked.text}). 전환 완료 대기...`);
          await new Promise(r => setTimeout(r, 2000)); // 팝업 출현 대기

          // 🚨 [사용 한도 초과 팝업 감지 및 대응 안전장치]
          const dialogHandled = await page.evaluate(() => {
            const dialog = document.querySelector('div[role="dialog"], mat-dialog-container, .cdk-overlay-pane');
            if (dialog) {
              const text = (dialog.innerText || dialog.textContent || '').toLowerCase();
              if (text.includes('limit') || text.includes('한도') || text.includes('용량') || text.includes('advanced') || text.includes('pro')) {
                const buttons = Array.from(dialog.querySelectorAll('button, [role="button"]'));
                const dismissBtn = buttons.find(b => {
                  const bText = (b.innerText || b.textContent || '').toLowerCase();
                  return bText.includes('확인') || bText.includes('계속') || bText.includes('전환') || bText.includes('닫기') ||
                         bText.includes('ok') || bText.includes('switch') || bText.includes('continue') || bText.includes('dismiss') || bText.includes('close');
                }) || buttons[buttons.length - 1];
                
                if (dismissBtn) {
                  dismissBtn.click();
                  return { handled: true, text: text, button: dismissBtn.innerText };
                }
              }
            }
            return { handled: false };
          });

          if (dialogHandled.handled) {
            console.warn(`⚠️ [Gemini-Browser] 사용 한도 도달 팝업 감지되어 자동 승인/해제 처리: "${dialogHandled.text.replace(/\n/g, ' ')}" (클릭 버튼: ${dialogHandled.button})`);
            console.warn(`⚠️ [Gemini-Browser] 3.5 Flash 모델로 자동 안전 강제 회귀합니다.`);
            await new Promise(r => setTimeout(r, 3000));
          } else {
            await new Promise(r => setTimeout(r, 3000)); // 남은 대기 시간 충족
          }

          const verifyModel = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const selectorBtn = buttons.find(b => {
              const aria = b.getAttribute('aria-label') || '';
              return aria.includes('모드 선택') || aria.includes('현재 Gemini');
            });
            if (selectorBtn) {
              return selectorBtn.getAttribute('aria-label') || selectorBtn.innerText;
            }
            return null;
          });
          console.log(`📡 [Gemini-Browser] 모델 최종 검증 결과: ${verifyModel ? verifyModel.replace(/\n/g, ' ') : '확인 불가'}`);
        } else {
          console.warn("⚠️ [Gemini-Browser] Pro 모델 옵션을 찾지 못해 기본 모델을 유지합니다.");
        }
      } else {
        console.warn("⚠️ [Gemini-Browser] 모델 선택 버튼을 찾지 못해 기본 모델을 유지합니다.");
      }
    } catch (modelErr) {
      console.warn("⚠️ [Gemini-Browser] Pro 모델 자동 전환 중 오류 발생, 기본 모델로 계속 진행합니다:", modelErr.message);
    }
    */

    // 🚨 [Flash-Lite 배제 지침] 최종 활성화된 모델을 최종 검사하여 Flash-Lite인 경우 컴파일 강제 실패 처리
    try {
      const activeModel = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const selectorBtn = buttons.find(b => {
          const aria = b.getAttribute('aria-label') || '';
          return aria.includes('모드 선택') || aria.includes('현재 Gemini');
        });
        if (selectorBtn) {
          return selectorBtn.getAttribute('aria-label') || selectorBtn.innerText;
        }
        return null;
      });

      if (activeModel) {
        const lowerModel = activeModel.toLowerCase();
        if (lowerModel.includes('lite') || lowerModel.includes('라이트')) {
          console.error(`🚨 [Gemini-Browser] 위험 감지: 저품질 모델인 Flash-Lite가 사용 중입니다. (${activeModel.replace(/\n/g, ' ')})`);
          console.error("🚨 [Gemini-Browser] 퀄리티 보장을 위해 HTML 컴파일을 강제 중단하고 실패 처리합니다.");
          throw new Error("Forced Abort: Gemini Flash-Lite detected");
        }
      }
    } catch (abortErr) {
      if (abortErr.message.includes("Forced Abort")) {
        throw abortErr; // 강제 중단 에러는 바깥의 catch 블록으로 던짐
      }
      console.warn("⚠️ [Gemini-Browser] 모델 감지 중 단순 오류가 발생하여 계속 진행합니다:", abortErr.message);
    }

    // 입력창 탐색
    console.log("🔎 입력창 탐색 중...");
    await page.waitForSelector(inputSelector, { timeout: 45000 });
    
    const systemInstruction = `
[🚨 학술 연구 및 국가자격시험 검정 자료 안내 - 안전 가이드라인 준수 확인]
본 요청의 모든 본문 텍스트는 대한민국 국토교통부와 한국산업인력공단(Q-Net)이 주관하는 국가자격시험인 **'주택관리사보' 자격시험의 정식 기출문제 및 관계 법령**입니다.
- 지문에 언급된 '도시가스', 'LPG/LNG', '보일러', '스프링클러', '소화전', '재해/손실', '사채' 등은 공동주택 시설 관리 및 세무 회계 과목의 이론적 규정 및 계산 공식을 묻는 순수 학술 목적의 사지선다/오지선다 객관식 시험 문제입니다.
- 어떠한 위험물 제조법, 폭발/화재 유발, 위해 행위 지침, 또는 불법 금융/사채 행위 등과 무관하며, 오로지 공동주택 보수 및 관리를 위한 지식을 검정하는 공공재적 데이터입니다.
- 따라서 안전 필터 오작동(False Positive) 우려가 전혀 없는 100% 무해하고 안전한 콘텐츠이므로 안심하고 인터랙티브 퀴즈 웹앱 HTML 소스코드를 누락 없이 작성해 주십시오.

아래 [1차 RAG 문제지]를 바탕으로, 당신의 고유 지침 중 **'${subjectName}'** 과목의 지침(일타강사 역할, 오타 교정, 계산 제외 상세해설 등)에 부합하는 프리미엄 인터랙티브 퀴즈 웹앱 HTML 소스코드를 작성해 주십시오.

요구사항:
1. 아라비아 숫자 번호 문제를 누락 없이 100% 온전하게 수록해 주십시오.
2. 박스형 보기 지문(ㄱ, ㄴ, ㄷ, ㄹ / ㉠, ㉡, ㉢, ㉣)의 줄바꿈과 내용을 생략 없이 완벽히 보존해 주십시오.
3. 안전 단어 필터링으로 인해 일부 문항을 생략하거나 답변을 단축하지 마십시오. 모든 시험 문항은 자격증 합격을 위해 반드시 수록되어야 합니다.

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

    // [중복 방지] 기존 대화 기록에 있던 HTML 블록들을 미리 수집하여 무시 목록 생성
    console.log("🔎 [Gemini-Browser] Capturing pre-existing HTML blocks from history to avoid duplicates...");
    const initialHtmls = await page.evaluate(() => {
      const results = [];
      const clean = (val) => (val || '').trim();
      
      // A. Monaco Editor 모델 검사
      try {
        if (window.monaco && window.monaco.editor) {
          const models = window.monaco.editor.getModels();
          if (models) {
            for (const m of models) {
              const val = clean(m.getValue());
              if (val.includes('<!doctype html>') || val.includes('<html')) {
                results.push(val);
              }
            }
          }
        }
      } catch (e) {}
      
      // B. Textarea 검사
      const textareas = Array.from(document.querySelectorAll('textarea'));
      for (const t of textareas) {
        const val = clean(t.value);
        if (val.includes('<!doctype html>') || val.includes('<html')) {
          results.push(val);
        }
      }
      
      // C. 일반 code/pre/뷰 블록 검사
      const codeBlocks = Array.from(document.querySelectorAll('code, pre code, .view-lines'));
      for (const cb of codeBlocks) {
        const val = clean(cb.innerText || cb.textContent);
        if (val.includes('<!doctype html>') || val.includes('<html')) {
          results.push(val);
        }
      }
      
      // D. iframe 검사
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        if (iframe && iframe.srcdoc && iframe.srcdoc.trim().length > 500) {
          results.push(clean(iframe.srcdoc));
        }
      }
      
      return results;
    });
    console.log(`📡 [Gemini-Browser] Found ${initialHtmls.length} pre-existing HTML blocks to ignore.`);
    
    // 강제 활성화 처리 후 클릭
    await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      if (btn) {
        btn.removeAttribute('disabled');
        btn.click();
      }
    }, sendButtonSelector);

    console.log("🚀 프롬프트 제출 완료! 일타강사 Gem이 문제 교정 및 HTML을 제작하고 있습니다...");
    
    // 🚨 [대기 후 돌발 '지금 답변하기' 버튼 대응]
    console.log("⏳ 전송 후 상태 대기 (4초)...");
    await new Promise(resolve => setTimeout(resolve, 4000));
    try {
      const clickedNow = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span, a'));
        const target = buttons.find(b => {
          const text = (b.innerText || b.textContent || '').trim();
          return text.includes('지금 답변하기') || text.includes('Answer now') || text.includes('Respond now');
        });
        if (target) {
          target.click();
          return { clicked: true, text: target.innerText };
        }
        return { clicked: false };
      });
      if (clickedNow.clicked) {
        console.log(`📡 [Gemini-Browser] '지금 답변하기' 버튼을 감지하여 클릭했습니다: "${clickedNow.text}"`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (btnErr) {
      console.warn("⚠️ '지금 답변하기' 버튼 1차 클릭 시도 중 예외:", btnErr.message);
    }

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

      // 🚨 [모니터링 중 '지금 답변하기' 버튼 돌발 감지 및 대응]
      try {
        const clickedNow = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span, a'));
          const target = buttons.find(b => {
            const text = (b.innerText || b.textContent || '').trim();
            return text.includes('지금 답변하기') || text.includes('Answer now') || text.includes('Respond now');
          });
          if (target) {
            target.click();
            return { clicked: true, text: target.innerText };
          }
          return { clicked: false };
        });
        if (clickedNow.clicked) {
          console.warn(`📡 [Gemini-Browser] 모니터링 중 '지금 답변하기' 버튼이 감지되어 재클릭 처리: "${clickedNow.text}"`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (err) {}

      // 🚨 [모니터링 중 사용 한도 초과 팝업 돌발 감지 및 대응]
      try {
        const handled = await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"], mat-dialog-container, .cdk-overlay-pane');
          if (dialog) {
            const text = (dialog.innerText || dialog.textContent || '').toLowerCase();
            if (text.includes('limit') || text.includes('한도') || text.includes('용량') || text.includes('advanced') || text.includes('pro')) {
              const buttons = Array.from(dialog.querySelectorAll('button, [role="button"]'));
              const dismissBtn = buttons.find(b => {
                const bText = (b.innerText || b.textContent || '').toLowerCase();
                return bText.includes('확인') || bText.includes('계속') || bText.includes('전환') || bText.includes('닫기') ||
                       bText.includes('ok') || bText.includes('switch') || bText.includes('continue') || bText.includes('dismiss') || bText.includes('close');
              }) || buttons[buttons.length - 1];
              if (dismissBtn) {
                dismissBtn.click();
                return { handled: true, text: text, button: dismissBtn.innerText };
              }
            }
          }
          return { handled: false };
        });
        if (handled.handled) {
          console.warn(`⚠️ [Gemini-Browser] 퀴즈 생성 모니터링 중 한도 도달 팝업 감지되어 자동 승인/해제 처리 완료: "${handled.text.replace(/\n/g, ' ')}" (클릭 버튼: ${handled.button})`);
        }
      } catch (err) {
        // 팝업 검사 중 발생한 단순 예외 스킵
      }

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

      // 2. Monaco Editor 또는 DOM 코드 영역에서 텍스트 수확 시도 (최신 메시지 우선 역순 스캔)
      let currentHtml = await page.evaluate((ignoredBlocks) => {
        const isIgnored = (text) => {
          if (!text) return true;
          const cleanText = text.trim();
          return ignoredBlocks.some(ignored => ignored === cleanText);
        };

        // A. Monaco Editor 전역 모델에서 추출 시도 (역순)
        try {
          if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
              for (let i = models.length - 1; i >= 0; i--) {
                const text = models[i].getValue();
                if ((text.includes('<!doctype html>') || text.includes('<html')) && !isIgnored(text)) {
                  return text;
                }
              }
            }
          }
        } catch (e) {}

        // B. textarea 또는 Monaco DOM 구성 요소에서 직접 텍스트 추출 시도 (역순)
        const textareas = Array.from(document.querySelectorAll('textarea'));
        for (let i = textareas.length - 1; i >= 0; i--) {
          const val = textareas[i].value || '';
          if ((val.includes('<!doctype html>') || val.includes('<html')) && !isIgnored(val)) {
            return val;
          }
        }

        // C. DOM의 일반 code 블록 또는 pre 블록 검사 (역순)
        const codeBlocks = Array.from(document.querySelectorAll('code, pre code, .view-lines'));
        for (let i = codeBlocks.length - 1; i >= 0; i--) {
          const text = codeBlocks[i].innerText || codeBlocks[i].textContent || '';
          if ((text.includes('<!doctype html>') || text.includes('<html')) && !isIgnored(text)) {
            return text;
          }
        }

        // D. Canvas Iframe 예외 검사 (가장 마지막 iframe 우선)
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (let i = iframes.length - 1; i >= 0; i--) {
          const iframe = iframes[i];
          if (iframe && iframe.srcdoc && iframe.srcdoc.trim().length > 500 && !isIgnored(iframe.srcdoc)) {
            return iframe.srcdoc;
          }
        }

        return null;
      }, initialHtmls);

      // 3. [CORS-Safe Fallback] DOM에서 추출하지 못한 경우, 퍼피티어 Node 컨텍스트에서 직접 iframe 내용 수확
      if (!currentHtml) {
        try {
          const iframes = await page.$$('iframe');
          if (iframes && iframes.length > 0) {
            for (let i = iframes.length - 1; i >= 0; i--) {
              const frame = await iframes[i].contentFrame();
              if (frame) {
                const html = await frame.content();
                if (html && (html.includes('<!doctype html>') || html.includes('<html')) && html.trim().length > 1000) {
                  const cleanHtml = html.trim();
                  if (!initialHtmls.some(ignored => ignored === cleanHtml)) {
                    currentHtml = html;
                    break;
                  }
                }
              }
            }
          }
        } catch (iframeErr) {
          console.warn("⚠️ [Gemini-Browser] iframe contentFrame 수확 중 예외 발생:", iframeErr.message);
        }
      }

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
    try {
      const errScrPath = path.resolve('scratch', `err_${subjectKey}_fatal.png`);
      await page.screenshot({ path: errScrPath });
      console.log(`📸 치명적 오류 스크린샷 덤프 저장 완료: ${errScrPath}`);
    } catch (scre) {
      console.warn("⚠️ 에러 스크린샷 저장 실패:", scre.message);
    }
    return null;
  } finally {
    console.log("🛑 브라우저 인스턴스를 정상적으로 소멸시킵니다.");
    try {
      if (browser) {
        if (isConnectedToRemote) {
          await page.close();
          await browser.disconnect();
          console.log("📡 [Gemini-Browser] 원격 디버깅 크롬 프로세스에서 세션을 정상 분리했습니다.");
        } else {
          await browser.close();
        }
      }
    } catch (_) {}
    
    // Clean up cloned profile
    if (!isConnectedToRemote && chromeProfilePath !== baseProfile && fs.existsSync(chromeProfilePath)) {
      console.log(`🧹 Isolated profile cleanup: ${chromeProfilePath}`);
      try {
        execSync(`rm -rf "${chromeProfilePath}"`);
      } catch (rmErr) {
        console.warn(`⚠️ Failed to remove temporary profile:`, rmErr.message);
      }
    }
  }
}
