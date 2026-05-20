import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    onAuthStateChanged,
    getAuth
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// ==========================================
// ⏰ [세션 관리] 자동 로그아웃 및 세션 타이머 로직 (오류 해결 핵심)
// ==========================================
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

    localStorage.setItem('lastActive', Date.now());

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logoutUser(true); 
    }, INACTIVITY_LIMIT);
};

const setupActivityListeners = () => {
    const isKeepLoginChecked = localStorage.getItem('keepLogin');
    if (isKeepLoginChecked === 'true') return; 

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

// ==========================================
// 🔑 [인증 감지] 페이지별 접근 권한 및 화면 표시 제어
// ==========================================
onAuthStateChanged(auth, async (user) => {
    // 현재 페이지가 로그인이나 회원가입 페이지인지 확인
    const isAuthPage = window.location.pathname.includes("login.html") || window.location.pathname.includes("signup.html");

    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            localStorage.setItem('currentUserUid', user.uid);
            localStorage.setItem('currentUserNickname', userData.nickname);
            
            // UI 반영 요소가 존재하는 페이지에서만 실행 (에러 방지)
            const nicknameElement = document.getElementById('display-nickname');
            if (nicknameElement) nicknameElement.textContent = userData.nickname;
            
            if (userData.isAdmin) {
                const adminPanel = document.getElementById('admin-panel');
                if (adminPanel) adminPanel.style.display = 'block';
            }
            
            // 로그인 상태인데 로그인/회원가입 페이지에 머물러 있다면 메인으로 이동
            if (isAuthPage) {
                window.location.replace("index.html");
                return;
            }

            // 데이터 준비 완료 시 투명도를 복구하여 흰 화면 현상 해결
            document.body.style.opacity = "1";
            setupActivityListeners();
        }
    } else {
        // 로그아웃 상태인데 메인 페이지 등 보호된 페이지에 있다면 로그인으로 튕겨내기
        if (!isAuthPage) {
            window.location.replace("login.html");
        } else {
            // 로그인/회원가입 페이지라면 정상적으로 화면 보여주기
            document.body.style.opacity = "1";
        }
    }
});

// ==========================================
// 📜 [이용약관] DB에서 이용약관 데이터 원격 로드
// ==========================================
const tosContent = document.getElementById('tos-content');
if (tosContent) {
    const loadTermsOfService = async () => {
        try {
            const globalSettingsRef = doc(db, 'system', 'globals');
            const docSnap = await getDoc(globalSettingsRef);

            if (docSnap.exists() && docSnap.data().tos) {
                tosContent.innerHTML = docSnap.data().tos;
            } else {
                tosContent.innerHTML = "제 1 조 (목적)<br>본 약관은 SASA 캘린더 서비스 이용 규정을 정의합니다.<br><br>(※ Firebase console의 system/globals 문서에 'tos' 필드를 추가하여 실시간으로 약관을 수정할 수 있습니다.)";
            }
        } catch (error) {
            console.error("약관을 불러오지 못했습니다:", error);
            tosContent.innerText = "이용약관을 불러오는 중 오류가 발생했습니다. 페이지를 새로고침 해주세요.";
        }
    };
    loadTermsOfService();
}

// ==========================================
// [1. 회원가입 로직]
// ==========================================
const signupBtn = document.getElementById('signup-btn');
const checkNicknameBtn = document.getElementById('check-nickname-btn');
const signupNicknameInput = document.getElementById('signup-nickname');

let isNicknameVerified = false; 

if (signupNicknameInput) {
    signupNicknameInput.addEventListener('input', () => {
        isNicknameVerified = false;
    });
}

if (checkNicknameBtn) {
    checkNicknameBtn.addEventListener('click', async () => {
        const nickname = signupNicknameInput.value.trim();
        if (!nickname) return alert("닉네임을 먼저 입력해주세요.");

        try {
            const q = query(collection(db, "users"), where("nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                alert("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
                isNicknameVerified = false;
            } else {
                alert("사용 가능한 닉네임입니다!");
                isNicknameVerified = true;
            }
        } catch (error) {
            alert("중복 확인 중 오류가 발생했습니다: " + error.message);
        }
    });
}

const tosToggleBtn = document.getElementById('tos-toggle-btn');
const tosArrow = document.getElementById('tos-arrow');

if (tosToggleBtn && tosContent && tosArrow) {
    tosToggleBtn.addEventListener('click', () => {
        if (tosContent.style.display === 'none') {
            tosContent.style.display = 'block';
            tosArrow.style.transform = 'rotate(180deg)'; 
        } else {
            tosContent.style.display = 'none';
            tosArrow.style.transform = 'rotate(0deg)'; 
        }
    });
}

if (signupBtn) {
    signupBtn.addEventListener('click', async () => {
        const email = document.getElementById('signup-email').value.trim();
        const nickname = signupNicknameInput.value.trim();
        const pw = document.getElementById('signup-pw').value;
        const pwConfirm = document.getElementById('signup-pw-confirm').value;
        const agreeTos = document.getElementById('agree-tos'); 

        if (!email || !nickname || !pw || !pwConfirm) return alert("모든 칸을 채워주세요.");
        if (pw !== pwConfirm) return alert("비밀번호가 서로 다릅니다.");
        
        if (!isNicknameVerified) return alert("닉네임 중복 확인을 먼저 완료해주세요.");
        if (!agreeTos.checked) return alert("이용약관에 동의하셔야 회원가입이 가능합니다.");

        try {
            const q = query(collection(db, "users"), where("nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) return alert("이미 사용 중인 닉네임입니다. 다시 중복 확인을 해주세요.");

            const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                email, nickname, createdAt: new Date()
            });

            alert("회원가입 완료! 로그인 해주세요.");
            window.location.href = "login.html";
        } catch (error) {
            alert("회원가입 실패: " + error.message);
        }
    });
}

// ==========================================
// [2. 로그인 로직]
// ==========================================
const loginBtn = document.getElementById('login-btn');
if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const inputId = document.getElementById('login-id').value; 
        const pw = document.getElementById('login-pw').value;
        const keepLogin = document.getElementById('keep-login').checked;
        
        if(!inputId || !pw) return alert("아이디와 비밀번호를 입력해주세요.");

        try {
            await setPersistence(auth, browserLocalPersistence);

            localStorage.setItem('keepLogin', keepLogin);
            if (!keepLogin) {
                localStorage.setItem('lastActive', Date.now());
            }

            let loginEmail = inputId;
            if (!inputId.includes('@')) {
                const q = query(collection(db, "users"), where("nickname", "==", inputId));
                const querySnapshot = await getDocs(q);
                if (querySnapshot.empty) return alert("존재하지 않는 닉네임입니다.");
                loginEmail = querySnapshot.docs[0].data().email;
            }

            await signInWithEmailAndPassword(auth, loginEmail, pw);
            window.location.replace("index.html"); 
        } catch (error) {
            alert("로그인 실패: 아이디 또는 비밀번호를 확인하세요.");
        }
    });
}

// ==========================================
// [3. 비밀번호 재설정 로직]
// ==========================================
const resetBtn = document.getElementById('reset-pw-btn');
if(resetBtn) {
    resetBtn.addEventListener('click', () => {
        const inputId = document.getElementById('login-id').value;
        if(!inputId.includes('@')) return alert("이메일을 입력해주세요.");
        sendPasswordResetEmail(auth, inputId).then(() => alert("이메일을 확인하세요."));
    });
}
