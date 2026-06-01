// ==========================================================================
// 🪐 주택관리사보 2.0 메인 프론트엔드 컨트롤러 (main.js)
// ==========================================================================

import './style.css';
import {
  fetchExamsList,
  fetchExamContent,
  fetchGistIncorrect,
  updateGistIncorrect,
  createGistIncorrect
} from './github-service.js';
import { parseMarkdownQuiz } from './quiz-parser.js';

// 🔮 전역 애플리케이션 상태 관리
const state = {
  activeTab: 'dashboard',
  tests: [],
  currentTestFilename: null,
  currentQuiz: null,
  currentRawMarkdown: null,
  userAnswers: {},
  examSeconds: 0,
  timerInterval: null,
  githubPat: localStorage.getItem('github_pat') || null,
  githubGistId: localStorage.getItem('github_gist_id') || null
};

// 🪐 안전한 즉시 실행 초기화 루틴 (timing race condition 해결)
function init() {
  initNavigation();
  checkAuth();
  
  // 🪐 해시 라우터 리스너 등록 및 초기 실행
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
  
  setupIncorrectForm();

  // 시험장 내부 제어 버튼 바인딩
  document.getElementById('btn-exit-exam').addEventListener('click', exitExam);
  
  const btnCopy = document.getElementById('btn-copy-exam');
  if (btnCopy) {
    btnCopy.addEventListener('click', copyExamText);
  }

  const btnFinish = document.getElementById('btn-finish-study');
  if (btnFinish) {
    btnFinish.addEventListener('click', () => {
      stopTimer();
      window.location.hash = 'incorrect';
      showToast('학습이 완료되었습니다! 아래 오답 수첩에서 오늘 틀린 문제의 개념들을 등록해 주세요.', 'success');
    });
  }

  const btnResultToList = document.getElementById('btn-result-to-list');
  if (btnResultToList) {
    btnResultToList.addEventListener('click', () => {
      window.location.hash = 'exams';
    });
  }

  // 🔑 GitHub 연동 제어 및 이벤트 바인딩
  const btnLock = document.getElementById('btn-github-lock');
  if (btnLock) {
    btnLock.addEventListener('click', () => toggleGithubModal(true));
  }

  const btnUnlockTrigger = document.getElementById('btn-unlock-trigger');
  if (btnUnlockTrigger) {
    btnUnlockTrigger.addEventListener('click', () => toggleGithubModal(true));
  }

  const btnCloseModal = document.getElementById('btn-close-modal');
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => toggleGithubModal(false));
  }

  const btnSaveGithub = document.getElementById('btn-save-github');
  if (btnSaveGithub) {
    btnSaveGithub.addEventListener('click', handleSaveGithub);
  }

  const btnLogoutGithub = document.getElementById('btn-logout-github');
  if (btnLogoutGithub) {
    btnLogoutGithub.addEventListener('click', handleLogoutGithub);
  }
}

// 🔑 GitHub 인증 상태 검사 및 UI 갱신
function checkAuth() {
  const pat = localStorage.getItem('github_pat');
  const gistId = localStorage.getItem('github_gist_id');
  
  state.githubPat = pat;
  state.githubGistId = gistId;

  const btnLock = document.getElementById('btn-github-lock');
  const lockScreen = document.getElementById('incorrect-lock-screen');
  const securedWorkspace = document.getElementById('incorrect-secured-workspace');

  if (pat) {
    // 인증 완료 상태
    btnLock.innerHTML = `<span class="btn-icon">🔓</span> 인증 완료`;
    btnLock.style.border = '1px solid rgba(0, 245, 160, 0.4)';
    btnLock.style.color = 'var(--neon-emerald)';
    btnLock.style.boxShadow = '0 0 10px rgba(0, 245, 160, 0.15)';
    
    if (lockScreen) lockScreen.style.display = 'none';
    if (securedWorkspace) securedWorkspace.style.display = 'grid'; // .incorrect-workspace는 그리드 레이아웃
  } else {
    // 미인증 상태
    btnLock.innerHTML = `<span class="btn-icon">🔒</span> 수험생 인증`;
    btnLock.style.border = '1px dashed rgba(255, 107, 107, 0.3)';
    btnLock.style.color = '#ff6b6b';
    btnLock.style.boxShadow = 'none';

    if (lockScreen) lockScreen.style.display = 'flex';
    if (securedWorkspace) securedWorkspace.style.display = 'none';
  }
}

// 🔑 모달 열기/닫기
function toggleGithubModal(show) {
  const modal = document.getElementById('github-modal');
  if (!modal) return;
  
  if (show) {
    modal.style.display = 'flex';
    // 입력 필드 세팅
    document.getElementById('github-token').value = localStorage.getItem('github_pat') || '';
    document.getElementById('github-gist-id').value = localStorage.getItem('github_gist_id') || '';
  } else {
    modal.style.display = 'none';
  }
}

// 🔑 GitHub 설정 저장 핸들러
async function handleSaveGithub() {
  const token = document.getElementById('github-token').value.trim();
  let gistId = document.getElementById('github-gist-id').value.trim();

  if (!token) {
    showToast('GitHub Personal Access Token (PAT)을 입력해 주세요.', 'error');
    return;
  }

  const btnSave = document.getElementById('btn-save-github');
  const originalText = btnSave.innerText;
  btnSave.innerText = '인증 확인 중...';
  btnSave.disabled = true;

  try {
    if (!gistId) {
      // Gist ID가 없으면 비공개 Gist를 자동 생성합니다!
      showToast('Gist ID가 입력되지 않아 신규 비공개 Gist를 자동 생성합니다...', 'info');
      gistId = await createGistIncorrect(token);
      showToast('🎉 비공개 Gist가 성공적으로 자동 생성되었습니다!', 'success');
    } else {
      // Gist ID가 있으면 동작 및 소유권을 검증하기 위해 로드 시도
      await fetchGistIncorrect(token, gistId);
    }

    // 로컬 스토리지 저장 및 전역 상태 갱신
    localStorage.setItem('github_pat', token);
    localStorage.setItem('github_gist_id', gistId);
    
    checkAuth();
    toggleGithubModal(false);
    showToast('🚀 GitHub Gist 비공개 연동이 최종 완료되었습니다!', 'success');
    
    // 화면 새로고침
    if (state.activeTab === 'dashboard') {
      loadDashboardData();
    } else if (state.activeTab === 'incorrect') {
      loadIncorrectList();
    }
  } catch (error) {
    console.error(error);
    showToast(`❌ 연동 인증 실패: ${error.message}`, 'error');
  } finally {
    btnSave.innerText = originalText;
    btnSave.disabled = false;
  }
}

// 🔑 GitHub 연동 해제 (로그아웃)
function handleLogoutGithub() {
  if (confirm('연동을 정말 해제하시겠습니까?\n로컬 스토리지의 토큰 정보가 즉시 완전 소멸됩니다. (Gist의 데이터는 보존됩니다)')) {
    localStorage.removeItem('github_pat');
    localStorage.removeItem('github_gist_id');
    checkAuth();
    toggleGithubModal(false);
    showToast('🔓 GitHub 연동이 안전하게 해제되었습니다.', 'success');
    
    // 화면 새로고침
    if (state.activeTab === 'dashboard') {
      loadDashboardData();
    } else if (state.activeTab === 'incorrect') {
      loadIncorrectList();
    }
  }
}

// 🔔 토스트 알림 헬퍼 함수
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
  toast.innerHTML = `
    <span class="toast-icon" style="font-size: 1.2rem;">${icon}</span>
    <span class="toast-message" style="line-height: 1.4;">${message}</span>
  `;
  
  container.appendChild(toast);
  
  // 3.5초 후 페이드아웃 및 삭제
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3500);
}

// 📋 시험지 전체 복사 헬퍼 함수
function copyExamText() {
  if (!state.currentRawMarkdown) {
    showToast('복사할 시험지 텍스트가 아직 로딩되지 않았습니다.', 'error');
    return;
  }
  
  navigator.clipboard.writeText(state.currentRawMarkdown)
    .then(() => {
      showToast('📋 RAG 문제지가 클립보드에 전체 복사되었습니다!<br>우측 바로가기를 통해 Gemini App에서 바로 풀어보세요.', 'success');
    })
    .catch(err => {
      console.error('클립보드 복사 에러:', err);
      showToast('클립보드 복사에 실패했습니다. 직접 복사해 주세요.', 'error');
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// -------------------------------------------------------------
// 1. 🪐 탭 내비게이션 & 화면 제어
// -------------------------------------------------------------
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    // 수험생 인증 버튼은 탭 이동 대상이 아니므로 이벤트 제어 분리
    if (btn.id === 'btn-github-lock') return;

    btn.addEventListener('click', (e) => {
      const tabId = btn.getAttribute('data-tab');
      window.location.hash = tabId;
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // 네비게이션 액티브 토글
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.id === 'btn-github-lock') return;
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // 콘텐츠 뷰 토글
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.toggle('active', section.id === `content-${tabId}`);
  });

  // 탭 이동 시 필요한 데이터 동적 새로고침
  if (tabId === 'dashboard') {
    loadDashboardData();
  } else if (tabId === 'exams') {
    loadExamList();
  } else if (tabId === 'incorrect') {
    loadIncorrectList();
  }
}

// 🪐 지능형 SPA 해시 라우터 핸들러
function handleHashChange() {
  const rawHash = window.location.hash || '#dashboard';
  // '#' 문자 제거
  const hash = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;

  if (hash.startsWith('dashboard')) {
    switchTab('dashboard');
    showSubView('exam-list-view');
  } else if (hash.startsWith('incorrect')) {
    switchTab('incorrect');
    showSubView('exam-list-view');
  } else if (hash.startsWith('exams')) {
    switchTab('exams');
    
    if (hash.startsWith('exams/play')) {
      const match = hash.match(/file=([^&]+)/);
      const filename = match ? decodeURIComponent(match[1]) : state.currentTestFilename;
      if (filename) {
        if (state.currentTestFilename !== filename) {
          startExam(filename, false); // URL에서 직접 넘어왔으므로 해시 업데이트 없이 실행
        } else {
          showSubView('exam-play-view');
        }
      } else {
        showSubView('exam-list-view');
      }
    } else {
      showSubView('exam-list-view');
    }
  } else {
    // 정의되지 않은 해시일 경우 대시보드로 리다이렉트
    window.location.hash = 'dashboard';
  }
}

// 퀴즈 화면 내 서브 뷰 토글 헬퍼 (리스트 <-> 풀이장 <-> 결과창)
function showSubView(viewId) {
  const views = ['exam-list-view', 'exam-play-view', 'exam-result-view'];
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) {
      el.classList.toggle('active-view', v === viewId);
      el.classList.toggle('inactive-view', v !== viewId);
    }
  });
}

// -------------------------------------------------------------
// 2. 📊 학습 대시보드 데이터 바인딩
// -------------------------------------------------------------
async function loadDashboardData() {
  // 1. 오늘의 시험지 상태 (static fetch)
  try {
    const tests = await fetchExamsList();
    if (tests && tests.length > 0) {
      document.getElementById('stat-today-exam-status').innerText = '출제 완료 📝';
      document.getElementById('stat-today-exam-status').style.color = '#00f5a0';
    } else {
      document.getElementById('stat-today-exam-status').innerText = '출제 대기 ☕';
      document.getElementById('stat-today-exam-status').style.color = '#94a3b8';
    }
  } catch (error) {
    console.warn('시험지 상태 로드 실패:', error);
    document.getElementById('stat-today-exam-status').innerText = '오류 ⚠️';
    document.getElementById('stat-today-exam-status').style.color = '#ff6b6b';
  }

  // 2. 취약 오답 통계 (Gist 혹은 localStorage)
  const pat = state.githubPat;
  const gistId = state.githubGistId;
  
  if (!pat || !gistId) {
    document.getElementById('stat-incorrect-count').innerText = '🔒 인증 필요';
    document.getElementById('chart-accounting-bar').style.width = '0%';
    document.getElementById('chart-accounting-count').innerText = '-';
    document.getElementById('chart-facility-bar').style.width = '0%';
    document.getElementById('chart-facility-count').innerText = '-';
    document.getElementById('chart-civil-bar').style.width = '0%';
    document.getElementById('chart-civil-count').innerText = '-';
    return;
  }

  try {
    const incorrect = await fetchGistIncorrect(pat, gistId);
    const { accounting = [], facility = [], civil = [] } = incorrect;
    const accCount = accounting.length;
    const facCount = facility.length;
    const civCount = civil.length;
    const totalCount = accCount + facCount + civCount;

    // 누적 오답 갯수 바인딩
    document.getElementById('stat-incorrect-count').innerText = `${totalCount}개`;

    // 차트 수치 및 애니메이션 바 두께 조절 (최대 30개 기준으로 백분율화)
    const maxReference = Math.max(30, accCount, facCount, civCount);
    const accPercentage = Math.min(100, Math.round((accCount / maxReference) * 100));
    const facPercentage = Math.min(100, Math.round((facCount / maxReference) * 100));
    const civPercentage = Math.min(100, Math.round((civCount / maxReference) * 100));

    document.getElementById('chart-accounting-bar').style.width = `${accPercentage}%`;
    document.getElementById('chart-accounting-count').innerText = `${accCount}개`;

    document.getElementById('chart-facility-bar').style.width = `${facPercentage}%`;
    document.getElementById('chart-facility-count').innerText = `${facCount}개`;

    document.getElementById('chart-civil-bar').style.width = `${civPercentage}%`;
    document.getElementById('chart-civil-count').innerText = `${civCount}개`;
  } catch (error) {
    console.error('대시보드 오답 데이터 로딩 실패:', error);
    document.getElementById('stat-incorrect-count').innerText = '⚠️ 오류';
  }
}

// -------------------------------------------------------------
// 3. 📝 오늘의 모의고사 (목록 / 시험장 / 채점)
// -------------------------------------------------------------

// 3-1. 시험지 목록 가져오기
async function loadExamList() {
  const container = document.getElementById('exam-list-container');
  container.innerHTML = '<div class="loading-spinner">시험지를 로딩하는 중입니다...</div>';

  try {
    const tests = await fetchExamsList();

    if (tests && tests.length > 0) {
      container.innerHTML = '';
      tests.forEach(test => {
        const isAccounting = test.subject.includes('회계');
        const isCivil = test.subject.includes('민법');
        const subjectClass = isAccounting ? 'accounting' : (isCivil ? 'civil' : 'facility');
        const cardGlow = isAccounting ? 'badge-blue' : (isCivil ? 'badge-purple' : 'badge-emerald');

        const card = document.createElement('div');
        card.className = `glass-card exam-card ${subjectClass}`;
        card.innerHTML = `
          <span class="badge ${cardGlow}" style="margin-bottom: 0.75rem;">${test.subject}</span>
          <h3 class="exam-card-subject">${test.subject} 모의고사</h3>
          <span class="exam-card-date">📅 출제일: ${test.date}</span>
          <button class="exam-start-btn" data-file="${test.filename}">모의고사 응시하기 →</button>
        `;

        // 응시 시작 이벤트 바인딩
        card.querySelector('.exam-start-btn').addEventListener('click', () => {
          startExam(test.filename, true);
        });

        container.appendChild(card);
      });
    } else {
      container.innerHTML = `
        <div class="empty-placeholder col-span-3">
          <p>📭 아직 배달된 오늘의 시험지가 없습니다.</p>
          <p style="font-size: 0.75rem; margin-top: 0.5rem; color: var(--text-muted);">
            'npm run generate' 명령을 돌려 오늘의 모의고사를 즉시 출제받으시거나 아침 8시 자동 스케줄러를 가동해 주세요.
          </p>
        </div>
      `;
    }
  } catch (error) {
    container.innerHTML = `<div class="empty-placeholder error col-span-3">❌ 시험지 로딩 실패: ${error.message}</div>`;
  }
}

// 3-2. 시험 시작 및 파싱 데이터 렌더링
async function startExam(filename, updateHash = true) {
  if (updateHash) {
    window.location.hash = `exams/play?file=${encodeURIComponent(filename)}`;
    return;
  }

  state.currentTestFilename = filename;
  state.userAnswers = {};
  state.examSeconds = 0;

  const playContainer = document.getElementById('play-questions-container');
  playContainer.innerHTML = '<div class="loading-spinner">RAG 모의고사를 해체 및 조립 중입니다...</div>';

  showSubView('exam-play-view');

  try {
    const rawMarkdown = await fetchExamContent(filename);
    const parsedQuiz = parseMarkdownQuiz(rawMarkdown, filename);

    state.currentQuiz = parsedQuiz;
    state.currentRawMarkdown = rawMarkdown;

    // 헤더 정보 바인딩
    document.getElementById('play-exam-title').innerText = `${parsedQuiz.subject} 모의고사`;
    document.getElementById('play-exam-date').innerText = parsedQuiz.date;

    // 1. 문제 렌더링
    playContainer.innerHTML = '';
    if (parsedQuiz.header) {
      const headerIntro = document.createElement('div');
      headerIntro.className = 'glass-card';
      headerIntro.style.padding = '1rem';
      headerIntro.style.fontSize = '0.85rem';
      headerIntro.style.color = 'var(--text-muted)';
      headerIntro.style.lineHeight = '1.6';
      headerIntro.style.marginBottom = '1.5rem';
      headerIntro.innerText = parsedQuiz.header;
      playContainer.appendChild(headerIntro);
    }

    parsedQuiz.questions.forEach(q => {
      const qCard = document.createElement('div');
      qCard.className = 'question-card-static';
      qCard.id = `q-card-${q.id}`;
      qCard.style.padding = '1.25rem';
      qCard.style.borderBottom = '1px solid var(--border-glass)';
      qCard.style.marginBottom = '1rem';

      let optionsMarkup = '';
      if (q.options && q.options.length > 0) {
        q.options.forEach((opt, idx) => {
          optionsMarkup += `
            <div class="option-item-static" style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.35rem 0.5rem; border-radius: 6px;">
              <span class="option-marker" style="font-weight: 700; color: var(--neon-blue); font-family: var(--font-display);">${opt.marker}</span>
              <span class="option-text" style="font-size: 0.9rem; line-height: 1.5; color: var(--text-main);">${opt.content}</span>
            </div>
          `;
        });
      } else {
        // 보기 파싱 실패 시 백업 텍스트 형태
        optionsMarkup = `
          <pre style="white-space: pre-wrap; font-family: inherit; font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">${q.rawBlock}</pre>
        `;
      }

      qCard.innerHTML = `
        <div class="question-title" style="font-size: 1rem; font-weight: 600; line-height: 1.5; display: flex; gap: 0.5rem; color: var(--text-main); margin-bottom: 0.75rem;">
          <span class="question-num" style="color: var(--neon-blue); font-family: var(--font-display); font-weight: 800;">Q${q.id}.</span>
          <span>${q.question}</span>
        </div>
        <div class="question-options-list" style="display: flex; flex-direction: column; gap: 0.25rem; padding-left: 0.5rem;">
          ${optionsMarkup}
        </div>
      `;

      playContainer.appendChild(qCard);
    });

    // 2. 타이머 가동
    startTimer();

  } catch (error) {
    playContainer.innerHTML = `<div class="empty-placeholder">❌ RAG 분석/로딩 실패: ${error.message}</div>`;
  }
}

// 3-4. 경과 시간 타이머 제어
function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  const timerLabel = document.getElementById('exam-timer');
  state.timerInterval = setInterval(() => {
    state.examSeconds++;
    const hrs = String(Math.floor(state.examSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((state.examSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(state.examSeconds % 60).padStart(2, '0');
    timerLabel.innerText = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

// OMR 제출 기능은 미인쇄 복사용 뷰어로 변경함에 따라 미사용으로 비활성화

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// 3-5. 시험 중도 퇴장
function exitExam() {
  if (confirm('시험 진행 정보가 삭제됩니다. 정말로 퇴장하시겠습니까?')) {
    stopTimer();
    window.location.hash = 'exams';
  }
}

// -------------------------------------------------------------
// 4. 📕 오답 수첩 관리
// -------------------------------------------------------------

// 4-1. 오답 목록 가져오기 및 동적 렌더링
async function loadIncorrectList() {
  const pat = state.githubPat;
  const gistId = state.githubGistId;

  if (!pat || !gistId) {
    checkAuth();
    return;
  }

  const accList = document.getElementById('list-accounting-incorrect');
  const facList = document.getElementById('list-facility-incorrect');
  const civList = document.getElementById('list-civil-incorrect');

  accList.innerHTML = '<div class="loading-spinner" style="padding: 1.5rem;"></div>';
  facList.innerHTML = '<div class="loading-spinner" style="padding: 1.5rem;"></div>';
  if (civList) civList.innerHTML = '<div class="loading-spinner" style="padding: 1.5rem;"></div>';

  try {
    const incorrect = await fetchGistIncorrect(pat, gistId);
    const { accounting = [], facility = [], civil = [] } = incorrect;

    // 뱃지 수치 설정
    document.getElementById('lbl-accounting-count').innerText = `${accounting.length}개`;
    document.getElementById('lbl-facility-count').innerText = `${facility.length}개`;
    if (document.getElementById('lbl-civil-count')) {
      document.getElementById('lbl-civil-count').innerText = `${civil.length}개`;
    }

    // 회계원리 리스트화
    renderIncorrectSubList(accList, accounting, 'accounting');
    // 시설개론 리스트화
    renderIncorrectSubList(facList, facility, 'facility');
    // 민법 리스트화
    if (civList) {
      renderIncorrectSubList(civList, civil, 'civil');
    }
  } catch (error) {
    accList.innerHTML = `<div class="empty-placeholder error">연동 실패: ${error.message}</div>`;
    facList.innerHTML = `<div class="empty-placeholder error">연동 실패: ${error.message}</div>`;
    if (civList) civList.innerHTML = `<div class="empty-placeholder error">연동 실패: ${error.message}</div>`;
  }
}

// 점증 복리 가중치 연산 헬퍼 (10% -> 12% -> 15.6% -> 21.84% ...)
function calculateWeight(count) {
  if (!count || count <= 1) return 10;
  let weight = 10;
  for (let i = 2; i <= count; i++) {
    weight = weight * (1 + 0.1 * i);
  }
  return parseFloat(weight.toFixed(2));
}

// 오답 리스트 항목 렌더러 분리 (게이지 바 시각화 탑재)
function renderIncorrectSubList(containerEl, items, subjectKey) {
  containerEl.innerHTML = '';
  
  if (items.length > 0) {
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'incorrect-item';
      div.style.background = 'rgba(255, 255, 255, 0.02)';
      div.style.border = '1px solid var(--border-glass)';
      div.style.borderRadius = '16px';
      div.style.padding = '1.25rem';
      div.style.marginBottom = '0.75rem';
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.gap = '0.75rem';

      const cnt = item.count || 1;
      const weight = calculateWeight(cnt);
      
      // visual gauge width (capped at 100%)
      const gaugeWidth = Math.min(100, weight);
      
      const isAuto = item.concept.startsWith('[자동오답]');
      const cleanConcept = item.concept.replace('[자동오답]', '').trim();
      const conceptHtml = isAuto 
        ? `<span class="incorrect-concept-text" style="font-size: 0.9rem; line-height: 1.5; color: var(--text-main);"><span style="color: var(--neon-coral); font-weight:700;">[자동]</span> ${cleanConcept}</span>`
        : `<span class="incorrect-concept-text" style="font-size: 0.9rem; line-height: 1.5; color: var(--text-main); font-weight: 500;">${cleanConcept}</span>`;

      div.innerHTML = `
        <div class="incorrect-item-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; width: 100%;">
          ${conceptHtml}
          <button class="delete-btn" title="완치 완료 (삭제)" style="background: rgba(0, 245, 160, 0.1); border: 1px solid rgba(0, 245, 160, 0.2); color: var(--neon-emerald); border-radius: 8px; padding: 0.35rem 0.65rem; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: var(--transition-smooth); white-space: nowrap; display: flex; align-items: center; gap: 0.25rem;">
            🌱 완치
          </button>
        </div>
        
        <div class="incorrect-gauge-area" style="display: flex; flex-direction: column; gap: 0.35rem; width: 100%; margin-top: 0.25rem;">
          <div class="incorrect-info-row" style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
            <span class="incorrect-count-badge">누적 오답: <strong style="color: var(--text-main);">${cnt}회</strong></span>
            <span class="incorrect-weight-badge" style="font-family: var(--font-display); font-weight: 700; color: var(--neon-coral);">출제 가중치: <strong>${weight}%</strong></span>
          </div>
          <div class="gauge-track" style="height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden; width: 100%;">
            <div class="gauge-fill" style="width: ${gaugeWidth}%; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--neon-coral), var(--neon-purple)); box-shadow: 0 0 6px var(--neon-coral-glow); transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
          </div>
        </div>
        
        <div class="incorrect-meta-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
          <span>최근 오답일: ${item.date}</span>
        </div>
      `;

      // 오답 개별 삭제 바인딩
      div.querySelector('.delete-btn').addEventListener('click', () => {
        deleteIncorrect(subjectKey, item.concept);
      });

      containerEl.appendChild(div);
    });
  } else {
    containerEl.innerHTML = '<div class="empty-placeholder">저장된 오답이 없습니다. 텅 비어있네요! ☕</div>';
  }
}

// 4-2. 오답 수동 추가 등록 핸들링
function setupIncorrectForm() {
  const form = document.getElementById('form-add-incorrect');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pat = state.githubPat;
    const gistId = state.githubGistId;

    if (!pat || !gistId) {
      showToast('오답 수첩을 이용하시려면 먼저 GitHub 인증 연동을 완료해 주세요.', 'error');
      return;
    }

    const subject = document.getElementById('select-incorrect-subject').value;
    const concept = document.getElementById('input-incorrect-concept').value.trim();

    if (!concept) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerText;
    btnSubmit.innerText = 'Gist 저장 중...';
    btnSubmit.disabled = true;

    try {
      // 1. 기존 데이터 가져오기
      const incorrect = await fetchGistIncorrect(pat, gistId);
      if (!incorrect[subject]) {
        incorrect[subject] = [];
      }

      const today = new Date().toISOString().split('T')[0];
      const targetConcept = concept.trim();

      // 2. 중복 검사 및 누진 처리
      const existingItem = incorrect[subject].find(item => item.concept.trim() === targetConcept);
      if (existingItem) {
        existingItem.count = (existingItem.count || 1) + 1;
        existingItem.date = today;
      } else {
        incorrect[subject].push({
          concept: targetConcept,
          date: today,
          count: 1
        });
      }

      // 3. Gist 업데이트
      await updateGistIncorrect(pat, gistId, incorrect);

      document.getElementById('input-incorrect-concept').value = '';
      loadIncorrectList(); // 오답 리스트 즉시 리로드
      showToast('🎯 취약 개념이 GitHub 비공개 Gist 오답 수첩에 무사히 저장되었습니다!', 'success');
    } catch (error) {
      showToast(`등록 실패: ${error.message}`, 'error');
    } finally {
      btnSubmit.innerText = originalText;
      btnSubmit.disabled = false;
    }
  });
}

// 4-3. 오답 간편 삭제 처리
async function deleteIncorrect(subject, concept) {
  const pat = state.githubPat;
  const gistId = state.githubGistId;

  if (!pat || !gistId) {
    showToast('GitHub 연동이 필요합니다.', 'error');
    return;
  }

  if (!confirm(`"${concept.substring(0, 30)}..." 개념을 완전히 마스터(완치)하셨습니까?\n오답 수첩에서 지우고 RAG 가중치에서 해제합니다.`)) {
    return;
  }

  try {
    // 1. 기존 데이터 가져오기
    const incorrect = await fetchGistIncorrect(pat, gistId);
    if (incorrect[subject]) {
      incorrect[subject] = incorrect[subject].filter(item => item.concept.trim() !== concept.trim());
      
      // 2. Gist 업데이트
      await updateGistIncorrect(pat, gistId, incorrect);
      
      loadIncorrectList(); // 삭제 완료 후 리로드
      showToast('🌱 취약 개념을 완치 완료했습니다! Gist에서 무사히 제거되었습니다.', 'success');
    }
  } catch (error) {
    showToast(`완치 실패: ${error.message}`, 'error');
  }
}
