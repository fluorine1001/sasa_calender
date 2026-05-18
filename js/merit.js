// js/merit.js
import { db } from './firebase-init.js';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
// ▼ Firebase 인증 모듈 추가 ▼
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let unsubscribeSnapshot = null; // 기존 데이터 리스너를 해제하기 위한 변수

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('penalty-form');
    if (form) {
        form.addEventListener('submit', handleAddPenalty);
    }

    // ▼ 변경된 부분: Firebase 로그인 상태가 확인된 '후'에 데이터를 불러옵니다 ▼
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid; // 정확한 유저 고유 ID 획득
            loadPenaltyData();     // 유저 확인 후 내역 불러오기
        } else {
            currentUid = null;
            // 로그아웃 상태면 실시간 리스너 해제 및 화면 초기화
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            document.getElementById('penalty-list').innerHTML = '';
            document.getElementById('total-score').innerText = '0';
        }
    });
});

// 상벌점 데이터 추가 함수
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

    // 벌점이면 음수(-), 상점이면 양수(+)로 저장
    const finalScore = type === 'demerit' ? -value : value;

    try {
        // uid 대신 currentUid 사용
        const meritsRef = collection(db, `users/${currentUid}/merits`);
        await addDoc(meritsRef, {
            score: finalScore,
            type: type, // 'merit' or 'demerit'
            reason: reason,
            createdAt: serverTimestamp()
        });

        // 폼 초기화
        document.getElementById('penalty-form').reset();
    } catch (error) {
        console.error("데이터 추가 실패:", error);
        alert("기록을 추가하는 중 오류가 발생했습니다.");
    }
}

// 상벌점 데이터 불러오기 및 렌더링
function loadPenaltyData() {
    // 기존에 켜져 있던 리스너가 있다면 끄기 (중복 방지)
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    const meritsRef = collection(db, `users/${currentUid}/merits`);
    const q = query(meritsRef, orderBy("createdAt", "desc"));

    // onSnapshot의 반환값을 unsubscribeSnapshot에 저장해둠
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const listContainer = document.getElementById('penalty-list');
        const scoreDisplay = document.getElementById('total-score');
        const scoreStatusText = document.getElementById('score-status-text');
        
        listContainer.innerHTML = ''; // 목록 초기화
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
            totalScore += data.score; // 합계 계산

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

        // UI에 합계 점수 업데이트
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

        // 삭제 버튼 이벤트 연결
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
