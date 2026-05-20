import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeSnapshot = null;
let unsubscribeGlobals = null; // 전역 설정용 unsubscribe 추가
let currentGlobals = { notices: [], rules: [] };

// ==========================================
// 🚀 초기화 및 이벤트 연결
// ==========================================

const form = document.getElementById('penalty-form');
if (form) {
    form.addEventListener('submit', handleAddPenalty);
}

const auth = getAuth();
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        
        try {
            const userDoc = await getDoc(doc(db, `users/${currentUid}`));
            if (userDoc.exists() && userDoc.data().isAdmin === true) {
                isCurrentUserAdmin = true;
                console.log("👑 관리자 계정 로그인 확인됨");
            } else {
                isCurrentUserAdmin = false;
                console.log("👤 일반 사용자 계정 로그인됨");
            }
        } catch (error) {
            console.error("❌ 권한 확인 중 오류 발생:", error);
            isCurrentUserAdmin = false;
        }

        // 데이터 불러오기
        loadPenaltyData();      
        await checkAndLoadGlobalSettings(); // 함수명 및 로직 변경
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
        console.error("❌ 내역 추가 실패:", error);
        alert("기록을 추가하는 중 오류가 발생했습니다.");
    }
}

function loadPenaltyData() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();

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
    }, (error) => {
        console.error("❌ 개인 상벌점 내역 수신 오류:", error);
    });
}

// ==========================================
// 🛠️ [전역/관리자] 공지사항 및 징계기준 관리 로직
// ==========================================

async function checkAndLoadGlobalSettings() {
    if (unsubscribeGlobals) unsubscribeGlobals();
    
    const settingsRef = doc(db, 'system', 'globals');

    try {
        // 1. 관리자이고 문서가 아예 없다면 초기 문서 강제 생성
        if (isCurrentUserAdmin) {
            const docSnap = await getDoc(settingsRef);
            if (!docSnap.exists()) {
                console.log("✨ system/globals 문서가 없어 새로 생성합니다.");
                await setDoc(settingsRef, { notices: [], rules: [] });
            }
        }
    } catch (e) {
        console.warn("⚠️ 초기 문서 확인/생성 중 오류 (보안 규칙 확인 필요):", e);
    }

    // 2. 실시간 데이터 리스너 연결
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
    }, (error) => {
        console.error("❌ 전역 설정(system/globals) 수신 실패! 보안 규칙을 확인하세요.:", error);
        // 에러 발생 시 무한 로딩 방지를 위해 빈 배열로 강제 렌더링
        renderNotices([]);
        renderRules([]);
    });
}

function renderNotices(notices) {
    const titleEl = document.getElementById('latest-notice-title');
    const listEl = document.getElementById('notice-list-container');
    if (!titleEl || !listEl) return;

    titleEl.innerText = notices.length > 0 ? notices[notices.length - 1] : "등록된 공지사항이 없습니다.";

    let html = '';
    
    if (notices.length === 0) {
        html += '<p style="padding: 15px; color: #666;">현재 등록된 공지가 없습니다.</p>';
    } else {
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

    if (isCurrentUserAdmin) {
        html += getAddFormHtml('notice');
    }
    
    listEl.innerHTML = html;
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
                            <button class="btn-edit-global" data-type="rules" data-index="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="수정">✏️</button>
                            <button class="btn-delete-global" data-type="rules" data-index="${idx}" style="background:none;border:none;cursor:pointer;font-size:14px;" title="삭제">🗑️</button>
                        </div>
                    ` : ''}
                </li>
            `;
        });
        html += `</ul>`;
    }

    if (isCurrentUserAdmin) {
        html += getAddFormHtml('rule');
    }
    
    listEl.innerHTML = html;
}

function getAddFormHtml(type) {
    const placeholder = type === 'notice' ? '새 공지사항 내용 입력' : '새 징계 기준 입력 (예: -5점: 경고)';
    return `
        <div style="padding: 12px; margin: 10px 15px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 6px; display: flex; gap: 8px;">
            <input type="text" id="new-${type}-input" placeholder="${placeholder}" style="flex:1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
            <button class="btn-add-global cl-btn-primary" data-type="${type}s" style="padding: 8px 16px; flex-shrink:0;">추가</button>
        </div>
    `;
}

// ==========================================
// 🖱️ 관리자 CRUD 이벤트 리스너 (이벤트 위임)
// ==========================================

document.addEventListener('click', async (e) => {
    if (!isCurrentUserAdmin) return;
    
    const target = e.target.closest('button');
    if (!target) return;

    const settingsRef = doc(db, 'system', 'globals');

    // [항목 추가]
    if (target.classList.contains('btn-add-global')) {
        const type = target.dataset.type; 
        const inputType = type === 'notices' ? 'notice' : 'rule';
        const inputEl = document.getElementById(`new-${inputType}-input`);
        if(!inputEl) return;
        const text = inputEl.value.trim();

        if (text) {
            try {
                currentGlobals[type].push(text);
                await updateDoc(settingsRef, { [type]: currentGlobals[type] });
            } catch (err) {
                console.error("❌ 추가 중 데이터베이스 업데이트 실패:", err);
                alert("권한이 없거나 데이터베이스 오류가 발생했습니다.");
            }
        }
    }
    
    // [항목 수정]
    else if (target.classList.contains('btn-edit-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        const oldText = currentGlobals[type][idx];
        
        const newText = prompt("내용을 수정하세요:", oldText);
        
        if (newText && newText.trim() !== '' && newText !== oldText) {
            try {
                currentGlobals[type][idx] = newText.trim();
                await updateDoc(settingsRef, { [type]: currentGlobals[type] });
            } catch (err) {
                console.error("❌ 수정 중 데이터베이스 업데이트 실패:", err);
            }
        }
    }
    
    // [항목 삭제]
    else if (target.classList.contains('btn-delete-global')) {
        const type = target.dataset.type;
        const idx = target.dataset.index;
        
        if (confirm("이 항목을 정말로 삭제하시겠습니까?")) {
            try {
                currentGlobals[type].splice(idx, 1); 
                await updateDoc(settingsRef, { [type]: currentGlobals[type] });
            } catch (err) {
                console.error("❌ 삭제 중 데이터베이스 업데이트 실패:", err);
            }
        }
    }
});
