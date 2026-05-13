// js/classroom.js
// 1. 버전을 10.5.0으로 정확히 일치시킴
import { db } from './firebase-init.js'; 
import { doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// 가이드 규칙: localStorage에서 UID 확보
const uid = localStorage.getItem('currentUserUid');
// TODO: 구글 클라우드 콘솔에서 발급받은 실제 클라이언트 ID를 입력하세요.
const CLIENT_ID = '779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com'; 

let tokenClient;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Classroom 모듈 로드 시도... UID:", uid);

    if (!uid) {
        console.error("UID가 없습니다. 로그인 상태를 확인하세요.");
        return;
    }

    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');

    // 1. 연동 상태 확인
    await checkLinkStatus();

    // 2. Google GIS 객체 초기화 (라이브러리 로드 확인 로그 추가)
    if (typeof google !== 'undefined') {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly',
            callback: async (response) => {
                if (response.error) {
                    console.error("구글 인증 에러:", response.error);
                    return;
                }
                await handleAuthSuccess(response);
            },
        });
        console.log("구글 토큰 클라이언트 초기화 완료");
    } else {
        console.error("구글 라이브러리가 로드되지 않았습니다. index.html의 스크립트 태그를 확인하세요.");
    }

    // 3. 버튼 클릭 이벤트 연결
    if (linkBtn) {
        linkBtn.addEventListener('click', () => {
            console.log("연동 버튼 클릭됨");
            if (tokenClient) {
                tokenClient.requestAccessToken();
            } else {
                alert("구글 서비스 초기화 중입니다. 잠시 후 다시 시도해주세요.");
            }
        });
    }

    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', unlinkAccount);
    }
});

// 연동 상태 확인 및 UI 업데이트
async function checkLinkStatus() {
    try {
        const docRef = doc(db, `users/${uid}/settings/classroom`);
        const docSnap = await getDoc(docRef);

        const statusBadge = document.getElementById('link-status');
        const emailText = document.getElementById('linked-email-display');
        const linkBtn = document.getElementById('btn-link-classroom');
        const unlinkBtn = document.getElementById('btn-unlink-classroom');

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (statusBadge) {
                statusBadge.innerText = "연동됨";
                statusBadge.className = "status-badge status-linked";
            }
            if (emailText) emailText.innerText = `연동된 계정: ${data.email}`;
            if (linkBtn) linkBtn.innerText = "계정 변경하기";
            if (unlinkBtn) unlinkBtn.style.display = "inline-block";
        }
    } catch (error) {
        console.error("Firestore 접근 실패:", error);
    }
}

// 인증 성공 시 처리
async function handleAuthSuccess(tokenResponse) {
    try {
        // 실제 운영 시에는 구글 사용자 정보 API를 호출하여 이메일을 가져오는 로직 권장
        const userEmail = "연동 완료 계정"; 

        await setDoc(doc(db, `users/${uid}/settings/classroom`), {
            email: userEmail,
            access_token: tokenResponse.access_token,
            linkedAt: new Date().toISOString()
        });

        alert("성공적으로 연동되었습니다.");
        location.reload();
    } catch (error) {
        console.error("데이터 저장 실패:", error);
        alert("설정 저장 중 오류가 발생했습니다.");
    }
}

async function unlinkAccount() {
    if (confirm("연동을 해제하시겠습니까?")) {
        try {
            await deleteDoc(doc(db, `users/${uid}/settings/classroom`));
            alert("연동이 해제되었습니다.");
            location.reload();
        } catch (error) {
            console.error("연동 해제 실패:", error);
        }
    }
}
