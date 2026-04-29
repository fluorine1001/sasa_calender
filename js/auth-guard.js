import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// 로그인 상태 감지
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            localStorage.setItem('currentUserUid', user.uid);
            localStorage.setItem('currentUserNickname', userData.nickname);
            
            // 검사가 끝나면 투명하게 숨겨뒀던 화면을 보여줌
            document.body.style.opacity = "1";
        }
    } else {
        // 비로그인 시 즉시 로그인 페이지로 강제 이동 (뒤로가기 루프 방지)
        window.location.replace("login.html");
    }
});

// 로그아웃 함수 내보내기
export const logoutUser = () => {
    auth.signOut().then(() => {
        localStorage.removeItem('currentUserUid');
        localStorage.removeItem('currentUserNickname');
        window.location.replace("login.html");
    });
};
