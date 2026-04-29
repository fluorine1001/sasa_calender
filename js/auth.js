import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
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
        if(pw !== pwConfirm) return alert("비밀번호가 서로 다릅니다. 다시 확인해주세요.");
        if(pw.length < 6) return alert("비밀번호는 6자리 이상이어야 합니다.");

        try {
            const q = query(collection(db, "users"), where("nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                return alert("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력하세요.");
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                email: email,
                nickname: nickname,
                createdAt: new Date()
            });

            alert("회원가입이 완료되었습니다! 로그인 해주세요.");
            window.location.href = "login.html";

        } catch (error) {
            console.error(error);
            alert("회원가입 에러: " + error.message);
        }
    });
}

// [2. 로그인 로직 (로그인 유지 기능 포함)]
const loginBtn = document.getElementById('login-btn');
if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const inputId = document.getElementById('login-id').value; 
        const pw = document.getElementById('login-pw').value;
        const keepLogin = document.getElementById('keep-login').checked; // 체크박스 상태 확인
        
        let loginEmail = inputId; 

        if(!inputId || !pw) return alert("아이디와 비밀번호를 입력해주세요.");

        try {
            // 👇 체크박스 상태를 로컬스토리지에 저장 (auth-guard.js에서 읽기 위함)
            localStorage.setItem('keepLogin', keepLogin);

            // 👇 체크박스 여부에 따라 브라우저 닫을 때 로그아웃할지(Session) 유지할지(Local) 결정
            const persistence = keepLogin ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, persistence);

            // 닉네임 로그인 처리
            if (!inputId.includes('@')) {
                const q = query(collection(db, "users"), where("nickname", "==", inputId));
                const querySnapshot = await getDocs(q);
                
                if (querySnapshot.empty) {
                    return alert("존재하지 않는 닉네임입니다.");
                }
                loginEmail = querySnapshot.docs[0].data().email;
            }

            // 로그인 실행
            await signInWithEmailAndPassword(auth, loginEmail, pw);
            window.location.replace("index.html"); 

        } catch (error) {
            console.error(error);
            alert("로그인 실패: 아이디나 비밀번호를 확인해주세요.");
        }
    });
}

// [3. 비밀번호 찾기 로직]
const resetBtn = document.getElementById('reset-pw-btn');
if(resetBtn) {
    resetBtn.addEventListener('click', () => {
        const inputId = document.getElementById('login-id').value;
        if(!inputId.includes('@')) {
            return alert("비밀번호를 재설정하려면 가입하신 '이메일 주소'를 아이디 칸에 입력한 뒤 버튼을 눌러주세요.");
        }

        sendPasswordResetEmail(auth, inputId)
            .then(() => {
                alert("입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다.");
            })
            .catch((error) => {
                alert("에러 발생: " + error.message);
            });
    });
}
