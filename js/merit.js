import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
// 📁 파일 스토리지를 위한 모듈 추가
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";

const storage = getStorage(); // 스토리지 초기화
let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeSnapshot = null;
let unsubscribeGlobals = null;
let currentGlobals = { notices: [], rules: [] };

// ==========================================
// 🚀 초기화 및 이벤트 연결
// ==========================================
const form = document.getElementById('penalty-form');
if (form) form.addEventListener('submit', handleAddPenalty);

const auth = getAuth();
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        try {
            const userDoc = await getDoc(doc(db, `users/${currentUid}`));
            if (userDoc.exists() && userDoc.data().isAdmin === true) {
                isCurrentUserAdmin = true;
            } else {
                isCurrentUserAdmin = false;
            }
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
    }
});

// ==========================================
// 👤 [개인] 상벌점 데이터 추가 및 로드 (기존 동일)
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
            const scoreText = data.score > 0 ? `+${data.score}` : `${data.score}`;

            item.innerHTML = `
                <div class="penalty-info">
                    <span class="penalty-reason">${data.reason}</span>
                    <span class="penalty-date">${dateStr}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="penalty-points" style="color: ${scoreColor};">${scoreText}점</span>
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
        renderNotices(currentGlobals.notices);
        renderRules(currentGlobals.rules);
    });
}

// 📌 공지사항 렌더링 (아코디언, TeX, 첨부파일)
function renderNotices(notices) {
    const titleEl = document.getElementById('latest-notice-title');
    const listEl = document.getElementById('notice-list-container');
    if (!titleEl || !listEl) return;

    // 최상단 요약 텍스트 처리 (구버전 문자열과 신버전 객체 호환)
    const latestNotice = notices.length > 0 ? notices[notices.length - 1] : null;
    let topTitle = "등록된 공지사항이 없습니다.";
    if (latestNotice) {
        topTitle = typeof latestNotice === 'string' ? latestNotice : latestNotice.title;
    }
    titleEl.innerText = topTitle;

    let html = '';
    if (notices.length === 0) {
        html += '<p style="padding: 15px; color: #666;">현재 등록된 공지가 없습니다.</p>';
    } else {
        notices.slice().reverse().forEach((n, reversedIndex) => {
            const originalIndex = notices.length - 1 - reversedIndex;
            // 구버전 호환용 변환
            const noticeObj = typeof n === 'string' ? { title: n, body: '', fileUrl: null, fileName: null } : n;
            
            html += `
                <div class="notice-accordion-item" style="border-bottom: 1px solid #eee; display:flex; flex-direction:column;">
                    <div class="notice-title-bar" data-target="notice-body-${originalIndex}" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 15px; cursor: pointer; transition: background 0.2s;">
                        <span style="font-size: 14px; font-weight: bold; color: #333; flex:1;">📢 ${noticeObj.title}</span>
                        ${isCurrentUserAdmin ? `
                            <div style="display:flex; gap:8px; flex-shrink:0;">
                                <button class="btn-delete-global" data-type="notices" data-index="${originalIndex}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="삭제">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                    <div id="notice-body-${originalIndex}" style="display:none; padding: 15px; background: #fafafa; border-top: 1px dashed #ddd; font-size: 13px; color: #555; line-height: 1.6;">
                        <div class="tex-content" style="white-space: pre-wrap;">${noticeObj.body || '본문 내용이 없습니다.'}</div>
                        ${noticeObj.fileUrl ? `
                            <div style="margin-top:10px; padding: 10px; background:#e8f0fe; border-radius:5px; display:inline-block;">
                                📎 <a href="${noticeObj.fileUrl}" target="_blank" style="color:#1a73e8; text-decoration:none; font-weight:bold;">${noticeObj.fileName || '첨부파일 다운로드'}</a>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    }

    // 관리자용 공지사항 추가 폼
    if (isCurrentUserAdmin) {
        html += `
            <div style="padding: 15px; margin: 10px 15px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;">
                <input type="text" id="new-notice-title" placeholder="새 공지사항 제목" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                <textarea id="new-notice-body" placeholder="본문 내용 (TeX 수식 지원: $$수식$$ 또는 $수식$)" rows="3" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; resize:vertical;"></textarea>
                <div style="display:flex; gap: 10px; align-items:center;">
                    <input type="file" id="new-notice-file" style="font-size: 12px; flex:1;">
                    <button id="btn-add-notice-complex" class="cl-btn-primary" style="padding: 8px 16px; flex-shrink:0;">공지 등록</button>
                </div>
            </div>
        `;
    }
    
    listEl.innerHTML = html;

    // 💡 TeX 수식 렌더링 (KaTeX)
    if (window.renderMathInElement) {
        renderMathInElement(listEl, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ]
        });
    }
}

function renderRules(rules) {
    const listEl = document.getElementById('discipline-list-container');
    if (!listEl) return;
    let html = '';
    if (rules.length === 0) {
        html += '<p style="padding: 15px; color:#c5221f;">등록된 징계 기준이 없습니다.</p>';
    } else {
        html += `<ul class="rule-list" style="margin: 0; padding: 15px; padding-left: 30px; list-style: none;">`;
        rules.forEach((r, idx) => {
            html += `
                <li style="margin-bottom: 8px; display:flex; justify-content:space-between; align-items:flex-start; gap: 10px;">
                    <span style="flex:1; line-height: 1.4; color: #c5221f;">• ${r}</span>
                    ${isCurrentUserAdmin ? `
                        <div style="display:flex; gap:8px; flex-shrink:0;">
                            <button class="btn-delete-global" data-type="rules" data-index="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="삭제">🗑️</button>
                        </div>
                    ` : ''}
                </li>
            `;
        });
        html += `</ul>`;
    }

    if (isCurrentUserAdmin) {
        html += `
            <div style="padding: 12px; margin: 10px 15px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 6px; display: flex; gap: 8px;">
                <input type="text" id="new-rule-input" placeholder="새 징계 기준 입력 (예: -5점: 경고)" style="flex:1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                <button class="btn-add-global cl-btn-primary" data-type="rules" style="padding: 8px 16px; flex-shrink:0;">추가</button>
            </div>
        `;
    }
    listEl.innerHTML = html;
}


// ==========================================
// 🖱️ 이벤트 리스너 (아코디언 토글 & 관리자 CRUD)
// ==========================================
document.addEventListener('click', async (e) => {
    // 📌 아코디언 토글 (공지사항 제목 클릭 시)
    const titleBar = e.target.closest('.notice-title-bar');
    if (titleBar && !e.target.closest('button')) {
        const targetId = titleBar.getAttribute('data-target');
        const bodyEl = document.getElementById(targetId);
        if (bodyEl) {
            bodyEl.style.display = bodyEl.style.display === 'none' ? 'block' : 'none';
        }
        return;
    }

    if (!isCurrentUserAdmin) return;
    const settingsRef = doc(db, 'system', 'globals');
    const target = e.target.closest('button');
    if (!target) return;

    // 📌 새 공지사항 추가 (복합 폼 - 파일 업로드 포함)
    if (target.id === 'btn-add-notice-complex') {
        const titleEl = document.getElementById('new-notice-title');
        const bodyEl = document.getElementById('new-notice-body');
        const fileEl = document.getElementById('new-notice-file');
        
        const title = titleEl.value.trim();
        const body = bodyEl.value.trim();
        const file = fileEl.files[0];

        if (!title) return alert("공지사항 제목을 입력해주세요.");
        
        target.innerText = "업로드 중...";
        target.disabled = true;

        let fileUrl = null;
        let fileName = null;

        try {
            if (file) {
                // 파일이 있으면 Storage에 업로드
                const fileRef = storageRef(storage, `notices/${Date.now()}_${file.name}`);
                await uploadBytes(fileRef, file);
                fileUrl = await getDownloadURL(fileRef);
                fileName = file.name;
            }

            const newNoticeObj = {
                title: title,
                body: body,
                fileUrl: fileUrl,
                fileName: fileName,
                createdAt: new Date().toISOString()
            };

            currentGlobals.notices.push(newNoticeObj);
            await updateDoc(settingsRef, { notices: currentGlobals.notices });
            
        } catch (err) {
            console.error("공지사항 등록 실패:", err);
            alert("업로드 중 오류가 발생했습니다.");
        } finally {
            target.innerText = "공지 등록";
            target.disabled = false;
        }
    }

    // 📌 일반 항목 추가 (징계 기준)
    if (target.classList.contains('btn-add-global')) {
        const type = target.dataset.type; 
        const inputEl = document.getElementById(`new-rule-input`);
        if(!inputEl) return;
        const text = inputEl.value.trim();
        if (text) {
            currentGlobals.rules.push(text);
            await updateDoc(settingsRef, { rules: currentGlobals.rules });
        }
    }
    
    // 📌 항목 삭제 (공통)
    if (target.classList.contains('btn-delete-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        if (confirm("이 항목을 정말로 삭제하시겠습니까?")) {
            currentGlobals[type].splice(idx, 1); 
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
        }
    }
});
