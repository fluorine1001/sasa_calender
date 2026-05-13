// js/classroom.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// 가이드 보안 규칙: localStorage에서 UID 확보
const uid = localStorage.getItem('currentUserUid');
// ⚠️ 본인의 실제 구글 클라이언트 ID로 반드시 변경하세요!
const CLIENT_ID = '779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com'; 

let tokenClient;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("[Classroom] 페이지 로드됨. UID:", uid);
    if (!uid) {
        console.warn("[Classroom] UID가 없습니다. 로그인이 필요합니다.");
        return;
    }

    // 1. 초기 UI 상태 업데이트
    await updateClassroomUI();

    // 2. Google OAuth 초기화
    if (typeof google !== 'undefined') {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/userinfo.email',
                callback: async (response) => {
                    if (response.error) {
                        console.error("[Classroom] 구글 인증 오류:", response.error);
                        return;
                    }
                    await handleAuthSuccess(response);
                },
            });
            console.log("[Classroom] Google Token Client 초기화 완료");
        } catch (e) {
            console.error("[Classroom] GIS 초기화 중 예외 발생:", e);
        }
    } else {
        console.warn("[Classroom] 구글 라이브러리(google)가 로드되지 않았습니다. index.html의 스크립트 태그를 확인하세요.");
    }

    // 3. 이벤트 리스너 연결
    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');

    if (linkBtn) {
        linkBtn.onclick = () => {
            console.log("[Classroom] 연동 버튼 클릭됨");
            if (tokenClient) {
                tokenClient.requestAccessToken();
            } else {
                alert("구글 라이브러리를 불러오는 중입니다. 잠시만 기다려주세요.");
            }
        };
    }

    if (unlinkBtn) {
        unlinkBtn.onclick = unlinkAccount;
    }
});

// 연동 상태에 따라 화면을 갱신하는 함수
async function updateClassroomUI() {
    console.log("[Classroom] UI 업데이트 시작...");
    try {
        const docRef = doc(db, `users/${uid}/settings/classroom`);
        const docSnap = await getDoc(docRef);

        const statusBadge = document.getElementById('link-status');
        const emailDisplay = document.getElementById('linked-email-display');
        const linkBtn = document.getElementById('btn-link-classroom');
        const unlinkBtn = document.getElementById('btn-unlink-classroom');

        // 요소 존재 여부 체크 (에러 방지)
        if (!statusBadge || !emailDisplay || !linkBtn) {
            console.error("[Classroom] 필수 UI 요소를 찾을 수 없습니다. index.html에 설정 UI가 제대로 있는지 확인하세요.");
            return;
        }

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("[Classroom] 연동 데이터 발견:", data);

            // 연동됨 상태 UI 적용
            statusBadge.innerText = "연동됨";
            statusBadge.className = "status-badge status-linked"; 
            
            const displayEmail = data.email || "알 수 없는 계정";
            emailDisplay.innerHTML = `<strong>연동된 계정:</strong> ${displayEmail}<br><span style="font-size:12px; color:#888;">클래스룸 데이터를 가져올 준비가 되었습니다.</span>`;
            
            linkBtn.innerText = "다른 계정으로 변경";
            if (unlinkBtn) unlinkBtn.style.display = "inline-block";
        } else {
            console.log("[Classroom] 연동 데이터 없음 (미연동 상태)");
            // 미연동 상태 UI 적용
            statusBadge.innerText = "미연동";
            statusBadge.className = "status-badge status-unlinked";
            emailDisplay.innerText = "클래스룸의 과제 및 공지사항 데이터를 자동으로 불러오기 위해 구글 계정을 연동합니다.";
            linkBtn.innerText = "구글 계정 연결하기";
            if (unlinkBtn) unlinkBtn.style.display = "none";
        }
    } catch (error) {
        console.error("[Classroom] UI 업데이트 중 오류 발생:", error);
    }
}

// 인증 성공 시: 실제 이메일 획득 및 Firestore 저장
async function handleAuthSuccess(tokenResponse) {
    console.log("[Classroom] 인증 성공. 정보를 저장합니다...");
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

        console.log("[Classroom] 저장 완료:", userEmail);
        alert(`${userEmail} 계정과 성공적으로 연동되었습니다.`);
        await updateClassroomUI(); // 새로고침 없이 UI 즉시 갱신
    } catch (error) {
        console.error("[Classroom] 데이터 저장 중 오류:", error);
        alert("계정 정보를 저장하는 중 오류가 발생했습니다.");
    }
}

// 연동 해제 (데이터 삭제)
async function unlinkAccount() {
    if (!confirm("연동을 해제하시겠습니까? 더 이상 클래스룸 데이터를 불러올 수 없습니다.")) return;
    try {
        await deleteDoc(doc(db, `users/${uid}/settings/classroom`));
        console.log("[Classroom] 연동 해제 완료");
        alert("연동 정보가 완전히 삭제되었습니다.");
        await updateClassroomUI(); // UI 초기 상태로 복구
    } catch (error) {
        console.error("[Classroom] 연동 해제 중 오류:", error);
        alert("삭제 처리 중 오류가 발생했습니다.");
    }
}
