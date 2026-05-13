// js/classroom.js
import { db } from './firebase-init.js'; // 공용 DB 객체 사용
import { doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.x/firebase-firestore.js";

// 가이드 규칙: localStorage에서 UID 확보
const uid = localStorage.getItem('currentUserUid');
const CLIENT_ID = '779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com'; // 발급받은 ID로 교체 필요
let tokenClient;

// 초기화: 연동 상태 확인 및 버튼 이벤트 바인딩
document.addEventListener('DOMContentLoaded', async () => {
    if (!uid) return;

    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');

    // 1. 연동 상태 확인 (V-모델 STEP 2)
    await checkLinkStatus();

    // 2. Google GIS 객체 초기화
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly',
        callback: async (response) => {
            if (response.error) return;
            await handleAuthSuccess(response);
        },
    });

    // 3. 버튼 클릭 이벤트
    linkBtn.addEventListener('click', () => tokenClient.requestAccessToken());
    unlinkBtn.addEventListener('click', unlinkAccount);
});

// 연동 상태 확인 및 UI 업데이트
async function checkLinkStatus() {
    try {
        const docRef = doc(db, `users/${uid}/settings/classroom`); // 경로 규칙 준수
        const docSnap = await getDoc(docRef);

        const statusBadge = document.getElementById('link-status');
        const emailText = document.getElementById('linked-email');
        const linkBtn = document.getElementById('btn-link-classroom');
        const unlinkBtn = document.getElementById('btn-unlink-classroom');

        if (docSnap.exists()) {
            const data = docSnap.data();
            statusBadge.innerText = "연동됨";
            statusBadge.className = "status-badge status-linked";
            emailText.innerText = `연동된 계정: ${data.email}`;
            linkBtn.innerText = "계정 변경하기";
            unlinkBtn.style.display = "inline-block";
        }
    } catch (error) {
        console.error("상태 확인 실패:", error);
    }
}

// 인증 성공 시 Firestore에 저장 (V-모델 STEP 3)
async function handleAuthSuccess(tokenResponse) {
    try {
        // 실제 운영 시에는 이 토큰으로 구글 프로필 API를 호출하여 이메일을 가져와야 함
        const dummyEmail = "user@sasa.hs.kr"; 

        await setDoc(doc(db, `users/${uid}/settings/classroom`), {
            email: dummyEmail,
            access_token: tokenResponse.access_token,
            expires_at: Date.now() + (tokenResponse.expires_in * 1000),
            linkedAt: new Date().toISOString()
        });

        alert("성공적으로 연동되었습니다.");
        location.reload();
    } catch (error) {
        alert("데이터 저장 중 오류가 발생했습니다.");
    }
}

// 데이터 가져오기 기능 (다른 파일에서 import 하여 사용 가능)
export async function fetchClassroomData(endpoint = 'courseWork') {
    try {
        const docSnap = await getDoc(doc(db, `users/${uid}/settings/classroom`));
        if (!docSnap.exists()) throw new Error("연동된 계정 없음");

        const { access_token } = docSnap.data();
        
        // 확장성을 위해 공지사항(announcements) 등 엔드포인트 지원
        const response = await fetch(`https://classroom.googleapis.com/v1/courses/-/${endpoint}`, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        
        return await response.json();
    } catch (error) {
        console.error("클래스룸 데이터 로드 실패:", error);
        return null;
    }
}

// 연동 해제 로직
async function unlinkAccount() {
    if (confirm("연동을 해제하시겠습니까? 관련 데이터 접근이 차단됩니다.")) {
        try {
            await deleteDoc(doc(db, `users/${uid}/settings/classroom`));
            alert("연동이 해제되었습니다.");
            location.reload();
        } catch (error) {
            alert("처리 중 오류가 발생했습니다.");
        }
    }
}
