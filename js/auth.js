// js/auth.js
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// [회원가입 로직]
const signupBtn = document.getElementById('signup-btn');
if(signupBtn) {
    signupBtn.addEventListener('click', async () => {
        const email = document.getElementById('signup-email').value;
        const nickname = document.getElementById('signup-nickname').value;
        const pw = document.getElementById('signup-pw').value;
        const pwConfirm = document.getElementById('signup-pw-confirm').value;

        // 1. 오탈자 및 빈칸 확인
        if(!email || !nickname || !pw || !pwConfirm) return alert("모든 칸을 채워주세요.");
        if(pw !== pwConfirm) return alert("비밀번호가 서로 다릅니다. 다시 확인해주세요.");
        if(pw.length < 6) return alert("비밀번호는 6자리 이상이어야 합니다.");

        try {
            // 2. 닉네임 중복 확인 (users 컬렉션에서 같은 닉네임이 있는지 검색)
            const q = query(collection(db, "users"), where("nickname", "==", nickname));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                return alert("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력하세요.");
            }

            // 3. 파이어베이스 계정 생성 (이메일/비밀번호)
            const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
            const user = userCredential.user;

            // 4. Firestore DB에 사용자 프로필 정보(닉네임) 저장
            await setDoc(doc(db, "users", user.uid), {
                email: email,
                nickname: nickname,
                createdAt: new Date()
            });

            alert("회원가입이 완료되었습니다! 로그인 해주세요.");
            window.location.href = "login.html"; // 가입 성공 시 로그인 창으로 이동

        } catch (error) {
            console.error(error);
            alert("회원가입 에러: " + error.message);
        }
    });
}

import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

// [로그인 로직]
const loginBtn = document.getElementById('login-btn');
if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const inputId = document.getElementById('login-id').value; // 이메일 혹은 닉네임
        const pw = document.getElementById('login-pw').value;
        let loginEmail = inputId; // 기본적으로 입력값을 이메일로 취급

        if(!inputId || !pw) return alert("아이디와 비밀번호를 입력해주세요.");

        try {
            // 입력값에 '@'가 없다면 닉네임으로 간주하고 DB에서 이메일을 검색함
            if (!inputId.includes('@')) {
                const q = query(collection(db, "users"), where("nickname", "==", inputId));
                const querySnapshot = await getDocs(q);
                
                if (querySnapshot.empty) {
                    return alert("존재하지 않는 닉네임입니다.");
                }
                // 검색된 닉네임의 진짜 이메일을 가져옴
                loginEmail = querySnapshot.docs[0].data().email;
            }

            // 찾은 이메일과 비밀번호로 파이어베이스 로그인 실행
            await signInWithEmailAndPassword(auth, loginEmail, pw);
            window.location.href = "index.html"; // 로그인 성공 시 메인 화면(캘린더)으로 이동

        } catch (error) {
            console.error(error);
            alert("로그인 실패: 아이디나 비밀번호를 확인해주세요.");
        }
    });
}

// [비밀번호 찾기 로직]
const resetBtn = document.getElementById('reset-pw-btn');
if(resetBtn) {
    resetBtn.addEventListener('click', () => {
        const inputId = document.getElementById('login-id').value;
        if(!inputId.includes('@')) {
            return alert("비밀번호를 재설정하려면 가입하신 '이메일 주소'를 아이디 칸에 입력한 뒤 버튼을 눌러주세요.");
        }

        // 이메일로 재설정 링크 발송
        sendPasswordResetEmail(auth, inputId)
            .then(() => {
                alert("입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다. 이메일함을 확인해주세요!");
            })
            .catch((error) => {
                alert("에러 발생: " + error.message);
            });
    });
}
