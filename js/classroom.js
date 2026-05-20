// js/classroom.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, deleteDoc, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
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
    const fetchBtn = document.getElementById('classroom-import-btn'); // 가져오기 버튼

    // 클릭 이벤트 바인딩
    if (linkBtn) linkBtn.addEventListener('click', handleLinkClassroom);
    if (unlinkBtn) unlinkBtn.addEventListener('click', handleUnlinkClassroom);

    // [추가] 가져오기 버튼을 눌렀을 때 모달을 띄우는 코드
    if (fetchBtn) {
        fetchBtn.addEventListener('click', () => {
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
            currentUid = user.uid;
            
            // 1. 구글 인증 클라이언트 초기화
            initGoogleAuth();
            
            // 2. 현재 이 유저가 이미 클래스룸 연동을 완료했는지 DB 검사 및 UI 업데이트
            await checkLinkStatus();

            // 3. 저장된 과제 목록 실시간 감시 및 화면 표시
            subscribeTasks();
        } else {
            currentUid = null;
            updateUI(false, null);
            if (unsubscribeTasks) unsubscribeTasks();
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

        const accessToken = docSnap.data().access_token;
        const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
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
            item.onclick = () => loadAssignments(course.id, course.name, accessToken);
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
        const promises = assignments.map(task => setDoc(doc(tasksRef, `google_${task.id}`), {
            ...task,
            status: 'todo',
            createdAt: serverTimestamp()
        }, { merge: true }));
        
        await Promise.all(promises);
        alert(`${assignments.length}개의 과제를 '과제/공지' 탭에 저장했습니다!`);
        document.getElementById('classroom-modal').style.display = 'none';
        
        // 저장 후 목록 새로고침 로직이 있다면 여기서 호출 (예: loadTasks();)
    } catch (error) {
        console.error("Firestore 저장 실패:", error);
        alert("저장 중 오류가 발생했습니다.");
    }
}

let unsubscribeTasks = null;

/**
 * 3. Firestore에서 저장된 과제 목록을 실시간으로 가져와 index.html의 #tasks-list에 표시
 */
function subscribeTasks() {
    if (!currentUid) return;

    const tasksRef = collection(db, `users/${currentUid}/tasks`);
    const q = query(tasksRef, orderBy("createdAt", "desc"));

    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        const listContainer = document.getElementById('tasks-list');
        if (!listContainer) return;

        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">저장된 과제가 없습니다. 클래스룸에서 가져와보세요!</p>';
            return;
        }

        // 1. 데이터를 과목별로 그룹화 (courseName이 없는 경우 '기타'로 분류)
        const groups = {};
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const task = { id: docSnap.id, ...data };
            const course = task.courseName || "기타/일반";
            if (!groups[course]) groups[course] = [];
            groups[course].push(task);
        });

        listContainer.innerHTML = '';

        // 2. 과목 이름을 기준으로 정렬하여 렌더링
        Object.keys(groups).sort().forEach(courseName => {
            const groupSection = document.createElement('div');
            groupSection.className = 'cl-course-group';

            groupSection.innerHTML = `
                <div class="cl-course-header">${courseName}</div>
                <div class="cl-list"></div>
            `;

            const subList = groupSection.querySelector('.cl-list');
            
            // 3. 과목 내 과제를 마감일 내림차순(최신순)으로 정렬 (기한 없음은 맨 뒤로)
            const sortedTasks = groups[courseName].sort((a, b) => {
                if (a.dueDate === '기한 없음') return 1;
                if (b.dueDate === '기한 없음') return -1;
                return b.dueDate.localeCompare(a.dueDate); // 내림차순 정렬로 변경
            });

            sortedTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = 'cl-list-item';
                item.style.cursor = 'default';
                item.innerHTML = `
                    <div class="cl-work-info">
                        <span class="cl-work-title">${task.title}</span>
                        <span class="cl-work-due" style="color: ${task.dueDate === '기한 없음' ? '#aaa' : '#e67e22'}">
                            📅 마감: ${task.dueDate}
                        </span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <a href="${task.link}" target="_blank" class="cl-btn-primary" style="text-decoration:none; font-size:12px; padding:6px 12px;">클래스룸 열기</a>
                        <button class="btn-delete-task" data-id="${task.id}" style="background:none; border:none; cursor:pointer; font-size:16px;">🗑️</button>
                    </div>
                `;

                item.querySelector('.btn-delete-task').onclick = async () => {
                    if (confirm("이 과제를 목록에서 삭제하시겠습니까?")) {
                        await deleteDoc(doc(db, `users/${currentUid}/tasks/${task.id}`));
                    }
                };
                subList.appendChild(item);
            });

            listContainer.appendChild(groupSection);
        });
    }, (error) => {
        // [추가] 에러 핸들러: 권한 문제 등이 발생하면 여기서 잡힙니다.
        console.error("과제 목록 감시 에러:", error);
        if (error.code === 'permission-denied') {
            const listContainer = document.getElementById('tasks-list');
            if (listContainer) {
                listContainer.innerHTML = '<p style="text-align:center; color:#d93025; padding:20px;">데이터 접근 권한이 없습니다. 관리자에게 문의하세요.</p>';
            }
        }
    });
}
