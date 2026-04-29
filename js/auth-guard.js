import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30분 (밀리초 단위)
let inactivityTimer;

// [로그아웃 함수]
export const logoutUser = (isAutoLogout = false) => {
    auth.signOut().then(() => {
        // 로그아웃 시 저장했던 임시 데이터 싹 비우기
        localStorage.removeItem('currentUserUid');
        localStorage.removeItem('currentUserNickname');
        localStorage.removeItem('keepLogin'); 
        
        if (isAutoLogout === true) {
            alert("일정 시간 동안 활동이 없어 자동으로 로그아웃 되었습니다.");
        }
        window.location.replace("login.html");
    });
};

// [타이머 초기화 함수]
const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logoutUser(true); // 시간이 다 되면 자동 로그아웃
    }, INACTIVITY_LIMIT);
};

// [활동 감지 함수]
const setupActivityListeners = () => {
    const isKeepLoginChecked = localStorage.getItem('keepLogin');

    // 👇 핵심 로직: '로그인 상태 유지'를 체크했다면 타이머를 켜지 않고 함수 종료
    if (isKeepLoginChecked === 'true') {
        return; 
    }

    // 체크 안 한 사람만 마우스/키보드 감지 시작
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    
    resetInactivityTimer(); // 최초 1회 실행
};

// [로그인 상태 감시 및 화면 표시]
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            localStorage.setItem('currentUserUid', user.uid);
            localStorage.setItem('currentUserNickname', userData.nickname);
            
            document.body.style.opacity = "1";
            
            // 로그인 데이터 확인 후 타이머 감지 시작
            setupActivityListeners();
        }
    } else {
        window.location.replace("login.html");
    }
});
