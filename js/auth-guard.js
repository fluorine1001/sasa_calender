// js/auth-guard.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// 로그인 상태 감지
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // [로그인 O] DB에서 닉네임 등 사용자 정보를 가져와서 로컬에 임시 저장 (탭에서 활용 목적)
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            // 다른 파일(calendar.js 등)에서 쉽게 쓸 수 있게 localStorage에 정보 저장
            localStorage.setItem('currentUserUid', user.uid);
            localStorage.setItem('currentUserNickname', userData.nickname);
            
            console.log("환영합니다, " + userData.nickname + "님!");
            // (추후 개발) 탭 정보 로딩 함수를 여기서 호출하면 됩니다.
            // initDashboard(user.uid); 
        }
    } else {
        // [로그인 X] 즉시 로그인 페이지로 강제 이동
        alert("로그인이 필요한 서비스입니다.");
        window.location.href = "login.html";
    }
});

// 로그아웃 함수 (설정 탭 등에서 사용)
export const logoutUser = () => {
    auth.signOut().then(() => {
        localStorage.removeItem('currentUserUid');
        localStorage.removeItem('currentUserNickname');
        window.location.href = "login.html";
    });
};
