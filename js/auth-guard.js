import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// --- [환경 설정] ---
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30분 동안 활동 없으면 로그아웃
let inactivityTimer;

/**
 * 로그아웃 처리 함수
 * @param {boolean} isAutoLogout - 자동 로그아웃 여부
 */
export const logoutUser = (isAutoLogout = false) => {
    auth.signOut().then(() => {
        // 모든 로그인 관련 로컬 데이터 삭제
        localStorage.removeItem('currentUserUid');
        localStorage.removeItem('currentUserNickname');
        localStorage.removeItem('keepLogin'); 
        
        if (isAutoLogout === true) {
            alert("일정 시간 동안 활동이 없어 자동으로 로그아웃 되었습니다.");
        }
        window.location.replace("login.html");
    });
};

/**
 * 타이머 리셋 (사용자가 활동할 때마다 호출됨)
 */
const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logoutUser(true); 
    }, INACTIVITY_LIMIT);
};

/**
 * 사용자 활동 감지 설정
 */
const setupActivityListeners = () => {
    // 로그인 시 '로그인 상태 유지'를 체크했다면 타이머를 작동시키지 않음
    const isKeepLoginChecked = localStorage.getItem('keepLogin');
    if (isKeepLoginChecked === 'true') {
        console.log("로그인 유지 상태: 자동 로그아웃 타이머가 비활성화되었습니다.");
        return; 
    }

    // 마우스 이동, 키보드 입력, 클릭, 스크롤 감지
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    
    resetInactivityTimer(); // 초기 실행
};

// --- [메인 로직: 로그인 상태 감시] ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // 1. 파이어베이스 서버에서 최신 사용자 정보 가져오기
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const nickname = userData.nickname;

                // 2. 브라우저 저장소 업데이트
                localStorage.setItem('currentUserUid', user.uid);
                localStorage.setItem('currentUserNickname', nickname);
                
                // 3. 🔥 핵심: 새로고침 없이 즉시 화면의 닉네임 요소(span) 수정
                const nicknameElement = document.getElementById('display-nickname');
                if (nicknameElement) {
                    nicknameElement.textContent = nickname;
                }
                
                // 4. 모든 로딩이 끝난 후 화면을 투명도 1로 전환 (깜빡임 방지)
                document.body.style.opacity = "1";
                
                // 5. 활동 타이머 설정 시작
                setupActivityListeners();
            } else {
                console.error("사용자 문서를 찾을 수 없습니다.");
                logoutUser();
            }
        } catch (error) {
            console.error("사용자 정보 로드 중 오류:", error);
            logoutUser();
        }
    } else {
        // 로그인 정보가 없으면 로그인 페이지로 강제 이동
        window.location.replace("login.html");
    }
});
