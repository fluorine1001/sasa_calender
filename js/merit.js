import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let isCurrentUserAdmin = false; // 현재 로그인한 사용자의 관리자 여부
let unsubscribeSnapshot = null;
let currentGlobals = { notices: [], rules: [] }; // 전역 데이터 저장용

// ==========================================
// 🚀 초기화 및 이벤트 연결
// ==========================================

const form = document.getElementById('penalty-form');
if (form) {
    form.addEventListener('submit', handleAddPenalty);
}

// Firebase 로그인 상태 확인 후 데이터 로드
const auth = getAuth();
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        
        // 1. 현재 사용자가 관리자인지 Firestore에서 확인
        const userDoc = await getDoc(doc(db, `users/${currentUid}`));
        if (userDoc.exists() && userDoc.data().isAdmin === true) {
            isCurrentUserAdmin = true;
        } else {
            isCurrentUserAdmin = false;
        }

        // 2. 데이터 불러오기
        loadPenaltyData();      
        loadGlobalSettings();   
    } else {
        currentUid = null;
        isCurrentUserAdmin = false;
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        const penaltyList = document.getElementById('penalty-list');
        const totalScore = document.getElementById('total-score');
        if(penaltyList) penaltyList.innerHTML = '';
        if(totalScore) totalScore.innerText = '0';
    }
});


// ==========================================
// 👤 [개인] 상벌점 데이터 추가 및 로드 로직
// ==========================================

async function handleAddPenalty(e) {
    e.preventDefault();

    if (!currentUid) {
        alert("로그인 정보가 확인되지 않았습니다. 다시 로그인해주세요.");
        return;
    }

    const type = document.getElementById('point-type').value;
    const value = parseInt(document.getElementById('point-value').value, 10);
    const reason = document.getElementById('point-reason').value || "사유 없음";

    if (isNaN(value) || value <= 0) {
        alert("올바른 점수를 입력해주세요.");
        return;
    }

    const finalScore = type === 'demerit' ? -value : value;

    try {
        const meritsRef = collection(db, `users/${currentUid}/merits`);
        await addDoc(meritsRef, {
            score: finalScore,
            type: type, 
            reason: reason,
            createdAt: serverTimestamp()
        });

        document.getElementById('penalty-form').reset();
    } catch (error) {
        console.error("데이터 추가 실패:", error);
        alert("기록을 추가하는 중 오류가 발생했습니다.");
    }
}

function loadPenaltyData() {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    const meritsRef = collection(db, `users/${currentUid}/merits`);
    const q = query(meritsRef, orderBy("createdAt", "desc"));

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const listContainer = document.getElementById('penalty-list');
        const scoreDisplay = document.getElementById('total-score');
        const scoreStatusText = document.getElementById('score-status-text');
        
        if(!listContainer || !scoreDisplay || !scoreStatusText) return;

        listContainer.innerHTML = ''; 
        let totalScore = 0;

        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="padding:15px; color:#888; text-align:center;">기록된 내역이 없습니다.</p>';
            scoreDisplay.innerText = "0";
            scoreDisplay.className = "total-score-display";
            scoreStatusText.innerText = "기록이 없습니다.";
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
            scoreDisplay.className = "total-score-display score-positive";
            scoreStatusText.innerText = "현재 상점이 더 많습니다! 훌륭합니다.";
        } else if (totalScore < 0) {
            scoreDisplay.className = "total-score-display score-negative";
            scoreStatusText.innerText = "주의! 벌점이 누적되고 있습니다.";
        } else {
            scoreDisplay.className = "total-score-display";
            scoreStatusText.innerText = "상점과 벌점이 균형을 이루고 있습니다.";
        }

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm("이 기록을 삭제하시겠습니까?")) {
                    const targetBtn = e.target.closest('.btn-delete');
                    const docId = targetBtn.getAttribute('data-id');
                    await deleteDoc(doc(db, `users/${currentUid}/merits/${docId}`));
                }
            });
        });
    });
}


// ==========================================
// 🛠️ [전역/관리자] 공지사항 및 징계기준 관리 로직
// ==========================================

function loadGlobalSettings() {
    const settingsRef = doc(db, 'system', 'globals');

    onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            currentGlobals = docSnap.data();
            // 데이터가 비어있을 경우 대비
            if (!currentGlobals.notices) currentGlobals.notices = [];
            if (!currentGlobals.rules) currentGlobals.rules = [];

            renderNotices(currentGlobals.notices);
            renderRules(currentGlobals.rules);
        } else {
            setDoc(settingsRef, { notices: [], rules: [] });
        }
    });
}

// 📌 공지사항 렌더링
function renderNotices(notices) {
    const titleEl = document.getElementById('latest-notice-title');
    const listEl = document.getElementById('notice-list-container');
    if (!titleEl || !listEl) return;

    // 요약 타이틀 세팅 (최신 공지)
    titleEl.innerText = notices.length > 0 ? notices[notices.length - 1] : "등록된 공지사항이 없습니다.";

    let html = '';
    
    if (notices.length === 0) {
        html += '<p style="padding: 15px; color: #666;">현재 등록된 공지가 없습니다.</p>';
    } else {
        // 최신순 렌더링 (역순 순회하되 원본 index 유지)
        notices.slice().reverse().forEach((n, reversedIndex) => {
            const originalIndex = notices.length - 1 - reversedIndex;
            html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; padding: 12px 15px; border-bottom: 1px solid #eee; gap: 10px;">
                    <span style="font-size: 14px; color: #333; flex:1; line-height:1.4;">• ${n}</span>
                    ${isCurrentUserAdmin ? `
                        <div style="display:flex; gap:8px; flex-shrink:0;">
                            <button class="btn-edit-global" data-type="notices" data-index="${originalIndex}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="수정">✏️</button>
                            <button class="btn-delete-global" data-type="notices" data-index="${originalIndex}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="삭제">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    // 관리자인 경우 하단에 항목 추가 폼 노출
    if (isCurrentUserAdmin) {
        html += getAddFormHtml('notice');
    }
    
    listEl.innerHTML = html;
}

// 📌 징계 기준 렌더링
function renderRules(rules) {
    const listEl = document.getElementById('discipline-list-container');
    if (!listEl) return;

    let html = '';
    
    if (rules.length === 0) {
        html += '<p style="padding: 10px; color:#c5221f;">등록된 징계 기준이 없습니다.</p>';
    } else {
        html += `<ul class="rule-list" style="margin: 0; padding-left: 0; list-style: none;">`;
        rules.forEach((r, idx) => {
            html += `
                <li style="margin-bottom: 8px; display:flex; justify-content:space-between; align-items:flex-start; gap: 10px;">
                    <span style="flex:1; line-height: 1.4;">• ${r}</span>
                    ${isCurrentUserAdmin ? `
                        <div style="display:flex; gap:8px; flex-shrink:0;">
                            <button class="btn-edit-global" data-type="rules" data-index="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="수정">✏️</button>
                            <button class="btn-delete-global" data-type="rules" data-index="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="삭제">🗑️</button>
                        </div>
                    ` : ''}
                </li>
            `;
        });
        html += `</ul>`;
    }

    // 관리자인 경우 하단에 항목 추가 폼 노출
    if (isCurrentUserAdmin) {
        html += getAddFormHtml('rule');
    }
    
    listEl.innerHTML = html;
}

// 항목 추가 UI 생성기 (관리자 전용)
function getAddFormHtml(type) {
    const placeholder = type === 'notice' ? '새 공지사항 내용 입력' : '새 징계 기준 입력 (예: -5점: 경고)';
    return `
        <div style="padding: 12px; margin-top: 10px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 6px; display: flex; gap: 8px;">
            <input type="text" id="new-${type}-input" placeholder="${placeholder}" style="flex:1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
            <button class="btn-add-global cl-btn-primary" data-type="${type}s" style="padding: 8px 16px; flex-shrink:0;">추가</button>
        </div>
    `;
}

// ==========================================
// 🖱️ 관리자 CRUD 이벤트 리스너 (이벤트 위임)
// ==========================================

document.addEventListener('click', async (e) => {
    // 관리자가 아니면 무시
    if (!isCurrentUserAdmin) return;
    
    const target = e.target.closest('button');
    if (!target) return;

    const settingsRef = doc(db, 'system', 'globals');

    // [항목 추가] 동작
    if (target.classList.contains('btn-add-global')) {
        const type = target.dataset.type; // 'notices' 또는 'rules'
        const inputType = type === 'notices' ? 'notice' : 'rule';
        const inputEl = document.getElementById(`new-${inputType}-input`);
        const text = inputEl.value.trim();

        if (text) {
            currentGlobals[type].push(text);
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
            // onSnapshot이 반응하여 즉시 다시 렌더링되므로, 별도의 input.value='' 처리가 필요 없습니다.
        }
    }
    
    // [항목 수정] 동작
    else if (target.classList.contains('btn-edit-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        const oldText = currentGlobals[type][idx];
        
        // 수정 내용은 prompt를 활용 (가장 직관적이고 빠름)
        const newText = prompt("내용을 수정하세요:", oldText);
        
        if (newText && newText.trim() !== '' && newText !== oldText) {
            currentGlobals[type][idx] = newText.trim();
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
        }
    }
    
    // [항목 삭제] 동작
    else if (target.classList.contains('btn-delete-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        
        if (confirm("이 항목을 정말로 삭제하시겠습니까?")) {
            currentGlobals[type].splice(idx, 1); // 배열에서 요소 제거
            await updateDoc(settingsRef, { [type]: currentGlobals[type] });
        }
    }
});
