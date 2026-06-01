// js/sasadomi.js
import { db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;

function initSasadomi() {
    console.log("[Sasadomi] 모듈 초기화 시작...");

    // 1. 현재 로그인한 유저 확인 (Firebase Auth)
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            console.log("[Sasadomi] 유저 인식 완료:", currentUid);
            // TODO: 나중에 여기에 연동 상태를 체크해서 배지(연동/미연동)를 바꿔주는 함수 추가
        } else {
            currentUid = null;
        }
    });

    // 2. 모달 및 버튼 DOM 요소 가져오기
    const openBtn = document.getElementById('btn-open-sasa-modal');
    const modal = document.getElementById('sasa-auth-modal');
    const closeBtn = document.getElementById('btn-close-sasa-modal');
    const cancelBtn = document.getElementById('btn-cancel-sasa-auth');
    const form = document.getElementById('sasa-credential-form');

    // 3. 모달 열기 기능
    if (openBtn && modal) {
        openBtn.addEventListener('click', () => {
            modal.style.display = 'flex'; // 화면에 표시
        });
    }

    // 4. 모달 닫기 기능 (닫을 때 입력했던 비밀번호도 안전하게 초기화)
    const closeModal = () => {
        if (modal) modal.style.display = 'none';
        if (form) form.reset(); 
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // 5. 폼 제출 (계정 연동하기) 로직
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // 페이지 새로고침 방지

            if (!currentUid) return alert("로그인이 필요합니다. 먼저 로그인해주세요.");

            const sasaId = document.getElementById('sasa-input-id').value.trim();
            const sasaPw = document.getElementById('sasa-input-pw').value;

            if (!sasaId || !sasaPw) return alert("아이디와 비밀번호를 모두 입력해주세요.");

            try {
                // 🔒 보안 처리: 비밀번호는 저장하지 않고 가짜 토큰을 생성해 유저 문서에 저장
                const mockSessionToken = "SASA_SESSION_TOKEN_" + btoa(sasaId + ":" + Date.now()); 

                const userConfigRef = doc(db, "users", currentUid);
                
                // { merge: true }를 사용하여 기존 유저 설정(알림 등)을 덮어쓰지 않고 보존!
                await setDoc(userConfigRef, {
                    isSasaLinked: true,
                    sasaStudentId: sasaId,
                    sasaToken: mockSessionToken,
                    sasaLinkedAt: serverTimestamp()
                }, { merge: true });
                
                alert("사사도미 계정이 성공적으로 연동되었습니다!");
                
                // 모달 닫기
                closeModal();
                
                // 연동 성공 시 뱃지 상태 즉시 변경
                const badge = document.getElementById('sasa-link-badge');
                if (badge) {
                    badge.innerText = "연동 완료";
                    badge.className = "status-badge status-linked";
                }
                
                // TODO: 나중에 여기에 사사도미 탭의 잠금을 해제하고 데이터를 불러오는 로직 추가

            } catch (error) {
                console.error("사사도미 연동 실패:", error);
                alert("연동에 실패했습니다. 관리자에게 문의하세요.");
            }
        });
    }
}

// HTML 렌더링이 완료되면 위 기능들을 활성화
document.addEventListener('DOMContentLoaded', initSasadomi);
