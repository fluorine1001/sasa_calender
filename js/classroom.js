// js/classroom.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, deleteDoc, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let tokenClient = null;

// ⚠️ [필수 확인] 본인의 Google Cloud Console에서 발급받은 클라이언트 ID를 입력하세요!
const GOOGLE_CLIENT_ID = "779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com"; 
const SCOPES = "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly";

function initClassroom() {
    console.log("[Classroom] 모듈 초기화 시작...");
    // 버튼 요소 가져오기
    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');
    const fetchBtn = document.getElementById('classroom-import-btn'); // 가져오기 버튼

    // 동적으로 생성된 버튼에서 호출할 수 있도록 전역 바인딩
    window.handleLinkClassroom = handleLinkClassroom;
    window.loadCourses = loadCourses;

    // 클릭 이벤트 바인딩
    if (linkBtn) {
        console.log("[Classroom] 연동 버튼 감지됨, 리스너 연결 완료.");
        linkBtn.addEventListener('click', handleLinkClassroom);
    } else {
        console.warn("[Classroom] 'btn-link-classroom' 버튼을 DOM에서 찾을 수 없습니다.");
    }
    if (unlinkBtn) unlinkBtn.addEventListener('click', handleUnlinkClassroom);

    // [추가] 가져오기 버튼을 눌렀을 때 모달을 띄우는 코드
    if (fetchBtn) {
        fetchBtn.addEventListener('click', () => {
            console.log("[Classroom] 가져오기 버튼 클릭됨.");
            const modal = document.getElementById('classroom-modal');
            if (modal) {
                modal.style.display = 'flex';
                loadCourses(); // 모달이 열릴 때 수업 목록을 불러옵니다.
            }
        });
    }

    // Firebase 로그인 상태 확인 후 구글 서비스 초기화 수행
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("[Classroom] Firebase 로그인 감지:", user.uid);
            currentUid = user.uid;
            
            // 1. 구글 인증 클라이언트 초기화
            initGoogleAuth();
            
            // 2. 현재 이 유저가 이미 클래스룸 연동을 완료했는지 DB 검사 및 UI 업데이트
            await checkLinkStatus();
        } else {
            console.log("[Classroom] Firebase 로그아웃 상태.");
            currentUid = null;
            updateUI(false);
        }
    });
}

// DOM 로드 상태에 따라 초기화 함수 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClassroom);
} else {
    initClassroom();
}

// 구글 Identity Services (GSI) 팝업 객체 초기화 함수
function initGoogleAuth() {
    // html에 명시한 구글 스크립트가 아직 완전히 로드되지 않은 경우를 대비한 안전장치
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        console.log("[Classroom] Google SDK 로드 대기 중 (300ms 후 재시도)...");
        setTimeout(initGoogleAuth, 300);
        return;
    }

    console.log("[Classroom] Google SDK 로드 완료. TokenClient 초기화 시도...");
    if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: async (tokenResponse) => {
                console.log("[Classroom] 구글 인증 응답 수신:", tokenResponse);
                if (tokenResponse.error !== undefined) {
                    console.error("구글 인증 에러:", tokenResponse);
                    alert("구글 인증에 실패했습니다.");
                    return;
                }
                // 인증 성공 시 토큰 저장
                await saveTokenToFirestore(tokenResponse);
            },
        });
        console.log("[Classroom] TokenClient 초기화 완료.");
    }
}

// [연동하기] 버튼 클릭 시 실행
function handleLinkClassroom() {
    console.log("[Classroom] 연동 버튼 클릭됨. 현재 UID:", currentUid, "TokenClient 존재 여부:", !!tokenClient);
    if (!currentUid) {
        alert("로그인이 필요합니다.");
        return;
    }
    if (!tokenClient) {
        alert("구글 인증 시스템을 초기화 중입니다. 잠시 후 다시 시도해주세요.");
        initGoogleAuth();
        return;
    }
    // 구글 계정 선택 및 권한 동의 팝업창 실행
    console.log("[Classroom] 구글 액세스 토큰 요청 시작...");
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
            const data = docSnap.data();
            // 토큰이 존재하고 만료되지 않았는지 확인 (현재 시간 < 만료 예정 시간)
            const isValid = data.access_token && (Date.now() < (data.expires_at || 0));
            updateUI(isValid);
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

// 연동 상태에 따른 버튼 표시 제어 (설정 탭 위주)
function updateUI(isLinked) {
    const linkStatus = document.getElementById('link-status');
    const linkedEmailDisplay = document.getElementById('linked-email-display');
    const linkBtn = document.getElementById('btn-link-classroom');
    const unlinkBtn = document.getElementById('btn-unlink-classroom');
    const fetchBtn = document.getElementById('classroom-import-btn'); 

    console.log(`[DEBUG] updateUI - 연동: ${isLinked}, 버튼찾음: ${!!fetchBtn}`);

    // 만약 로그인이 안 되어 있어서 currentUid가 없다면 무조건 미연동 레이아웃으로 복귀
    if (!currentUid) {
        if (linkStatus) {
            linkStatus.innerText = "미연동";
            linkStatus.className = "status-badge status-unlinked";
        }
        if (linkedEmailDisplay) linkedEmailDisplay.innerText = "로그인이 필요합니다.";
        if (linkBtn) linkBtn.style.display = "inline-block";
        if (unlinkBtn) unlinkBtn.style.display = "none";
        if (fetchBtn) fetchBtn.style.display = "none";
        return;
    }

    // 연동 상태에 따른 UI 업데이트 (요소가 존재할 때만 실행)
    if (linkStatus) {
        linkStatus.innerText = isLinked ? "연동됨" : "미연동";
        linkStatus.className = isLinked ? "status-badge status-linked" : "status-badge status-unlinked";
    }
    if (linkedEmailDisplay) {
        linkedEmailDisplay.innerText = isLinked ? "구글 클래스룸과 성공적으로 연결되어 있습니다." : "계정을 연동해 주세요.";
    }
    if (linkBtn) linkBtn.style.display = isLinked ? "none" : "inline-block";
    if (unlinkBtn) unlinkBtn.style.display = isLinked ? "inline-block" : "none";
    if (fetchBtn) fetchBtn.style.display = isLinked ? "inline-block" : "none";
}

/**
 * 1. 구글 클래스룸 수업(Courses) 목록 불러오기
 */
async function loadCourses() {
    const modalBody = document.getElementById('classroom-modal-body');
    if (!modalBody) return;

    modalBody.innerHTML = '<div class="cl-spinner"></div><p style="text-align:center; margin-top:10px;">수업 목록을 불러오는 중...</p>';

    try {
        // Firestore에서 토큰 가져오기
        const tokenRef = doc(db, `users/${currentUid}/tokens/classroom`);
        const docSnap = await getDoc(tokenRef);
        
        if (!docSnap.exists()) {
            modalBody.innerHTML = '<p>연동 정보를 찾을 수 없습니다. 설정에서 다시 연동해주세요.</p>';
            return;
        }

        const { access_token, expires_at } = docSnap.data();

        // 💡 1. 호출 전 만료 여부 확인
        if (Date.now() >= (expires_at || 0)) {
            modalBody.innerHTML = `
                <p style="color:#d93025;">인증 세션이 만료되었습니다. 다시 연동이 필요합니다.</p>
                <button class="cl-btn-primary" onclick="handleLinkClassroom()" style="width:100%; margin-top:10px;">다시 연동하기</button>
            `;
            return;
        }

        const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        // 💡 2. 401 Unauthorized 에러 처리
        if (response.status === 401) {
            modalBody.innerHTML = `
                <p style="color:#d93025;">인증 정보가 유효하지 않습니다. 다시 연동해주세요.</p>
                <button class="cl-btn-primary" onclick="handleLinkClassroom()" style="width:100%; margin-top:10px;">다시 연동하기</button>
            `;
            return;
        }

        const data = await response.json();

        if (!data.courses || data.courses.length === 0) {
            modalBody.innerHTML = '<p>참여 중인 클래스룸 수업이 없습니다.</p>';
            return;
        }

        // 수업 목록 렌더링
        modalBody.innerHTML = '<h4>가져올 수업을 선택하세요</h4><div class="cl-list"></div>';
        const listContainer = modalBody.querySelector('.cl-list');

        data.courses.forEach(course => {
            const item = document.createElement('div');
            item.className = 'cl-list-item';
            item.innerHTML = `
                <span class="cl-course-name">${course.name}</span>
                <span class="cl-arrow">❯</span>
            `;
            item.onclick = () => loadAssignments(course.id, course.name, access_token);
            listContainer.appendChild(item);
        });

    } catch (error) {
        console.error("수업 목록 로드 실패:", error);
        modalBody.innerHTML = '<p>데이터를 가져오는 중 오류가 발생했습니다.</p>';
    }
}

/**
 * 2. 선택한 수업의 과제(CourseWork) 불러오기
 */
async function loadAssignments(courseId, courseName, token) {
    const modalBody = document.getElementById('classroom-modal-body');
    modalBody.innerHTML = '<div class="cl-spinner"></div><p style="text-align:center; margin-top:10px;">과제를 불러오는 중...</p>';

    try {
        const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.courseWork || data.courseWork.length === 0) {
            modalBody.innerHTML = '<p>이 수업에는 등록된 과제가 없습니다.</p><button class="cl-btn-primary" onclick="loadCourses()">뒤로 가기</button>';
            return;
        }

        // 과제 목록 렌더링 (체크박스 포함)
        modalBody.innerHTML = `
            <button class="cl-btn-back" id="btn-back-to-courses">❮ 수업 목록으로</button>
            <h4 style="margin-top:10px;">가져올 과제를 선택하세요</h4>
            <div class="cl-list" id="assignment-list"></div>
            <button class="cl-btn-primary" id="btn-save-assignments" style="width:100%; margin-top:20px;">선택한 과제 저장하기</button>
        `;

        const listContainer = document.getElementById('assignment-list');
        document.getElementById('btn-back-to-courses').onclick = loadCourses;

        data.courseWork.forEach(work => {
            // 정렬을 위해 월, 일을 01, 02 형식으로 패딩 처리
            const dateStr = work.dueDate 
                ? `${work.dueDate.year}-${String(work.dueDate.month).padStart(2, '0')}-${String(work.dueDate.day).padStart(2, '0')}` 
                : '기한 없음';
            
            const taskData = {
                id: work.id,
                courseName: courseName,
                title: work.title,
                dueDate: dateStr,
                link: work.alternateLink
            };

            const item = document.createElement('label');
            item.className = 'cl-list-item cl-checkable';
            item.innerHTML = `
                <input type="checkbox" class="cl-checkbox" data-work='${JSON.stringify(taskData).replace(/'/g, "&apos;")}'>
                <div class="cl-work-info">
                    <span class="cl-work-title">${work.title}</span>
                    <span class="cl-work-due">마감: ${dateStr}</span>
                </div>
            `;
            listContainer.appendChild(item);
        });

        // 저장 버튼 이벤트
        document.getElementById('btn-save-assignments').onclick = async () => {
            const selected = Array.from(listContainer.querySelectorAll('.cl-checkbox:checked'))
                                 .map(cb => JSON.parse(cb.dataset.work));
            
            if (selected.length === 0) return alert("추가할 과제를 선택해주세요.");
            
            await saveAssignmentsToFirestore(selected);
        };

    } catch (error) {
        console.error("과제 로드 실패:", error);
        modalBody.innerHTML = '<p>과제를 불러오지 못했습니다.</p>';
    }
}

async function saveAssignmentsToFirestore(assignments) {
    try {
        const tasksRef = collection(db, `users/${currentUid}/tasks`);
        const promises = assignments.map(task => {
            // 마감 기한 하루 전 알림 계산
            let reminderDate = null;
            if (task.dueDate !== '기한 없음') {
                const d = new Date(task.dueDate);
                d.setDate(d.getDate() - 1);
                reminderDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T09:00`;
            }

            return setDoc(doc(tasksRef, `google_${task.id}`), {
                ...task,
                status: 'todo',
                memo: '', // 메모 필드 초기화
                reminderDate: reminderDate,
                isNotified: false,
                createdAt: serverTimestamp()
            }, { merge: true });
        });
        
        await Promise.all(promises);
        alert(`${assignments.length}개의 과제를 '과제/공지' 탭에 저장했습니다!`);
        document.getElementById('classroom-modal').style.display = 'none';
        
        // 저장 후 목록 새로고침 로직이 있다면 여기서 호출 (예: loadTasks();)
    } catch (error) {
        console.error("Firestore 저장 실패:", error);
        alert("저장 중 오류가 발생했습니다.");
    }
}
