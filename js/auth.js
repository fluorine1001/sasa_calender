import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// [1. 회원가입 로직]
const signupBtn = document.getElementById('signup-btn');
if(signupBtn) {
    signupBtn.addEventListener('click', async () => {
        const email = document.getElementById('signup-email').value;
        const nickname = document.getElementById('signup-nickname').value;
        const pw = document.getElementById('signup-pw').value;
        const pwConfirm = document.getElementById('signup-pw-confirm').value;

        if(!email || !nickname || !pw || !pwConfirm) return alert("모든 칸을 채워주세요.");
        if(pw !== pwConfirm) return alert("비밀번호가 서로 다릅니다.");

        try {
            const q = query(collection(db, "users"), where("nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) return alert("이미 사용 중인 닉네임입니다.");

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

// [2. 로그인 로직]
const loginBtn = document.getElementById('login-btn');
if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const inputId = document.getElementById('login-id').value; 
        const pw = document.getElementById('login-pw').value;
        const keepLogin = document.getElementById('keep-login').checked;
        
        if(!inputId || !pw) return alert("아이디와 비밀번호를 입력해주세요.");

        try {
            // 🔥 탭을 닫아도 시간이 지나기 전까진 유지되도록 Local 설정
            await setPersistence(auth, browserLocalPersistence);

            // 로그인 유지 여부와 현재 시간을 저장
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

// [3. 비밀번호 재설정]
const resetBtn = document.getElementById('reset-pw-btn');
if(resetBtn) {
    resetBtn.addEventListener('click', () => {
        const inputId = document.getElementById('login-id').value;
        if(!inputId.includes('@')) return alert("이메일을 입력해주세요.");
        sendPasswordResetEmail(auth, inputId).then(() => alert("이메일을 확인하세요."));
    });
}
