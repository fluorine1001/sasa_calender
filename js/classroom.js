// js/classroom.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let tokenClient = null;

// ⚠️ [필수 확인] 본인의 Google Cloud Console에서 발급받은 클라이언트 ID를 입력하세요!
const GOOGLE_CLIENT_ID = "779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com"; 
const SCOPES = "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly";

document.addEventListener('DOMContentLoaded', () => {
    // 버튼 요소 가져오기
    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');

    // 클릭 이벤트 바인딩
    if (linkBtn) linkBtn.addEventListener('click', handleLinkClassroom);
    if (unlinkBtn) unlinkBtn.addEventListener('click', handleUnlinkClassroom);

    // Firebase 로그인 상태 확인 후 구글 서비스 초기화 수행
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            
            // 1. 구글 인증 클라이언트 초기화
            initGoogleAuth();
            
            // 2. 현재 이 유저가 이미 클래스룸 연동을 완료했는지 DB 검사 및 UI 업데이트
            await checkLinkStatus();
        } else {
            currentUid = null;
            updateUI(false, null);
        }
    });
});

// 구글 Identity Services (GSI) 팝업 객체 초기화 함수
function initGoogleAuth() {
    // html에 명시한 구글 스크립트가 아직 완전히 로드되지 않은 경우를 대비한 안전장치
    if (typeof google === 'undefined') {
        setTimeout(initGoogleAuth, 300);
        return;
    }

    if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: async (tokenResponse) => {
                if (tokenResponse.error !== undefined) {
                    console.error("구글 인증 에러:", tokenResponse);
                    return;
                }
                // 인증 성공 시 토큰 저장
                await saveTokenToFirestore(tokenResponse);
            },
        });
    }
}

// [연동하기] 버튼 클릭 시 실행
function handleLinkClassroom() {
    if (!tokenClient) {
        alert("구글 인증 시스템을 초기화 중입니다. 잠시 후 다시 시도해주세요.");
        initGoogleAuth();
        return;
    }
    // 구글 계정 선택 및 권한 동의 팝업창 실행
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

// 구글로부터 받은 토큰을 Firestore에 세팅
async function saveTokenToFirestore(tokenResponse) {
    if (!currentUid) return;

    try {
        const tokenRef = doc(db, `users/${currentUid}/tokens/classroom`);
        
        // 토큰 정보 및 만료 시간 계산하여 저장
        await setDoc(tokenRef, {
            access_token: tokenResponse.access_token,
            expires_at: Date.now() + (tokenResponse.expires_in * 1000),
            linkedAt: new Date().toISOString()
        });

        alert("구글 클래스룸 연동이 완료되었습니다!");
        await checkLinkStatus(); // UI 갱신
    } catch (error) {
        console.error("토큰 저장 실패:", error);
        alert("연동 정보를 저장하는 중 오류가 발생했습니다.");
    }
}

// Firestore를 조회하여 연동 상태 확인
async function checkLinkStatus() {
    if (!currentUid) return;

    try {
        const tokenRef = doc(db, `users/${currentUid}/tokens/classroom`);
        const docSnap = await getDoc(tokenRef);

        if (docSnap.exists()) {
            // 연동 기록이 존재함
            updateUI(true);
        } else {
            // 연동 기록이 없음
            updateUI(false);
        }
    } catch (error) {
        console.error("연동 상태 확인 실패:", error);
        updateUI(false);
    }
}

// [연결 해제] 버튼 클릭 시 실행
async function handleUnlinkClassroom() {
    if (!currentUid) return;

    if (confirm("구글 클래스룸 연동을 해제하시겠습니까? 사사 캘린더에서 더 이상 과제를 불러올 수 없습니다.")) {
        try {
            const tokenRef = doc(db, `users/${currentUid}/tokens/classroom`);
            await deleteDoc(tokenRef);
            
            alert("연동이 해제되었습니다.");
            updateUI(false);
        } catch (error) {
            console.error("연동 해제 실패:", error);
            alert("연동 해제 중 오류가 발생했습니다.");
        }
    }
}

// js/classroom.js 맨 아래에 있는 updateUI 함수를 이것으로 교체
function updateUI(isLinked) {
    const linkStatus = document.getElementById('link-status');
    const linkedEmailDisplay = document.getElementById('linked-email-display');
    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');

    if (!linkStatus || !linkBtn || !unlinkBtn) return;

    // 만약 로그인이 안 되어 있어서 currentUid가 없다면 무조건 미연동 레이아웃으로 복귀
    if (!currentUid) {
        linkStatus.innerText = "미연동";
        linkStatus.className = "status-badge status-unlinked";
        if (linkedEmailDisplay) linkedEmailDisplay.innerText = "로그인이 필요합니다.";
        linkBtn.style.display = "inline-block";
        unlinkBtn.style.display = "none";
        return;
    }

    if (isLinked) {
        linkStatus.innerText = "연동됨";
        linkStatus.className = "status-badge status-linked";
        if (linkedEmailDisplay) linkedEmailDisplay.innerText = "구글 클래스룸과 성공적으로 연결되어 있습니다. 과제 탭에서 데이터를 가져올 수 있습니다.";
        linkBtn.style.display = "none";
        unlinkBtn.style.display = "inline-block"; // ◀ 오타 수정 완료! (.style 한 번만)
    } else {
        linkStatus.innerText = "미연동";
        linkStatus.className = "status-badge status-unlinked";
        if (linkedEmailDisplay) linkedEmailDisplay.innerText = "클래스룸의 과제 및 공지사항 데이터를 자동으로 불러오기 위해 구글 계정을 연동합니다.";
        linkBtn.style.display = "inline-block";
        unlinkBtn.style.display = "none";
    }
}
