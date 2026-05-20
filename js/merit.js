import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

console.log("🚀 merit.js 로드 완료 (Rich Text Editor + 수정 기능 + 다중 링크 적용)");

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeSnapshot = null;
let unsubscribeGlobals = null;
let currentGlobals = { notices: [], rules: [] };

// 🌟 에디터 및 폼 상태 변수
let quillEditor = null;
let editingNoticeIndex = null; // 현재 수정 중인 공지의 인덱스 (null이면 새 글 작성)

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
// 👤 [개인] 상벌점 데이터 추가 및 로드 (생략/유지)
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
            if (!docSnap.exists()) await setDoc(settingsRef, { notices: [], rules: [] });
        }
    } catch (e) {}

    unsubscribeGlobals = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            currentGlobals = docSnap.data();
            if (!currentGlobals.notices) currentGlobals.notices = [];
            if (!currentGlobals.rules) currentGlobals.rules = [];
        } else {
            currentGlobals = { notices: [], rules: [] };
        }
        
        renderAdminForm(); // 관리자 폼 렌더링
        renderNotices(currentGlobals.notices);
        renderRules(currentGlobals.rules);
    });
}

// 📌 관리자용 글쓰기/수정 폼 생성 (한 번만 생성되어 에디터 유지)
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

        // Quill 에디터 초기화 (툴바 설정 포함)
        if (window.Quill) {
            quillEditor = new Quill('#new-notice-editor', {
                theme: 'snow',
                placeholder: '본문 내용 입력 (볼드, 색상, 수식 등 적용 가능)',
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
        }
        
        // 기본 링크 칸 1개 추가
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

    // 수식 렌더링 (KaTeX 등 연동 시)
    if (window.renderMathInElement) {
        renderMathInElement(listEl, { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}] });
    }
}

// 📌 징계 기준 (생략/유지)
function renderRules(rules) { /* 기존 코드와 동일하여 축약 (기능 유지됨) */ 
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
    // 📌 공지 아코디언 토글
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

    // 🔗 링크 관련 버튼 동작
    if (target.id === 'btn-add-link-row') return addLinkRow();
    if (target.classList.contains('btn-remove-link-row')) return target.closest('.link-input-row').remove();

    // ✏️ 글 수정 버튼 클릭 시 폼에 데이터 세팅
    if (target.classList.contains('btn-edit-global')) {
        editingNoticeIndex = parseInt(target.dataset.index, 10);
        const notice = currentGlobals.notices[editingNoticeIndex];
        
        document.getElementById('admin-form-title').innerText = "🔄 공지사항 수정 중...";
        document.getElementById('new-notice-title').value = notice.title;
        document.getElementById('btn-submit-notice').innerText = "수정 완료";
        document.getElementById('btn-cancel-edit').style.display = "block";
        
        // 에디터에 기존 HTML 세팅
        if(quillEditor) quillEditor.clipboard.dangerouslyPasteHTML(notice.body || '');
        
        // 기존 첨부 링크들 세팅
        const linkContainer = document.getElementById('link-inputs-container');
        linkContainer.innerHTML = ''; // 초기화
        let files = notice.files || [];
        if(notice.fileUrl && files.length === 0) files.push({name: notice.fileName, url: notice.fileUrl});
        
        if(files.length > 0) {
            files.forEach(f => addLinkRow(f.name, f.url));
        } else {
            addLinkRow(); // 비어있으면 1개 기본 생성
        }
        
        // 화면 최상단 폼으로 스크롤 부드럽게 이동
        document.getElementById('admin-notice-form-container').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    // ❌ 수정 취소 버튼
    if (target.id === 'btn-cancel-edit') {
        resetAdminForm();
        return;
    }

    // 📝 폼 제출 (등록 또는 수정)
    if (target.id === 'btn-submit-notice') {
        const titleEl = document.getElementById('new-notice-title');
        const title = titleEl.value.trim();
        const bodyHtml = quillEditor ? quillEditor.root.innerHTML : ''; // 에디터의 HTML 추출

        if (!title) return alert("공지사항 제목을 입력해주세요.");
        
        // 링크 수집
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
                body: bodyHtml, // HTML 포맷으로 저장
                files: filesArray, 
                createdAt: new Date().toISOString()
            };

            if (editingNoticeIndex !== null) {
                // 기존 데이터 수정
                currentGlobals.notices[editingNoticeIndex] = newNoticeObj;
            } else {
                // 새 데이터 추가
                currentGlobals.notices.push(newNoticeObj);
            }

            await updateDoc(settingsRef, { notices: currentGlobals.notices });
            resetAdminForm(); // 성공 시 폼 초기화
            
        } catch (err) {
            console.error("공지사항 저장 실패:", err);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            target.disabled = false;
        }
        return;
    }

    // 기타 전역 설정 버튼 (룰 추가/삭제 및 공지 삭제)
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

// 📌 폼 상태 초기화 함수
function resetAdminForm() {
    editingNoticeIndex = null;
    document.getElementById('admin-form-title').innerText = "📝 새 공지사항 작성";
    document.getElementById('new-notice-title').value = '';
    document.getElementById('btn-submit-notice').innerText = "공지 등록";
    document.getElementById('btn-cancel-edit').style.display = "none";
    if(quillEditor) quillEditor.setContents([]); // 에디터 비우기
    
    document.getElementById('link-inputs-container').innerHTML = '';
    addLinkRow(); // 기본 1칸 복구
}
