// js/merit.js
import { db } from './firebase-init.js';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const uid = localStorage.getItem('currentUserUid');

document.addEventListener('DOMContentLoaded', () => {
    if (!uid) return;

    const form = document.getElementById('penalty-form');
    if (form) {
        form.addEventListener('submit', handleAddPenalty);
    }

    // 데이터베이스에서 내역을 실시간으로 불러오기
    loadPenaltyData();
});

// 상벌점 데이터 추가 함수
async function handleAddPenalty(e) {
    e.preventDefault();

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
        // 컬렉션 이름을 merits로 관리
        const meritsRef = collection(db, `users/${uid}/merits`);
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
    const meritsRef = collection(db, `users/${uid}/merits`);
    // 최신순으로 정렬해서 쿼리
    const q = query(meritsRef, orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
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
            
            // 날짜 포맷팅
            const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString('ko-KR') : '방금 전';
            
            // 상점(+)은 초록색, 벌점(-)은 빨간색
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
                    // 삭제 대상 ID 획득 시 버튼이나 버튼 안의 아이콘이 클릭되었을 때를 대비
                    const targetBtn = e.target.closest('.btn-delete');
                    const docId = targetBtn.getAttribute('data-id');
                    await deleteDoc(doc(db, `users/${uid}/merits/${docId}`));
                }
            });
        });
    });
}
