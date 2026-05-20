import { db } from './firebase-init.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, 
    getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let unsubscribeSnapshot = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 점수 추가 폼 이벤트 연결
    const form = document.getElementById('penalty-form');
    if (form) {
        form.addEventListener('submit', handleAddPenalty);
    }

    // 2. Firebase 로그인 상태 확인 후 데이터 로드
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            loadPenaltyData();      // 유저 개인의 상벌점 내역 불러오기
            loadGlobalSettings();   // 전역 공지사항 및 징계 기준 불러오기
        } else {
            currentUid = null;
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            document.getElementById('penalty-list').innerHTML = '';
            document.getElementById('total-score').innerText = '0';
        }
    });

    // 3. 관리자 전용 패널 버튼 동작 연결
    const adminBtn = document.getElementById('btn-open-admin');
    if (adminBtn) {
        adminBtn.addEventListener('click', handleAdminAction);
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
                    <button class="btn-delete" data-id="${docSnap.id}" title="삭제">🗑️</button>
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

// 1. 전역 설정(공지/규칙) 실시간 불러오기
function loadGlobalSettings() {
    const settingsRef = doc(db, 'system', 'globals');

    onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            renderNotices(data.notices || []);
            renderRules(data.rules || []);
        } else {
            // 문서가 아예 없을 경우 빈 데이터로 초기화
            setDoc(settingsRef, { notices: [], rules: [] });
        }
    });
}

// 공지사항 렌더링 함수
function renderNotices(notices) {
    const titleEl = document.getElementById('latest-notice-title');
    const listEl = document.getElementById('notice-list-container');

    if (!titleEl || !listEl) return;

    if (notices.length === 0) {
        titleEl.innerText = "등록된 공지사항이 없습니다.";
        listEl.innerHTML = '<p style="padding: 15px; color: #666;">현재 등록된 공지가 없습니다.</p>';
        return;
    }

    // 최신 공지(배열의 마지막)를 요약 영역에 표시
    titleEl.innerText = notices[notices.length - 1];

    // 전체 공지 리스트 렌더링 (최신순으로 뒤집어서 표시)
    listEl.innerHTML = [...notices].reverse().map(n => 
        `<div style="padding: 12px 15px; border-bottom: 1px solid #eee; font-size: 14px; color: #333;">• ${n}</div>`
    ).join('');
}

// 징계 기준 렌더링 함수
function renderRules(rules) {
    const listEl = document.getElementById('discipline-list-container');
    if (!listEl) return;

    if (rules.length === 0) {
        listEl.innerHTML = '<p style="padding: 10px; color:#c5221f;">등록된 징계 기준이 없습니다.</p>';
        return;
    }

    listEl.innerHTML = `<ul class="rule-list" style="margin: 0; padding-left: 20px;">` +
        rules.map(r => `<li style="margin-bottom: 8px;">${r}</li>`).join('') +
        `</ul>`;
}

// 2. 관리자 설정 버튼 클릭 시 동작 (Prompt 활용)
async function handleAdminAction() {
    const action = prompt(
        "🛠️ 관리자 메뉴입니다. 원하시는 작업의 번호를 입력하세요.\n\n" +
        "1: 새 공지사항 추가\n" +
        "2: 새 징계 기준 추가\n" +
        "3: 전체 데이터 초기화 (주의!)"
    );

    if (!action) return;

    const settingsRef = doc(db, 'system', 'globals');
    const docSnap = await getDoc(settingsRef);
    let currentData = docSnap.exists() ? docSnap.data() : { notices: [], rules: [] };

    try {
        if (action === '1') {
            const newNotice = prompt("📢 새로운 공지사항 내용을 입력하세요:");
            if (newNotice) {
                currentData.notices.push(newNotice);
                await updateDoc(settingsRef, { notices: currentData.notices });
                alert("✅ 공지사항이 성공적으로 추가되었습니다.");
            }
        } else if (action === '2') {
            const newRule = prompt("⚠️ 새로운 징계 기준을 입력하세요:\n(예: '-5점: 사감 선생님 면담')");
            if (newRule) {
                currentData.rules.push(newRule);
                await updateDoc(settingsRef, { rules: currentData.rules });
                alert("✅ 징계 기준이 성공적으로 추가되었습니다.");
            }
        } else if (action === '3') {
            if (confirm("🚨 정말로 모든 공지사항과 징계 기준을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
                await updateDoc(settingsRef, { notices: [], rules: [] });
                alert("🗑️ 모든 데이터가 초기화되었습니다.");
            }
        } else {
            alert("❌ 잘못된 입력입니다. 1, 2, 3 중 하나를 입력해주세요.");
        }
    } catch (error) {
        console.error("관리자 업데이트 실패:", error);
        alert("업데이트 중 오류가 발생했습니다. (데이터베이스 권한 문제일 수 있습니다.)");
    }
}
