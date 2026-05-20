import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

console.log("🚀 merit.js 로드 완료 (Firebase 기반 동적 수식 가이드 탑재)");

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeSnapshot = null;
let unsubscribeGlobals = null;

// 💡 기본 수식 가이드 데이터 (Firebase에 데이터가 없을 때 사용될 기본값)
// 💡 위키백과 TeX 도움말 기반으로 재구성한 종합 가이드 데이터
const defaultLatexGuide = [
    {
        category: "1. 구별 기호 및 그리스 문자",
        inputs: [
            { syntax: "\\dot{a}, \\ddot{a}", desc: "문자 위 점 기호", example: "$\\dot{a}, \\ddot{a}$" },
            { syntax: "\\hat{a}, \\vec{a}", desc: "모자 및 벡터 화살표", example: "$\\hat{a}, \\vec{a}$" },
            { syntax: "\\alpha, \\beta, \\pi, \\theta", desc: "주요 그리스 문자", example: "$\\alpha, \\beta, \\pi, \\theta$" },
            { syntax: "\\infty", desc: "무한대 기호", example: "$\\infty$" }
        ]
    },
    {
        category: "2. 산술 및 삼각함수",
        inputs: [
            { syntax: "a^b, a_b", desc: "거듭제곱(위첨자) 및 아래첨자", example: "$a^b, a_b$" },
            { syntax: "\\ln c, \\log_{10} f", desc: "자연로그 및 상용로그", example: "$\\ln c, \\log_{10} f$" },
            { syntax: "\\sin x, \\cos x, \\tan x", desc: "기본 삼각함수", example: "$\\sin x, \\cos x, \\tan x$" },
            { syntax: "\\arcsin x, \\arctan x", desc: "역삼각함수", example: "$\\arcsin x, \\arctan x$" }
        ]
    },
    {
        category: "3. 미분 및 극한 (해석학)",
        inputs: [
            { syntax: "\\lim_{x \\to \\infty}", desc: "우극한 / 무한대 극한", example: "$\\lim_{x \\to \\infty}$" },
            { syntax: "\\frac{dy}{dx}", desc: "라이프니츠 미분 표기", example: "$\\frac{dy}{dx}$" },
            { syntax: "\\frac{\\partial y}{\\partial x}", desc: "편미분 표기", example: "$\\frac{\\partial y}{\\partial x}$" },
            { syntax: "f', f''", desc: "라그랑주 미분 기호", example: "$f', f''$" }
        ]
    },
    {
        category: "4. 연산 기호",
        inputs: [
            { syntax: "\\pm, \\mp", desc: "플러스마이너스 / 마이너스플러스", example: "$\\pm, \\mp$" },
            { syntax: "\\times, \\div", desc: "곱셈(X) 및 나눗셈(÷)", example: "$\\times, \\div$" },
            { syntax: "\\cdot", desc: "점 곱셈 기호", example: "$\\cdot$" },
            { syntax: "\\circ, \\bullet", desc: "합성함수 기호 및 큰 점", example: "$\\circ, \\bullet$" }
        ]
    },
    {
        category: "5. 집합 및 논리학",
        inputs: [
            { syntax: "\\emptyset, \\varnothing", desc: "공집합 기호", example: "$\\emptyset, \\varnothing$" },
            { syntax: "\\in, \\notin", desc: "원소 포함 여부", example: "$\\in, \\notin$" },
            { syntax: "\\cap, \\cup", desc: "교집합 및 합집합", example: "$\\cap, \\cup$" },
            { syntax: "\\subset, \\subseteq", desc: "부분집합 포함 관계", example: "$\\subset, \\subseteq$" },
            { syntax: "\\forall, \\exists", desc: "모든(For all) / 존재성(Exist)", example: "$\\forall, \\exists$" },
            { syntax: "\\therefore, \\because", desc: "그러므로 / 왜냐하면", example: "$\\therefore, \\because$" }
        ]
    },
    {
        category: "6. 관계식 및 화살표",
        inputs: [
            { syntax: "\\ne, \\equiv", desc: "같지 않음 / 합동(동치)", example: "$\\ne, \\equiv$" },
            { syntax: "\\approx, \\propto", desc: "근사치(약 같음) / 비례 기호", example: "$\\approx, \\propto$" },
            { syntax: "\\le, \\ge", desc: "작거나 같음 / 크거나 같음", example: "$\\le, \\ge$" },
            { syntax: "\\ll, \\gg", desc: "매우 작음 / 매우 큼", example: "$\\ll, \\gg$" },
            { syntax: "\\to, \\gets, \\leftrightarrow", desc: "기본 화살표 이동", example: "$\\to, \\gets, \\leftrightarrow$" },
            { syntax: "\\Rightarrow, \\Leftrightarrow", desc: "조건 필연성 / 필요충분조건", example: "$\\Rightarrow, \\Leftrightarrow$" }
        ]
    },
    {
        category: "7. 대형 연산자 및 분수",
        inputs: [
            { syntax: "\\frac{a}{b}", desc: "기본 세로형 분수", example: "$\\frac{a}{b}$" },
            { syntax: "\\sqrt{x}, \\sqrt[n]{x}", desc: "제곱근 및 n제곱근 루트", example: "$\\sqrt{x}, \\sqrt[n]{x}$" },
            { syntax: "\\sum_{i=1}^{n}", desc: "시그마(합 연산자)", example: "$\\sum_{i=1}^{n}$" },
            { syntax: "\\prod_{i=1}^{n}", desc: "파이(곱 연산자)", example: "$\\prod_{i=1}^{n}$" },
            { syntax: "\\int_{a}^{b}", desc: "정적분 범위 지정", example: "$\\int_{a}^{b}$" },
            { syntax: "\\iint, \\oint", desc: "중적분 및 선적분 기호", example: "$\\iint, \\oint$" }
        ]
    },
    {
        category: "8. 괄호 및 크기 제어",
        inputs: [
            { syntax: "\\{ A \\}", desc: "중괄호 문자 표기 (역슬래시 필수)", example: "$\\{ A \\}$" },
            { syntax: "\\langle A \\rangle", desc: "화살괄호 (내적/양자역학)", example: "$\\langle A \\rangle$" },
            { syntax: "\\lfloor x \\rfloor, \\lceil x \\rceil", desc: "바닥함수(버림) / 천장함수(올림)", example: "$\\lfloor x \\rfloor, \\lceil x \\rceil$" },
            { syntax: "\\left( \\frac{a}{b} \\right)", desc: "안쪽 분수 크기에 맞춘 자동 확장 괄호", example: "$\\left( \\frac{a}{b} \\right)$" }
        ]
    },
    {
        category: "9. 행렬 및 구조화",
        inputs: [
            { syntax: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", desc: "둥근 괄호형 일반 행렬", example: "$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$" },
            { syntax: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", desc: "각진 대괄호형 행렬", example: "$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$" },
            { syntax: "\\begin{cases} x & (x \\ge 0) \\\\ -x & (x < 0) \\end{cases}", desc: "조건별 함수 값 정의 (연립/절댓값)", example: "$\\begin{cases} x & (x \\ge 0) \\\\ -x & (x < 0) \\end{cases}$" }
        ]
    },
    {
        category: "10. 수학용 글꼴 (Font)",
        inputs: [
            { syntax: "\\mathrm{abc}", desc: "로만체 (일반 텍스트 인라인 기입용)", example: "$\\mathrm{abc}$" },
            { syntax: "\\mathbf{xyz}", desc: "볼드체 (주로 수식 내 벡터 표기용)", example: "$\\mathbf{xyz}$" },
            { syntax: "\\mathbb{R, Z, N}", desc: "칠판 볼드체 (실수, 정수, 자연수 집합)", example: "$\\mathbb{R, Z, N}$" },
            { syntax: "\\mathcal{A, B, C}", desc: "필기 서체 표기", example: "$\\mathcal{A, B, C}$" }
        ]
    }
];

let currentGlobals = { notices: [], rules: [], latexGuide: defaultLatexGuide };

// 🌟 에디터 및 폼 상태 변수
let quillEditor = null;
let editingNoticeIndex = null; 

// ==========================================
// 🚀 초기화 및 로그인 감지
// ==========================================
const form = document.getElementById('penalty-form');
if (form) form.addEventListener('submit', handleAddPenalty);

const auth = getAuth();
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        try {
            const userDoc = await getDoc(doc(db, `users/${currentUid}`));
            isCurrentUserAdmin = (userDoc.exists() && userDoc.data().isAdmin === true);
        } catch (error) {
            console.error("권한 에러:", error);
            isCurrentUserAdmin = false;
        }

        loadPenaltyData();      
        await checkAndLoadGlobalSettings(); 
    } else {
        currentUid = null;
        isCurrentUserAdmin = false;
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        if (unsubscribeGlobals) unsubscribeGlobals();
        
        const penaltyList = document.getElementById('penalty-list');
        const totalScore = document.getElementById('total-score');
        if(penaltyList) penaltyList.innerHTML = '';
        if(totalScore) totalScore.innerText = '0';
        
        const adminForm = document.getElementById('admin-notice-form-container');
        if(adminForm) adminForm.remove();
    }
});

// ==========================================
// 👤 [개인] 상벌점 데이터 추가 및 로드
// ==========================================
async function handleAddPenalty(e) {
    e.preventDefault();
    if (!currentUid) return alert("로그인 정보가 없습니다.");
    const type = document.getElementById('point-type').value;
    const value = parseInt(document.getElementById('point-value').value, 10);
    const reason = document.getElementById('point-reason').value || "사유 없음";
    if (isNaN(value) || value <= 0) return alert("올바른 점수를 입력해주세요.");
    
    const finalScore = type === 'demerit' ? -value : value;
    try {
        const meritsRef = collection(db, `users/${currentUid}/merits`);
        await addDoc(meritsRef, { score: finalScore, type: type, reason: reason, createdAt: serverTimestamp() });
        document.getElementById('penalty-form').reset();
    } catch (error) { alert("기록 추가 중 오류가 발생했습니다."); }
}

function loadPenaltyData() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const meritsRef = collection(db, `users/${currentUid}/merits`);
    const q = query(meritsRef, orderBy("createdAt", "desc"));
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const listContainer = document.getElementById('penalty-list');
        const scoreDisplay = document.getElementById('total-score');
        const scoreStatusText = document.getElementById('score-status-text');
        if(!listContainer) return;

        listContainer.innerHTML = ''; 
        let totalScore = 0;
        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="padding:15px; color:#888; text-align:center;">기록된 내역이 없습니다.</p>';
            scoreDisplay.innerText = "0"; scoreDisplay.className = "total-score-display"; scoreStatusText.innerText = "기록이 없습니다.";
            return;
        }
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            totalScore += data.score; 
            const item = document.createElement('div');
            item.className = 'cl-list-item penalty-item';
            const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString('ko-KR') : '방금 전';
            const scoreColor = data.score > 0 ? '#1e8e3e' : '#d93025';
            
            item.innerHTML = `
                <div class="penalty-info">
                    <span class="penalty-reason">${data.reason}</span>
                    <span class="penalty-date">${dateStr}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="penalty-points" style="color: ${scoreColor};">${data.score > 0 ? '+'+data.score : data.score}점</span>
                    <button class="btn-delete" data-id="${docSnap.id}" title="삭제" style="background:none;border:none;cursor:pointer;font-size:16px;">🗑️</button>
                </div>
            `;
            listContainer.appendChild(item);
        });
        scoreDisplay.innerText = totalScore;
        if (totalScore > 0) {
            scoreDisplay.className = "total-score-display score-positive"; scoreStatusText.innerText = "현재 상점이 더 많습니다!";
        } else if (totalScore < 0) {
            scoreDisplay.className = "total-score-display score-negative"; scoreStatusText.innerText = "주의! 벌점이 누적되고 있습니다.";
        } else {
            scoreDisplay.className = "total-score-display"; scoreStatusText.innerText = "상점과 벌점이 균형을 이루고 있습니다.";
        }

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm("기록을 삭제하시겠습니까?")) {
                    await deleteDoc(doc(db, `users/${currentUid}/merits/${e.target.closest('.btn-delete').getAttribute('data-id')}`));
                }
            });
        });
    });
}

// ==========================================
// 🛠️ [전역/관리자] 고도화된 공지사항 및 징계기준
// ==========================================
async function checkAndLoadGlobalSettings() {
    if (unsubscribeGlobals) unsubscribeGlobals();
    const settingsRef = doc(db, 'system', 'globals');

    // 🚀 [임시 치트코드] 새로고침하는 순간 무조건 위키백과 데이터베이스로 강제 덮어쓰기!
    try {
        await updateDoc(settingsRef, { latexGuide: defaultLatexGuide });
        console.log("✅ 위키백과 가이드 자동 마이그레이션 성공!");
    } catch(e) {
        // 문서가 아예 없는 초기 계정인 경우 세팅
        await setDoc(settingsRef, { notices: [], rules: [], latexGuide: defaultLatexGuide });
    }
    
    try {
        if (isCurrentUserAdmin) {
            const docSnap = await getDoc(settingsRef);
            if (!docSnap.exists()) {
                // 1. 문서 자체가 아예 없는 경우 (최초 세팅)
                await setDoc(settingsRef, { notices: [], rules: [], latexGuide: defaultLatexGuide });
            } else {
                // 2. 문서가 이미 있는데 latexGuide 필드만 없는 경우 (기존 유저 업데이트)
                const data = docSnap.data();
                if (!data.latexGuide) {
                    await updateDoc(settingsRef, { latexGuide: defaultLatexGuide });
                }
            }
        }
    } catch (e) {
        console.error("전역 설정 로드 에러:", e);
    }

    unsubscribeGlobals = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentGlobals.notices = data.notices || [];
            currentGlobals.rules = data.rules || [];
            currentGlobals.latexGuide = data.latexGuide && data.latexGuide.length > 0 ? data.latexGuide : defaultLatexGuide;
        } else {
            currentGlobals = { notices: [], rules: [], latexGuide: defaultLatexGuide };
        }
        
        renderAdminForm(); 
        renderNotices(currentGlobals.notices);
        renderRules(currentGlobals.rules);
    });
}

// 📌 관리자용 글쓰기/수정 폼 및 가이드 시스템 생성
function renderAdminForm() {
    if (!isCurrentUserAdmin) return;
    
    const listEl = document.getElementById('notice-list-container');
    if (!listEl) return;

    let formContainer = document.getElementById('admin-notice-form-container');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'admin-notice-form-container';
        formContainer.style.cssText = "padding: 15px; margin-bottom: 20px; background: #fdfdfd; border: 1px dashed #1a73e8; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;";
        
        formContainer.innerHTML = `
            <div style="font-weight:bold; color:#1a73e8; font-size:14px; margin-bottom:5px;" id="admin-form-title">📝 새 공지사항 작성</div>
            <input type="text" id="new-notice-title" placeholder="공지사항 제목" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
            
            <div id="editor-wrapper" style="background:#fff; border-radius:4px;">
                <div id="new-notice-editor" style="height: 150px; font-size: 14px;"></div>
            </div>
            
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 4px;">
                <div id="latex-guide-toggle" style="background: #f8fafc; padding: 8px 12px; font-size: 13px; font-weight: bold; color: #475569; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                    <span>📐 LaTeX 수식 작성 문법 가이드 보기</span>
                    <span id="latex-guide-arrow" style="transition: transform 0.2s;">▶</span>
                </div>
                <div id="latex-guide-content" style="display: none; padding: 12px; background: #ffffff; font-size: 13px; border-top: 1px solid #e2e8f0; line-height: 1.6; max-height: 250px; overflow-y: auto;">
                    </div>
            </div>
            
            <div style="font-weight:bold; font-size:12px; color:#555; margin-top:10px;">📎 파일 / 링크 첨부 (다중 지원)</div>
            <div id="link-inputs-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            
            <div style="display:flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <button type="button" id="btn-add-link-row" style="background:none; border:1px solid #5f6368; color:#5f6368; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">+ 링크 입력칸 추가</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" id="btn-cancel-edit" style="display:none; background:#f1f3f4; color:#333; border:none; border-radius:4px; padding: 8px 16px; cursor:pointer;">수정 취소</button>
                    <button id="btn-submit-notice" class="cl-btn-primary" style="padding: 8px 16px; cursor:pointer;">공지 등록</button>
                </div>
            </div>
        `;
        listEl.parentNode.insertBefore(formContainer, listEl);

        // Quill 에디터 초기화
        if (window.Quill) {
            quillEditor = new Quill('#new-notice-editor', {
                theme: 'snow',
                placeholder: '본문 내용 입력 (볼드, 색상, 수식 가이드 참조하여 수식 기입 가능)',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'clean']
                    ]
                }
            });

            // 툴바 한국어 툴팁 
            const toolbarContainer = formContainer.querySelector('.ql-toolbar');
            if (toolbarContainer) {
                const toolbarTitles = {
                    '.ql-bold': '굵게 (Ctrl+B)', '.ql-italic': '기울임꼴 (Ctrl+I)', '.ql-underline': '밑줄 (Ctrl+U)',
                    '.ql-strike': '취소선', '.ql-color': '글자 색상', '.ql-background': '배경 색상',
                    '.ql-list[value="ordered"]': '숫자 목록', '.ql-list[value="bullet"]': '점 목록',
                    '.ql-link': '링크 삽입', '.ql-clean': '서식 지우기',
                    '.ql-header[value="1"]': '대제목', '.ql-header[value="2"]': '중제목', '.ql-header:not([value])': '본문'
                };
                for (let selector in toolbarTitles) {
                    const el = toolbarContainer.querySelector(selector);
                    if (el) el.setAttribute('title', toolbarTitles[selector]);
                }
            }
        }
        
        // 🔍 2. Firebase 기반 LaTeX 가이드 동적 렌더링 및 펼치기/접기
        const guideToggle = formContainer.querySelector('#latex-guide-toggle');
        if (guideToggle) {
            guideToggle.addEventListener('click', () => {
                const content = formContainer.querySelector('#latex-guide-content');
                const arrow = formContainer.querySelector('#latex-guide-arrow');
                
                if (content.style.display === 'none') {
                    // 최초 열림 시 Firebase 데이터 기반으로 HTML 동적 생성
                    if (content.innerHTML.trim() === "") {
                        const guideData = currentGlobals.latexGuide || defaultLatexGuide;
                        let html = `<p style="margin-top:0; font-weight: 500; color:#2563eb;">💡 아래 문법을 본문에 입력하면 수식으로 자동 변환됩니다.</p>`;
                        
                        guideData.forEach(cat => {
                            html += `<h4 style="margin:12px 0 6px 0; color:#1e293b;">📌 ${cat.category}</h4>`;
                            html += `<table style="width:100%; border-collapse:collapse; text-align:left; font-size:12px; margin-bottom:10px;">
                                        <thead>
                                            <tr style="background:#f1f5f9; border-bottom: 2px solid #cbd5e1;">
                                                <th style="padding:6px; width:25%;">설명</th>
                                                <th style="padding:6px; width:45%;">문법 입력</th>
                                                <th style="padding:6px; width:30%;">미리보기</th>
                                            </tr>
                                        </thead>
                                        <tbody>`;
                            cat.inputs.forEach(item => {
                                // 역슬래시가 화면에 잘 보이도록 처리
                                const safeSyntax = item.syntax.replace(/\\/g, '\\\\');
                                html += `<tr style="border-bottom:1px solid #e2e8f0;">
                                            <td style="padding:6px; font-weight:bold; color:#475569;">${item.desc}</td>
                                            <td style="padding:6px;"><code style="background:#f1f5f9; padding:2px 4px; border-radius:3px; font-family:monospace; color:#ef4444;">${safeSyntax}</code></td>
                                            <td style="padding:6px;">${item.example}</td>
                                         </tr>`;
                            });
                            html += `</tbody></table>`;
                        });
                        
                        content.innerHTML = html;
                        
                        // 생성된 HTML 안의 예시 수식들을 KaTeX로 변환
                        if (window.renderMathInElement) {
                            window.renderMathInElement(content, { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}] });
                        }
                    }

                    content.style.display = 'block';
                    arrow.style.transform = 'rotate(90deg)';
                } else {
                    content.style.display = 'none';
                    arrow.style.transform = 'rotate(0deg)';
                }
            });
        }
        
        addLinkRow();
    }
}

// 📌 다중 링크 입력칸 추가 함수
function addLinkRow(name = '', url = '') {
    const container = document.getElementById('link-inputs-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'link-input-row';
    row.style.cssText = 'display:flex; gap: 10px; align-items:center;';
    row.innerHTML = `
        <input type="text" class="new-notice-file-name" placeholder="링크 이름" value="${name}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 30%;">
        <input type="url" class="new-notice-file-url" placeholder="URL (http://...)" value="${url}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; flex:1;">
        <button type="button" class="btn-remove-link-row" style="background:none; border:none; cursor:pointer; color:#d93025; font-size:16px; flex-shrink:0;">✕</button>
    `;
    container.appendChild(row);
}

// 📌 공지사항 렌더링
function renderNotices(notices) {
    const titleEl = document.getElementById('latest-notice-title');
    const listEl = document.getElementById('notice-list-container');
    if (!titleEl || !listEl) return;

    const latestNotice = notices.length > 0 ? notices[notices.length - 1] : null;
    titleEl.innerText = latestNotice ? (typeof latestNotice === 'string' ? latestNotice : latestNotice.title) : "등록된 공지사항이 없습니다.";

    let html = '';
    if (notices.length === 0) {
        html += '<p style="padding: 15px; color: #666;">현재 등록된 공지가 없습니다.</p>';
    } else {
        notices.slice().reverse().forEach((n, reversedIndex) => {
            const originalIndex = notices.length - 1 - reversedIndex;
            const noticeObj = typeof n === 'string' ? { title: n, body: '', files: [] } : n;
            
            let files = noticeObj.files ? [...noticeObj.files] : [];
            if (noticeObj.fileUrl && files.length === 0) files.push({ name: noticeObj.fileName, url: noticeObj.fileUrl });

            let linksHtml = '';
            if (files.length > 0) {
                linksHtml = `
                    <div style="margin-top:15px; padding: 12px; background:#e8f0fe; border-radius:6px;">
                        <div style="font-weight:bold; font-size:12px; color:#1a73e8; margin-bottom:8px;">📎 첨부 자료</div>
                        <ul style="margin: 0; padding-left: 20px; list-style-type: disc;">
                `;
                files.forEach(f => {
                    linksHtml += `<li style="margin-bottom: 4px;"><a href="${f.url}" target="_blank" style="color:#1a73e8; text-decoration:none; font-weight:500;">${f.name || '첨부 링크'}</a></li>`;
                });
                linksHtml += `</ul></div>`;
            }

            html += `
                <div class="notice-accordion-item" style="border-bottom: 1px solid #eee; display:flex; flex-direction:column;">
                    <div class="notice-title-bar" data-target="notice-body-${originalIndex}" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 15px; cursor: pointer;">
                        <span style="font-size: 14px; font-weight: bold; color: #333; flex:1;">📢 ${noticeObj.title}</span>
                        ${isCurrentUserAdmin ? `
                            <div style="display:flex; gap:12px; flex-shrink:0;">
                                <button class="btn-edit-global" data-index="${originalIndex}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="수정">✏️</button>
                                <button class="btn-delete-global" data-type="notices" data-index="${originalIndex}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="삭제">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                    <div id="notice-body-${originalIndex}" style="display:none; padding: 15px; background: #fafafa; border-top: 1px dashed #ddd; font-size: 14px; color: #333; line-height: 1.6;">
                        <div class="ql-editor" style="padding:0; min-height:auto;">${noticeObj.body || ''}</div>
                        ${linksHtml}
                    </div>
                </div>
            `;
        });
    }
    listEl.innerHTML = html;

    if (window.renderMathInElement) {
        renderMathInElement(listEl, { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}] });
    }
}

// 📌 징계 기준
function renderRules(rules) { 
    const listEl = document.getElementById('discipline-list-container');
    if (!listEl) return;
    let html = '';
    if (rules.length === 0) { html += '<p style="padding: 15px; color:#c5221f;">등록된 징계 기준이 없습니다.</p>'; } 
    else {
        html += `<ul class="rule-list" style="margin: 0; padding: 15px; padding-left: 30px;">`;
        rules.forEach((r, idx) => {
            html += `<li style="margin-bottom: 8px; display:flex; justify-content:space-between;"><span style="color:#c5221f;">• ${r}</span>
            ${isCurrentUserAdmin ? `<button class="btn-delete-global" data-type="rules" data-index="${idx}" style="background:none;border:none;cursor:pointer;">🗑️</button>` : ''}</li>`;
        });
        html += `</ul>`;
    }
    if (isCurrentUserAdmin) {
        html += `<div style="padding: 12px; margin: 10px 15px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 6px; display: flex; gap: 8px;">
            <input type="text" id="new-rule-input" placeholder="새 징계 기준" style="flex:1; padding: 8px; border: 1px solid #ddd;"><button class="btn-add-global cl-btn-primary" data-type="rules" style="padding: 8px;">추가</button></div>`;
    }
    listEl.innerHTML = html;
}

// ==========================================
// 🖱️ 이벤트 리스너 (아코디언 토글 & 관리자 통합 액션)
// ==========================================
document.addEventListener('click', async (e) => {
    const titleBar = e.target.closest('.notice-title-bar');
    if (titleBar && !e.target.closest('button')) {
        const bodyEl = document.getElementById(titleBar.getAttribute('data-target'));
        if (bodyEl) bodyEl.style.display = bodyEl.style.display === 'none' ? 'block' : 'none';
        return;
    }

    if (!isCurrentUserAdmin) return;
    const settingsRef = doc(db, 'system', 'globals');
    const target = e.target.closest('button');
    if (!target) return;

    if (target.id === 'btn-add-link-row') return addLinkRow();
    if (target.classList.contains('btn-remove-link-row')) return target.closest('.link-input-row').remove();

    if (target.classList.contains('btn-edit-global')) {
        editingNoticeIndex = parseInt(target.dataset.index, 10);
        const notice = currentGlobals.notices[editingNoticeIndex];
        
        document.getElementById('admin-form-title').innerText = "🔄 공지사항 수정 중...";
        document.getElementById('new-notice-title').value = notice.title;
        document.getElementById('btn-submit-notice').innerText = "수정 완료";
        document.getElementById('btn-cancel-edit').style.display = "block";
        
        if(quillEditor) quillEditor.clipboard.dangerouslyPasteHTML(notice.body || '');
        
        const linkContainer = document.getElementById('link-inputs-container');
        linkContainer.innerHTML = ''; 
        let files = notice.files || [];
        if(notice.fileUrl && files.length === 0) files.push({name: notice.fileName, url: notice.fileUrl});
        
        if(files.length > 0) {
            files.forEach(f => addLinkRow(f.name, f.url));
        } else {
            addLinkRow(); 
        }
        
        document.getElementById('admin-notice-form-container').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    if (target.id === 'btn-cancel-edit') {
        resetAdminForm();
        return;
    }

    if (target.id === 'btn-submit-notice') {
        const titleEl = document.getElementById('new-notice-title');
        const title = titleEl.value.trim();
        const bodyHtml = quillEditor ? quillEditor.root.innerHTML : ''; 

        if (!title) return alert("공지사항 제목을 입력해주세요.");
        
        const fileRows = document.querySelectorAll('.link-input-row');
        let filesArray = [];
        fileRows.forEach(row => {
            const name = row.querySelector('.new-notice-file-name').value.trim();
            const url = row.querySelector('.new-notice-file-url').value.trim();
            if (url) filesArray.push({ name: name || '첨부 링크 열기', url: url });
        });

        target.innerText = "저장 중...";
        target.disabled = true;

        try {
            const newNoticeObj = {
                title: title,
                body: bodyHtml, 
                files: filesArray, 
                createdAt: new Date().toISOString()
            };

            if (editingNoticeIndex !== null) {
                currentGlobals.notices[editingNoticeIndex] = newNoticeObj;
            } else {
                currentGlobals.notices.push(newNoticeObj);
            }

            await updateDoc(settingsRef, { notices: currentGlobals.notices });
            resetAdminForm(); 
            
        } catch (err) {
            console.error("공지사항 저장 실패:", err);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            target.disabled = false;
        }
        return;
    }

    if (target.classList.contains('btn-add-global')) {
        const inputEl = document.getElementById(`new-rule-input`);
        const text = inputEl.value.trim();
        if (text) {
            currentGlobals.rules.push(text);
            await updateDoc(settingsRef, { rules: currentGlobals.rules });
        }
    }
    if (target.classList.contains('btn-delete-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        if (confirm("이 항목을 정말로 삭제하시겠습니까?")) {
            currentGlobals[type].splice(idx, 1); 
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
        }
    }
});

function resetAdminForm() {
    editingNoticeIndex = null;
    document.getElementById('admin-form-title').innerText = "📝 새 공지사항 작성";
    document.getElementById('new-notice-title').value = '';
    document.getElementById('btn-submit-notice').innerText = "공지 등록";
    document.getElementById('btn-cancel-edit').style.display = "none";
    if(quillEditor) quillEditor.setContents([]); 
    
    document.getElementById('link-inputs-container').innerHTML = '';
    addLinkRow(); 
}
