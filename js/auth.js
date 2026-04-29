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
