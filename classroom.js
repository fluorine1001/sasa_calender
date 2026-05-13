// js/classroom.js
// ================================================================
// [사용 전 필수 설정]
// 아래 YOUR_CLIENT_ID 부분을 GCP 콘솔에서 발급받은 OAuth 2.0 클라이언트 ID로 교체하세요.
// 예시: "123456789-abcdefg.apps.googleusercontent.com"
// ================================================================
const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";

// 필요한 권한 범위 (클래스룸 과제 읽기 전용)
const SCOPES = "https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.courses.readonly";

// Firestore import
import { db } from "./firebase-init.js";
import { collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";


// ================================================================
// [토큰 관리] — 발급, 만료 감지, 자동 갱신
// ================================================================

// 토큰을 localStorage에 저장 (만료 시각도 함께)
function saveToken(accessToken) {
    localStorage.setItem('gAccessToken', accessToken);
    // Google Access Token 수명은 3600초(1시간). 5분 여유를 두고 만료 처리
    localStorage.setItem('gTokenExpiry', Date.now() + (3600 - 300) * 1000);
}

// 저장된 토큰이 아직 유효한지 확인
function isTokenValid() {
    const token = localStorage.getItem('gAccessToken');
    const expiry = localStorage.getItem('gTokenExpiry');
    return token && expiry && Date.now() < parseInt(expiry);
}

// GIS 팝업 없이 조용히 토큰 재발급 시도 (사용자가 Google에 로그인된 상태이면 성공)
function requestTokenSilently() {
    return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            prompt: '',           // 빈 문자열 = 팝업 없이 시도
            callback: (response) => {
                if (response.error) {
                    reject(response.error);
                } else {
                    saveToken(response.access_token);
                    resolve(response.access_token);
                }
            }
        });
        client.requestAccessToken();
    });
}

// 토큰 팝업(동의 화면) 표시 — 최초 연동 시 or 자동 갱신 실패 시 호출
function requestTokenWithPopup() {
    return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.error) {
                    reject(response.error);
                } else {
                    saveToken(response.access_token);
                    resolve(response.access_token);
                }
            }
        });
        client.requestAccessToken({ prompt: 'consent' });
    });
}

// 외부에서 사용할 토큰 획득 함수 — 유효하면 그대로, 만료 시 자동 처리
async function getValidToken() {
    // 1. 기존 토큰이 유효하면 바로 반환
    if (isTokenValid()) {
        return localStorage.getItem('gAccessToken');
    }
    // 2. 만료됐다면 팝업 없이 갱신 시도
    try {
        return await requestTokenSilently();
    } catch {
        // 3. 자동 갱신도 실패하면 팝업 표시 (사용자 재동의)
        return await requestTokenWithPopup();
    }
}


// ================================================================
// [Google Classroom API 호출]
// ================================================================

// 수강 중인 클래스 목록 가져오기
async function fetchCourses(token) {
    const res = await fetch(
        "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE",
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`클래스 목록 오류: ${res.status}`);
    const data = await res.json();
    return data.courses || [];
}

// 특정 클래스의 과제 목록 가져오기
async function fetchCourseWork(token, courseId) {
    const res = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?orderBy=dueDate desc`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`과제 목록 오류: ${res.status}`);
    const data = await res.json();
    return data.courseWork || [];
}

// Google Classroom dueDate 객체 → JavaScript Date 변환
function parseDueDate(dueDate, dueTime) {
    if (!dueDate) return null;
    const { year, month, day } = dueDate;
    const hour = dueTime?.hours || 23;
    const minute = dueTime?.minutes || 59;
    // Google API의 시간은 UTC 기준
    return new Date(Date.UTC(year, month - 1, day, hour, minute));
}


// ================================================================
// [Firestore 저장] — tasks 컬렉션에 클래스룸 과제 추가
// ================================================================

async function saveTaskToFirestore(task) {
    const uid = localStorage.getItem('currentUserUid');
    if (!uid) throw new Error("로그인 정보가 없습니다.");

    await addDoc(collection(db, "users", uid, "tasks"), {
        title: task.title,
        dueDate: task.dueDate ? Timestamp.fromDate(task.dueDate) : null,
        isCompleted: false,
        memo: task.description || "",
        source: "classroom",           // 어디서 가져온 과제인지 표시
        courseId: task.courseId,
        classroomId: task.id           // 중복 방지용 원본 ID
    });
}


// ================================================================
// [UI 렌더링] — 모달 내부 화면 전환
// ================================================================

const modal = document.getElementById('classroom-modal');
const modalBody = document.getElementById('classroom-modal-body');

// 로딩 스피너
function showLoading(message = "불러오는 중...") {
    modalBody.innerHTML = `
        <div style="text-align:center; padding: 40px 0;">
            <div class="cl-spinner"></div>
            <p style="margin-top:16px; color:#555;">${message}</p>
        </div>`;
}

// 에러 메시지
function showError(message) {
    modalBody.innerHTML = `
        <div style="text-align:center; padding: 30px 0;">
            <p style="color:#e74c3c; font-size:15px;">⚠️ ${message}</p>
            <button class="cl-btn-primary" id="cl-retry-btn" style="margin-top:16px;">다시 시도</button>
        </div>`;
    document.getElementById('cl-retry-btn').addEventListener('click', startClassroomFlow);
}

// 클래스 목록 화면
function renderCourseList(courses) {
    if (courses.length === 0) {
        modalBody.innerHTML = `<p style="text-align:center;padding:30px;color:#888;">활성화된 클래스룸이 없습니다.</p>`;
        return;
    }
    modalBody.innerHTML = `
        <p style="margin:0 0 16px; font-size:14px; color:#555;">가져올 과제가 있는 수업을 선택하세요.</p>
        <div class="cl-list">
            ${courses.map(c => `
                <div class="cl-list-item" data-id="${c.id}" data-name="${c.name}">
                    <span class="cl-course-name">${c.name}</span>
                    <span class="cl-arrow">›</span>
                </div>
            `).join('')}
        </div>`;

    document.querySelectorAll('.cl-list-item').forEach(item => {
        item.addEventListener('click', async () => {
            const courseId = item.dataset.id;
            const courseName = item.dataset.name;
            await showCourseWork(courseId, courseName);
        });
    });
}

// 과제 목록 화면
function renderCourseWorkList(courseWork, courseName) {
    if (courseWork.length === 0) {
        modalBody.innerHTML = `
            <button class="cl-btn-back" id="cl-back-btn">← 수업 목록으로</button>
            <p style="text-align:center;padding:30px;color:#888;">등록된 과제가 없습니다.</p>`;
        document.getElementById('cl-back-btn').addEventListener('click', () => startClassroomFlow());
        return;
    }

    modalBody.innerHTML = `
        <button class="cl-btn-back" id="cl-back-btn">← 수업 목록으로</button>
        <p style="margin:12px 0 16px; font-size:14px; color:#555;">
            <strong>${courseName}</strong> — 가져올 과제를 선택하세요. (중복 선택 가능)
        </p>
        <div class="cl-list" id="cl-work-list">
            ${courseWork.map(w => {
                const due = parseDueDate(w.dueDate, w.dueTime);
                const dueStr = due
                    ? due.toLocaleDateString('ko-KR', { month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
                    : '기한 없음';
                return `
                <label class="cl-list-item cl-checkable" data-id="${w.id}">
                    <input type="checkbox" class="cl-checkbox" value="${w.id}">
                    <div class="cl-work-info">
                        <span class="cl-work-title">${w.title}</span>
                        <span class="cl-work-due">📅 ${dueStr}</span>
                    </div>
                </label>`;
            }).join('')}
        </div>
        <button class="cl-btn-primary" id="cl-import-btn" style="width:100%;margin-top:16px;">선택한 과제 가져오기</button>`;

    // 뒤로 가기
    document.getElementById('cl-back-btn').addEventListener('click', () => startClassroomFlow());

    // 가져오기 실행
    document.getElementById('cl-import-btn').addEventListener('click', async () => {
        const checked = [...document.querySelectorAll('.cl-checkbox:checked')];
        if (checked.length === 0) return alert("과제를 1개 이상 선택해주세요.");

        const selectedIds = checked.map(cb => cb.value);
        const selectedWork = courseWork.filter(w => selectedIds.includes(w.id));

        showLoading("과제를 저장하는 중...");

        let successCount = 0;
        let failCount = 0;

        for (const work of selectedWork) {
            try {
                await saveTaskToFirestore({
                    id: work.id,
                    title: work.title,
                    dueDate: parseDueDate(work.dueDate, work.dueTime),
                    description: work.description,
                    courseId: work.courseId
                });
                successCount++;
            } catch (e) {
                console.error("저장 실패:", work.title, e);
                failCount++;
            }
        }

        // 결과 화면
        modalBody.innerHTML = `
            <div style="text-align:center; padding: 30px 0;">
                <p style="font-size:20px;">✅</p>
                <p style="font-size:16px; font-weight:bold;">${successCount}개 과제를 저장했습니다.</p>
                ${failCount > 0 ? `<p style="color:#e74c3c;">${failCount}개는 저장에 실패했습니다.</p>` : ''}
                <button class="cl-btn-primary" id="cl-close-btn" style="margin-top:20px;">닫기</button>
            </div>`;
        document.getElementById('cl-close-btn').addEventListener('click', closeModal);
    });
}


// ================================================================
// [메인 플로우] — 버튼 클릭 시 진입점
// ================================================================

async function startClassroomFlow() {
    openModal();
    showLoading("Google 계정 연결 중...");
    try {
        const token = await getValidToken();
        showLoading("클래스룸 목록 불러오는 중...");
        const courses = await fetchCourses(token);
        renderCourseList(courses);
    } catch (e) {
        console.error(e);
        showError("Google 연결에 실패했습니다. 다시 시도해주세요.");
    }
}

async function showCourseWork(courseId, courseName) {
    showLoading(`${courseName} 과제 불러오는 중...`);
    try {
        const token = await getValidToken(); // 이 시점에도 토큰 유효성 재확인
        const courseWork = await fetchCourseWork(token, courseId);
        renderCourseWorkList(courseWork, courseName);
    } catch (e) {
        console.error(e);
        showError("과제 목록을 불러오지 못했습니다.");
    }
}


// ================================================================
// [모달 열기/닫기]
// ================================================================

function openModal() {
    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
    modalBody.innerHTML = '';
}

// 모달 바깥 클릭 시 닫기
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});


// ================================================================
// [버튼 이벤트 등록]
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const importBtn = document.getElementById('classroom-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', startClassroomFlow);
    }
});
