// js/classroom.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

// ⚠️ 본인의 실제 구글 클라이언트 ID로 반드시 변경하세요!
const CLIENT_ID = '779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com'; 

let tokenClient;
let uid = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 실행 시점에 다시 한 번 가져오기
    uid = localStorage.getItem('currentUserUid');
    console.log("[Classroom] 페이지 로드됨. UID:", uid);
    
    if (!uid) {
        // 만약 로그인이 늦게 처리될 수 있으므로 약간의 지연 후 재확인 시도
        setTimeout(async () => {
            uid = localStorage.getItem('currentUserUid');
            if (uid) {
                await initClassroom();
            } else {
                console.warn("[Classroom] UID가 없습니다. 로그인이 필요합니다.");
            }
        }, 1000);
    } else {
        await initClassroom();
    }
});

async function initClassroom() {
    if (!uid) return;

    // 1. UI 상태 업데이트
    await updateClassroomUI();

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
    const importBtn = document.getElementById('classroom-import-btn');
    if (importBtn) importBtn.addEventListener('click', onImportBtnClick);
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
            token_expiry: Date.now() + 55 * 60 * 1000,
            linkedAt: new Date().toISOString()
        });
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
// ================================================================
// [토큰 관리] 유효성 확인 및 자동 갱신
// ================================================================

async function getValidToken() {
    const docSnap = await getDoc(doc(db, `users/${uid}/settings/classroom`));
    if (!docSnap.exists()) throw new Error("NOT_LINKED");

    const { access_token, token_expiry } = docSnap.data();

    // 토큰이 유효하면 그대로 반환
    if (access_token && token_expiry && Date.now() < token_expiry) {
        return access_token;
    }
    // 만료됐으면 팝업 없이 자동 갱신
    return await refreshTokenSilently();
}

function refreshTokenSilently() {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("tokenClient 미초기화"));
        const originalCallback = tokenClient.callback;
        tokenClient.callback = async (response) => {
            tokenClient.callback = originalCallback;
            if (response.error) {
                reject(new Error(response.error));
            } else {
                await setDoc(doc(db, `users/${uid}/settings/classroom`), {
                    access_token: response.access_token,
                    token_expiry: Date.now() + 55 * 60 * 1000,
                }, { merge: true });
                resolve(response.access_token);
            }
        };
        tokenClient.requestAccessToken({ prompt: '' });
    });
}


// ================================================================
// [과제/공지 탭] 가져오기 플로우
// ================================================================

async function onImportBtnClick() {
    openModal();
    showLoading("Google 계정 확인 중...");
    let token;
    try {
        token = await getValidToken();
    } catch (e) {
        if (e.message === "NOT_LINKED") {
            showNotLinkedMessage(); return;
        }
        // 자동 갱신 실패 시 재동의 팝업
        showLoading("재인증이 필요합니다. 팝업을 확인해주세요...");
        try {
            token = await new Promise((resolve, reject) => {
                const original = tokenClient.callback;
                tokenClient.callback = async (r) => {
                    tokenClient.callback = original;
                    if (r.error) reject(new Error(r.error));
                    else { await handleAuthSuccess(r); resolve(r.access_token); }
                };
                tokenClient.requestAccessToken({ prompt: 'consent' });
            });
        } catch {
            showError("Google 인증에 실패했습니다. 설정 탭에서 다시 연동해주세요."); return;
        }
    }
    showLoading("클래스룸 목록 불러오는 중...");
    try {
        const courses = await fetchCourses(token);
        renderCourseList(courses, token);
    } catch (e) {
        console.error(e);
        showError("클래스룸 목록을 불러오지 못했습니다.");
    }
}


// ================================================================
// [Classroom API 호출]
// ================================================================

async function fetchCourses(token) {
    const res = await fetch(
        "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE",
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`courses API 오류: ${res.status}`);
    return (await res.json()).courses || [];
}

async function fetchCourseWork(token, courseId) {
    const res = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?orderBy=dueDate%20desc`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`courseWork API 오류: ${res.status}`);
    return (await res.json()).courseWork || [];
}

function parseDueDate(dueDate, dueTime) {
    if (!dueDate) return null;
    const { year, month, day } = dueDate;
    return new Date(Date.UTC(year, month - 1, day, dueTime?.hours ?? 23, dueTime?.minutes ?? 59));
}


// ================================================================
// [Firestore 저장]
// ================================================================

async function saveTaskToFirestore(work) {
    const { addDoc, collection, Timestamp } = await import(
        "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js"
    );
    await addDoc(collection(db, "users", uid, "tasks"), {
        title:       work.title,
        dueDate:     work.dueDate ? Timestamp.fromDate(work.dueDate) : null,
        isCompleted: false,
        memo:        work.description || "",
        source:      "classroom",
        courseId:    work.courseId,
        classroomId: work.id
    });
}


// ================================================================
// [모달 UI]
// ================================================================

function openModal()  { document.getElementById('classroom-modal').style.display = 'flex'; }
function closeModal() {
    document.getElementById('classroom-modal').style.display = 'none';
    document.getElementById('classroom-modal-body').innerHTML = '';
}

function showLoading(msg = "불러오는 중...") {
    document.getElementById('classroom-modal-body').innerHTML = `
        <div style="text-align:center;padding:40px 0;">
            <div class="cl-spinner"></div>
            <p style="margin-top:16px;color:#555;">${msg}</p>
        </div>`;
}

function showError(msg) {
    document.getElementById('classroom-modal-body').innerHTML = `
        <div style="text-align:center;padding:30px 0;">
            <p style="color:#e74c3c;font-size:15px;">⚠️ ${msg}</p>
            <button class="cl-btn-back" id="cl-err-close" style="margin-top:16px;">닫기</button>
        </div>`;
    document.getElementById('cl-err-close').addEventListener('click', closeModal);
}

function showNotLinkedMessage() {
    document.getElementById('classroom-modal-body').innerHTML = `
        <div style="text-align:center;padding:30px 0;">
            <p style="font-size:15px;color:#555;">Google 클래스룸이 연동되지 않았습니다.</p>
            <p style="font-size:13px;color:#888;">설정 탭에서 먼저 계정을 연동해주세요.</p>
            <button class="cl-btn-back" id="cl-go-settings" style="margin-top:16px;">설정으로 이동</button>
        </div>`;
    document.getElementById('cl-go-settings').addEventListener('click', () => {
        closeModal();
        document.querySelector('[data-target="settings"]')?.click();
    });
}

function renderCourseList(courses, token) {
    if (courses.length === 0) {
        document.getElementById('classroom-modal-body').innerHTML =
            `<p style="text-align:center;padding:30px;color:#888;">활성화된 클래스룸이 없습니다.</p>`;
        return;
    }
    document.getElementById('classroom-modal-body').innerHTML = `
        <p style="margin:0 0 14px;font-size:14px;color:#555;">가져올 과제가 있는 수업을 선택하세요.</p>
        <div class="cl-list">
            ${courses.map(c => `
                <div class="cl-list-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
                    <span class="cl-course-name">${escapeHtml(c.name)}</span>
                    <span class="cl-arrow">›</span>
                </div>`).join('')}
        </div>`;
    document.querySelectorAll('.cl-list-item').forEach(item => {
        item.addEventListener('click', () => showCourseWork(item.dataset.id, item.dataset.name, token));
    });
}

async function showCourseWork(courseId, courseName, token) {
    showLoading(`${courseName} 과제 불러오는 중...`);
    try {
        const validToken = await getValidToken().catch(() => token);
        const courseWork = await fetchCourseWork(validToken, courseId);

        if (courseWork.length === 0) {
            document.getElementById('classroom-modal-body').innerHTML = `
                <button class="cl-btn-back" id="cl-back">← 수업 목록으로</button>
                <p style="text-align:center;padding:30px;color:#888;">등록된 과제가 없습니다.</p>`;
            document.getElementById('cl-back').addEventListener('click', async () => {
                showLoading("수업 목록 불러오는 중...");
                const t = await getValidToken().catch(() => token);
                renderCourseList(await fetchCourses(t), t);
            });
            return;
        }

        document.getElementById('classroom-modal-body').innerHTML = `
            <button class="cl-btn-back" id="cl-back">← 수업 목록으로</button>
            <p style="margin:12px 0 14px;font-size:14px;color:#555;">
                <strong>${escapeHtml(courseName)}</strong> — 가져올 과제를 선택하세요.
            </p>
            <div class="cl-list">
                ${courseWork.map(w => {
                    const due = parseDueDate(w.dueDate, w.dueTime);
                    const dueStr = due
                        ? due.toLocaleDateString('ko-KR', { month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
                        : '기한 없음';
                    return `
                    <label class="cl-list-item cl-checkable">
                        <input type="checkbox" class="cl-checkbox" value="${w.id}">
                        <div class="cl-work-info">
                            <span class="cl-work-title">${escapeHtml(w.title)}</span>
                            <span class="cl-work-due">📅 ${dueStr}</span>
                        </div>
                    </label>`;
                }).join('')}
            </div>
            <button class="cl-btn-primary" id="cl-import-confirm" style="width:100%;margin-top:16px;">
                선택한 과제 가져오기
            </button>`;

        document.getElementById('cl-back').addEventListener('click', async () => {
            showLoading("수업 목록 불러오는 중...");
            const t = await getValidToken().catch(() => token);
            renderCourseList(await fetchCourses(t), t);
        });

        document.getElementById('cl-import-confirm').addEventListener('click', async () => {
            const checked = [...document.querySelectorAll('.cl-checkbox:checked')];
            if (checked.length === 0) return alert("과제를 1개 이상 선택해주세요.");
            const selectedIds = new Set(checked.map(cb => cb.value));
            const selected = courseWork.filter(w => selectedIds.has(w.id));

            showLoading("과제를 저장하는 중...");
            let ok = 0, fail = 0;
            for (const w of selected) {
                try {
                    await saveTaskToFirestore({
                        id: w.id, title: w.title,
                        dueDate: parseDueDate(w.dueDate, w.dueTime),
                        description: w.description, courseId: w.courseId
                    });
                    ok++;
                } catch (e) {
                    console.error("저장 실패:", w.title, e); fail++;
                }
            }
            document.getElementById('classroom-modal-body').innerHTML = `
                <div style="text-align:center;padding:30px 0;">
                    <p style="font-size:22px;">✅</p>
                    <p style="font-size:16px;font-weight:bold;">${ok}개 과제를 저장했습니다.</p>
                    ${fail > 0 ? `<p style="color:#e74c3c;font-size:13px;">${fail}개는 저장에 실패했습니다.</p>` : ''}
                    <button class="cl-btn-primary" id="cl-done" style="margin-top:20px;">닫기</button>
                </div>`;
            document.getElementById('cl-done').addEventListener('click', closeModal);
        });
    } catch (e) {
        console.error(e); showError("과제 목록을 불러오지 못했습니다.");
    }
}

function escapeHtml(str = '') {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
