// js/sasadomi.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;

// ⚠️ 백엔드 API 주소 및 발급받은 API Key 설정
const API_BASE_URL = 'https://sasadomi-system.vercel.app'; 
const API_KEY = 'sasa_dev_497a738259f6cd256b737c2a24073dca8b3681c9b2352b2d'; 

function initSasadomi() {
    console.log("[Sasadomi] 모듈 초기화 시작...");

    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            console.log("[Sasadomi] 유저 인식 완료:", currentUid);
            await checkSasaIntegrationStatus(); // 연동 상태 체크
        } else {
            currentUid = null;
        }
    });

    const openBtn = document.getElementById('btn-open-sasa-modal');
    const modal = document.getElementById('sasa-auth-modal');
    const closeBtn = document.getElementById('btn-close-sasa-modal');
    const cancelBtn = document.getElementById('btn-cancel-sasa-auth');
    const form = document.getElementById('sasa-credential-form');

    if (openBtn && modal) openBtn.addEventListener('click', () => modal.style.display = 'flex');

    const closeModal = () => {
        if (modal) modal.style.display = 'none';
        if (form) form.reset(); 
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // ==========================================
    // 🚀 [1] 사사도미 계정 로그인 및 연동 (POST /v1/auth/login)
    // ==========================================
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUid) return alert("로그인이 필요합니다.");

            const sasaId = document.getElementById('sasa-input-id').value.trim(); // ex: s2026010701
            const sasaPw = document.getElementById('sasa-input-pw').value;

            // 학번 규격 프론트엔드 1차 검증 (s + 10자리 숫자)
            if (!/^s\d{10}$/.test(sasaId)) {
                return alert("올바른 학번(11자리, 예: s2026010701)을 입력해주세요.");
            }

            if (!sasaPw) return alert("비밀번호를 입력해주세요.");

            try {
                // Sasadomi API 백엔드로 로그인 요청 전송
                const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': API_KEY
                    },
                    body: JSON.stringify({ studentId: sasaId, studentPw: sasaPw })
                });

                const data = await response.json();

                if (data.success) {
                    // 백엔드에서 발급한 진짜 세션 토큰을 Firestore에 저장
                    const userConfigRef = doc(db, "users", currentUid);
                    await setDoc(userConfigRef, {
                        isSasaLinked: true,
                        sasaStudentId: sasaId,
                        sasaToken: data.sessionToken, // API에서 내려준 UUID 토큰
                        sasaLinkedAt: serverTimestamp()
                    }, { merge: true });
                    
                    alert("사사도미 계정이 성공적으로 연동되었습니다!");
                    closeModal();
                    await checkSasaIntegrationStatus();
                } else {
                    alert(data.message || "연동에 실패했습니다. 아이디와 비밀번호를 확인하세요.");
                }

            } catch (error) {
                console.error("사사도미 API 통신 에러:", error);
                alert("서버 통신 중 오류가 발생했습니다.");
            }
        });
    }
}

// 연동 상태를 확인하고 UI(배지) 업데이트
async function checkSasaIntegrationStatus() {
    if (!currentUid) return;
    
    const userDocRef = doc(db, "users", currentUid);
    const docSnap = await getDoc(userDocRef);
    const badge = document.getElementById('sasa-link-badge');

    if (docSnap.exists() && docSnap.data().isSasaLinked && docSnap.data().sasaToken) {
        if (badge) {
            badge.innerText = "연동 완료";
            badge.className = "status-badge status-linked";
        }
        // TODO: 여기서 /v1/points를 호출해서 상벌점 데이터를 가져오는 함수 실행
    } else {
        if (badge) {
            badge.innerText = "미연동";
            badge.className = "status-badge status-unlinked";
        }
    }
}

document.addEventListener('DOMContentLoaded', initSasadomi);
