import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30분
let inactivityTimer;

export const logoutUser = (isAutoLogout = false) => {
    auth.signOut().then(() => {
        localStorage.removeItem('currentUserUid');
        localStorage.removeItem('currentUserNickname');
        localStorage.removeItem('keepLogin'); 
        localStorage.removeItem('lastActive');
        
        if (isAutoLogout === true) {
            alert("일정 시간 동안 활동이 없어 자동으로 로그아웃 되었습니다.");
        }
        window.location.replace("login.html");
    });
};

const resetInactivityTimer = () => {
    const isKeepLoginChecked = localStorage.getItem('keepLogin');
    if (isKeepLoginChecked === 'true') return;

    // 활동 시간을 로컬스토리지에 실시간 기록 (탭 닫아도 유지됨)
    localStorage.setItem('lastActive', Date.now());

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logoutUser(true); 
    }, INACTIVITY_LIMIT);
};

const setupActivityListeners = () => {
    const isKeepLoginChecked = localStorage.getItem('keepLogin');
    if (isKeepLoginChecked === 'true') return; 

    // 🔥 탭을 새로 열었을 때 시간이 초과되었는지 즉시 검사
    const lastActive = localStorage.getItem('lastActive');
    if (lastActive) {
        const passedTime = Date.now() - parseInt(lastActive);
        if (passedTime > INACTIVITY_LIMIT) {
            logoutUser(true);
            return;
        }
    }

    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    
    resetInactivityTimer();
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            localStorage.setItem('currentUserUid', user.uid);
            localStorage.setItem('currentUserNickname', userData.nickname);
            
            // 닉네임 즉시 반영
            const nicknameElement = document.getElementById('display-nickname');
            if (nicknameElement) nicknameElement.textContent = userData.nickname;
            
            // 데이터 준비 완료 시 화면 표시
            document.body.style.opacity = "1";
            setupActivityListeners();
        }
    } else {
        window.location.replace("login.html");
    }
});
