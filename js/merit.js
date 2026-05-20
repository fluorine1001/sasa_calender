import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

// 🚀 새롭게 분리한 독립 에디터 클래스 불러오기
import { NoticeEditor } from './rich-editor.js';

console.log("🚀 merit.js 로드 완료 (Firebase 기반 동적 수식 가이드 및 중첩 징계 기준 아코디언 탑재)");

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeSnapshot = null;
let unsubscribeGlobals = null;

// 💡 기본 수식 가이드 데이터 (Firebase에 데이터가 없을 때 사용될 기본값)
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
    }
];

// 💡 중첩 징계 기준 구조를 지원하기 위한 글로벌 상태 초기화
let currentGlobals = { notices: [], rules: [], latexGuide: defaultLatexGuide };

// 화면을 다시 그릴 때 열려있던 토글 상태를 유지하기 위한 메모리 Set
let openRulesTracker = new Set();

// 🌟 에디터 및 폼 상태 변수
let editorInstance = null;
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

    try {
        if (isCurrentUserAdmin) {
            const docSnap = await getDoc(settingsRef);
            if (!docSnap.exists()) {
                await setDoc(settingsRef, { notices: [], rules: [], latexGuide: defaultLatexGuide });
            } else {
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
        renderRules(currentGlobals.rules); // 업그레이드된 중첩 렌더러 호출
    });
}

// 📌 관리자용 글쓰기/수정 폼 (독립 모듈 활용)
function renderAdminForm() {
    if (!isCurrentUserAdmin) return;
    
    const listEl = document.getElementById('notice-list-container');
    if (!listEl) return;

    let formContainer = document.getElementById('admin-notice-form-container');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'admin-notice-form-container';
        listEl.parentNode.insertBefore(formContainer, listEl);

        // 💡 분리된 에디터 모듈 장착
        editorInstance = new NoticeEditor('admin-notice-form-container', currentGlobals.latexGuide || defaultLatexGuide, {
            onSubmit: async (data) => {
                const settingsRef = doc(db, 'system', 'globals');
                const newNoticeObj = {
                    title: data.title,
                    body: data.bodyHtml, 
                    files: data.files, 
                    createdAt: new Date().toISOString()
                };

                if (editingNoticeIndex !== null) {
                    currentGlobals.notices[editingNoticeIndex] = newNoticeObj;
                } else {
                    currentGlobals.notices.push(newNoticeObj);
                }
                await updateDoc(settingsRef, { notices: currentGlobals.notices });
                editingNoticeIndex = null;
            },
            onCancel: () => {
                editingNoticeIndex = null;
            }
        });
    }
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

// ==========================================
// 🔄 💥 [업그레이드] 중첩 리스트형 징계 기준 렌더링 시스템
// ==========================================
function renderRules(rules) { 
    const listEl = document.getElementById('discipline-list-container');
    if (!listEl) return;
    
    let html = '';

    // 기존 String 배열 유저 구버전 데이터 마이그레이션 및 파싱 처리
    let parsedRules = [];
    rules.forEach((item) => {
        if (typeof item === 'string') {
            parsedRules.push({ score: item, reasons: [] });
        } else if (item && item.score) {
            parsedRules.push(item);
        }
    });

    if (parsedRules.length === 0) { 
        html += '<p style="padding: 20px; color:#c5221f; text-align:center; font-size:14px;">등록된 벌점 분류 기준이 없습니다.</p>'; 
    } else {
        html += `<div class="rules-accordion-wrapper" style="display:flex; flex-direction:column; gap:8px; padding:12px;">`;
        
        parsedRules.forEach((ruleGroup, parentIdx) => {
            const isOpened = openRulesTracker.has(parentIdx);
            const contentDisplay = isOpened ? 'block' : 'none';
            const arrowRotate = isOpened ? 'transform: rotate(90deg);' : '';

            // 내부 자식 리스트 사유들 파싱하기
            let childReasonsHtml = '';
            if (!ruleGroup.reasons || ruleGroup.reasons.length === 0) {
                childReasonsHtml = `<li style="color:#888; font-size:13px; list-style:none; padding: 4px 0;">등록된 하위 세부 사유가 없습니다.</li>`;
            } else {
                ruleGroup.reasons.forEach((reason, childIdx) => {
                    childReasonsHtml += `
                        <li style="margin-bottom: 6px; display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#333; padding:4px 0; border-bottom: 1px dashed #f1f1f1;">
                            <span>• ${reason}</span>
                            ${isCurrentUserAdmin ? `
                                <button class="btn-delete-sub-reason" data-parent-idx="${parentIdx}" data-child-idx="${childIdx}" style="background:none; border:none; cursor:pointer; color:#d93025; font-size:12px; padding:2px 6px;">삭제</button>
                            ` : ''}
                        </li>
                    `;
                });
            }

            html += `
                <div class="rule-group-item" style="border: 1px solid #e0e0e0; border-radius:6px; background:#fff; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <div class="rule-group-header" data-group-idx="${parentIdx}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; cursor:pointer; background:#f8fafc; user-select:none;">
                        <span style="font-weight:bold; color:#1e3a8a; font-size:14px;">📊 ${ruleGroup.score} <small style="color:#64748b; font-weight:normal; margin-left:6px;">(${ruleGroup.reasons ? ruleGroup.reasons.length : 0}건)</small></span>
                        <div style="display:flex; align-items:center; gap:12px;">
                            ${isCurrentUserAdmin ? `
                                <button class="btn-delete-parent-group" data-parent-idx="${parentIdx}" style="background:none; border:none; cursor:pointer; font-size:12px; color:#d93025;" title="분류 삭제">✕</button>
                            ` : ''}
                            <span class="rule-arrow" style="font-size:11px; color:#64748b; transition:transform 0.2s; ${arrowRotate}">▶</span>
                        </div>
                    </div>
                    
                    <div class="rule-group-body" id="rule-group-body-${parentIdx}" style="display:${contentDisplay}; padding:15px; background:#ffffff; border-top:1px solid #eee;">
                        <ul style="margin: 0; padding-left: 10px; list-style:none;">
                            ${childReasonsHtml}
                        </ul>
                        
                        ${isCurrentUserAdmin ? `
                            <div style="display:flex; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid #f1f1f1;">
                                <input type="text" id="new-reason-input-${parentIdx}" placeholder="${ruleGroup.score}에 매칭할 사유 내용" style="flex:1; padding:6px 10px; font-size:12px; border:1px solid #cbd5e1; border-radius:4px; outline:none;">
                                <button class="btn-add-sub-reason cl-btn-primary" data-parent-idx="${parentIdx}" style="padding:6px 12px; font-size:12px; background:#10b981; border-radius:4px; border:none; color:#fff; cursor:pointer; font-weight:bold;">사유 추가</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // 관리자 하단 새 조건 추가창 바인딩
    if (isCurrentUserAdmin) {
        html += `
            <div style="padding: 12px; margin: 10px 12px; background: #fdfdfd; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; gap: 8px; align-items:center;">
                <input type="text" id="new-rule-input" placeholder="예: 벌점 1점, 벌점 3점, 상점 기준 등" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:13px;">
                <button class="btn-add-parent-group cl-btn-primary" style="padding:8px 14px; font-size:13px; font-weight:bold; background:#1a73e8; border:none; color:white; border-radius:4px; cursor:pointer;">➕ 분류 추가</button>
            </div>
        `;
    }
    
    listEl.innerHTML = html;
}

// ==========================================
// 🖱️ 이벤트 리스너 (아코디언 토글 & 관리자 통합 액션)
// ==========================================
document.addEventListener('click', async (e) => {
    // 1. 공지사항 아코디언 토글 제어
    const titleBar = e.target.closest('.notice-title-bar');
    if (titleBar && !e.target.closest('button')) {
        const bodyEl = document.getElementById(titleBar.getAttribute('data-target'));
        if (bodyEl) bodyEl.style.display = bodyEl.style.display === 'none' ? 'block' : 'none';
        return;
    }

    // 2. 💥 중첩 벌점 징계 기준 아코디언 토글 제어 (비로그인/로그인 공용)
    const ruleHeader = e.target.closest('.rule-group-header');
    if (ruleHeader && !e.target.closest('button')) {
        const pIdx = parseInt(ruleHeader.dataset.groupIdx, 10);
        const bodyEl = document.getElementById(`rule-group-body-${pIdx}`);
        const arrowEl = ruleHeader.querySelector('.rule-arrow');
        
        if (bodyEl.style.display === 'none') {
            bodyEl.style.display = 'block';
            arrowEl.style.transform = 'rotate(90deg)';
            openRulesTracker.add(pIdx); // 열림 상태 기록
        } else {
            bodyEl.style.display = 'none';
            arrowEl.style.transform = '';
            openRulesTracker.delete(pIdx); // 닫힘 상태 기록
        }
        return;
    }

    if (!isCurrentUserAdmin) return;
    const settingsRef = doc(db, 'system', 'globals');
    const target = e.target.closest('button');
    if (!target) return;

    // 3. 공지사항 수정 버튼 핸들러
    if (target.classList.contains('btn-edit-global')) {
        editingNoticeIndex = parseInt(target.dataset.index, 10);
        const notice = currentGlobals.notices[editingNoticeIndex];
        
        let files = notice.files || [];
        if(notice.fileUrl && files.length === 0) files.push({name: notice.fileName, url: notice.fileUrl});
        
        if (editorInstance) {
            editorInstance.setData(notice.title, notice.body, files);
        }
        
        document.getElementById('admin-notice-form-container').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    // 4. 공지사항 삭제 핸들러
    if (target.classList.contains('btn-delete-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        if (confirm("이 항목을 정말로 삭제하시겠습니까?")) {
            currentGlobals[type].splice(idx, 1); 
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
            
            if (type === 'notices' && editingNoticeIndex === parseInt(idx, 10)) {
                editingNoticeIndex = null;
                if (editorInstance) editorInstance.reset();
            }
        }
        return;
    }

    // 5. 💥 [중첩 리스트] 1단계 - 대분류(벌점 조건) 추가
    if (target.classList.contains('btn-add-parent-group')) {
        const inputEl = document.getElementById('new-rule-input');
        const text = inputEl.value.trim();
        if (!text) return alert("추가할 벌점 분류명을 적어주세요.");
        
        // 새 데이터 구조 push
        currentGlobals.rules.push({ score: text, reasons: [] });
        await updateDoc(settingsRef, { rules: currentGlobals.rules });
        inputEl.value = '';
        return;
    }

    // 6. 💥 [중첩 리스트] 1단계-1 - 대분류 전체 삭제
    if (target.classList.contains('btn-delete-parent-group')) {
        if (!confirm("이 벌점 분류 그룹과 소속된 모든 하위 사유가 영구 삭제됩니다. 진행할까요?")) return;
        const parentIdx = parseInt(target.dataset.parentIdx, 10);
        
        currentGlobals.rules.splice(parentIdx, 1);
        openRulesTracker.delete(parentIdx); // 추적기 초기화
        await updateDoc(settingsRef, { rules: currentGlobals.rules });
        return;
    }

    // 7. 💥 [중첩 리스트] 2단계 - 대분류 내부에 '세부 사유' 서브 추가
    if (target.classList.contains('btn-add-sub-reason')) {
        const parentIdx = parseInt(target.dataset.parentIdx, 10);
        const inputEl = document.getElementById(`new-reason-input-${parentIdx}`);
        const text = inputEl.value.trim();
        if (!text) return alert("징계 사유 내용을 바르게 채워주세요.");

        if (!currentGlobals.rules[parentIdx].reasons) {
            currentGlobals.rules[parentIdx].reasons = [];
        }
        
        currentGlobals.rules[parentIdx].reasons.push(text);
        openRulesTracker.add(parentIdx); // 새로 추가된 그룹은 화면 갱신 후에도 강제 열림 처리
        await updateDoc(settingsRef, { rules: currentGlobals.rules });
        return;
    }

    // 8. 💥 [중첩 리스트] 2단계-1 - 세부 사유 건별 삭제
    if (target.classList.contains('btn-delete-sub-reason')) {
        const parentIdx = parseInt(target.dataset.parentIdx, 10);
        const childIdx = parseInt(target.dataset.childIdx, 10);
        
        currentGlobals.rules[parentIdx].reasons.splice(childIdx, 1);
        openRulesTracker.add(parentIdx); // 삭제 액션 후에도 열림 상태 유지 보존
        await updateDoc(settingsRef, { rules: currentGlobals.rules });
        return;
    }
});
