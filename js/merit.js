import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

// 🚀 새롭게 분리한 독립 에디터 클래스 불러오기
import { NoticeEditor } from './rich-editor.js';

console.log("🚀 merit.js 로드 완료 (Firebase 기반 동적 수식 가이드 탑재 - 에디터 모듈화 적용)");

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

let currentGlobals = { notices: [], rules: [], latexGuide: defaultLatexGuide };

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
        renderRules(currentGlobals.rules);
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

// 📌 징계 기준 렌더링
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

    // 공지사항 수정 버튼 감지
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

    // 징계 기준 추가
    if (target.classList.contains('btn-add-global')) {
        const inputEl = document.getElementById(`new-rule-input`);
        const text = inputEl.value.trim();
        if (text) {
            currentGlobals.rules.push(text);
            await updateDoc(settingsRef, { rules: currentGlobals.rules });
        }
    }
    
    // 항목 삭제 (공지사항 & 징계 기준)
    if (target.classList.contains('btn-delete-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        if (confirm("이 항목을 정말로 삭제하시겠습니까?")) {
            currentGlobals[type].splice(idx, 1); 
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
            
            // 공지사항 삭제 시, 현재 에디터가 수정 중이던 항목이라면 에디터도 함께 초기화
            if (type === 'notices' && editingNoticeIndex === parseInt(idx, 10)) {
                editingNoticeIndex = null;
                if (editorInstance) editorInstance.reset();
            }
        }
    }
});
