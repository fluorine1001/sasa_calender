// js/classroom.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const uid = localStorage.getItem('currentUserUid'); // 가이드 보안 규칙 준수
const CLIENT_ID = '779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com'; // 발급받은 ID로 교체

let tokenClient;

document.addEventListener('DOMContentLoaded', async () => {
    if (!uid) return;

    // UI 요소 확보
    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');

    // 1. 초기 로드 시 연동 상태 확인 (가장 먼저 실행)
    await updateClassroomUI();

    // 2. Google OAuth 클라이언트 초기화
    if (typeof google !== 'undefined') {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/userinfo.email',
            callback: async (response) => {
                if (response.error) return;
                await handleAuthSuccess(response);
            },
        });
    }

    // 3. 연동 버튼 클릭 (연동 및 계정 변경 공용)
    if (linkBtn) {
        linkBtn.addEventListener('click', () => {
            if (tokenClient) tokenClient.requestAccessToken();
        });
    }

    // 4. 연동 해제 버튼 클릭
    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', unlinkAccount);
    }
});

// 연동 상태에 따라 화면을 갱신하는 함수
async function updateClassroomUI() {
    try {
        const docRef = doc(db, `users/${uid}/settings/classroom`); // 유저별 격리 경로
        const docSnap = await getDoc(docRef);

        const statusBadge = document.getElementById('link-status');
        const emailDisplay = document.getElementById('linked-email-display');
        const linkBtn = document.getElementById('btn-link-classroom');
        const unlinkBtn = document.getElementById('btn-unlink-classroom');

        if (docSnap.exists()) {
            const data = docSnap.data();
            // 연동된 상태의 UI
            if (statusBadge) {
                statusBadge.innerText = "연동됨";
                statusBadge.className = "status-badge status-linked";
            }
            if (emailDisplay) {
                emailDisplay.innerHTML = `<strong>연동된 계정:</strong> ${data.email}<br><small style="color: #888;">클래스룸 데이터를 불러올 준비가 되었습니다.</small>`;
            }
            if (linkBtn) linkBtn.innerText = "다른 계정으로 변경";
            if (unlinkBtn) unlinkBtn.style.display = "inline-block";
        } else {
            // 연동되지 않은 초기 상태 UI
            if (statusBadge) {
                statusBadge.innerText = "미연동";
                statusBadge.className = "status-badge status-unlinked";
            }
            if (emailDisplay) {
                emailDisplay.innerText = "클래스룸의 과제 및 공지사항 데이터를 자동으로 불러오기 위해 구글 계정을 연동합니다.";
            }
            if (linkBtn) linkBtn.innerText = "구글 계정 연결하기";
            if (unlinkBtn) unlinkBtn.style.display = "none";
        }
    } catch (error) {
        console.error("UI 업데이트 중 오류:", error);
    }
}

// 인증 성공 시: 실제 이메일 획득 및 Firestore 저장
async function handleAuthSuccess(tokenResponse) {
    try {
        // 구글 UserInfo API를 호출하여 실제 이메일 주소를 가져옴
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
        });
        const userInfo = await userInfoRes.json();
        const userEmail = userInfo.email;

        // Firestore에 계정 연동 정보 저장 (임의의 세션에서도 유지됨)
        await setDoc(doc(db, `users/${uid}/settings/classroom`), {
            email: userEmail,
            access_token: tokenResponse.access_token,
            linkedAt: new Date().toISOString()
        });

        alert(`${userEmail} 계정과 성공적으로 연동되었습니다.`);
        await updateClassroomUI(); // 새로고침 없이 UI 즉시 갱신
    } catch (error) {
        console.error("데이터 저장 실패:", error);
        alert("계정 정보를 저장하는 중 오류가 발생했습니다.");
    }
}

// 연동 해제 (데이터 삭제)
async function unlinkAccount() {
    if (confirm("연동을 해제하시겠습니까? 더 이상 클래스룸 데이터를 불러올 수 없습니다.")) {
        try {
            await deleteDoc(doc(db, `users/${uid}/settings/classroom`));
            alert("연동 정보가 완전히 삭제되었습니다.");
            await updateClassroomUI(); // UI 초기 상태로 복구
        } catch (error) {
            console.error("연동 해제 실패:", error);
            alert("삭제 처리 중 오류가 발생했습니다.");
        }
    }
}
