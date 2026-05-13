// js/classroom.js
import { db } from './firebase-init.js';
import {
    doc, setDoc, getDoc, deleteDoc,
    collection, addDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const uid = localStorage.getItem('currentUserUid');
const CLIENT_ID = '779057546808-59940trcdab7uouqn1ro0bi8bf85cost.apps.googleusercontent.com';
const SCOPES = [
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.courses.readonly'
].join(' ');

let tokenClient;


// ================================================================
// [초기화]
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!uid) {
        console.error("UID가 없습니다. 로그인 상태를 확인하세요.");
        return;
    }

    if (typeof google !== 'undefined') {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (response) => {
                if (response.error) {
                    console.error("구글 인증 에러:", response.error);
                    alert("Google 인증 중 오류가 발생했습니다: " + response.error);
                    return;
                }
                await handleAuthSuccess(response);
            },
        });
    } else {
        console.error("Google GIS 라이브러리가 로드되지 않았습니다. index.html의 스크립트 태그를 확인하세요.");
    }

    // 설정 탭 UI 초기화
    await checkLinkStatus();

    // 버튼 이벤트 등록
    document.getElementById('btn-link-classroom')  ?.addEventListener('click', requestAuth);
    document.getElementById('btn-unlink-classroom') ?.addEventListener('click', unlinkAccount);
    document.getElementById('classroom-import-btn') ?.addEventListener('click', onImportBtnClick);

    // 모달 닫기
    document.getElementById('cl-modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('classroom-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'classroom-modal') closeModal();
    });
});


// ================================================================
// [설정 탭] 연동 상태 관리
// ================================================================

async function checkLinkStatus() {
    try {
        const docSnap = await getDoc(doc(db, `users/${uid}/settings/classroom`));

        const statusBadge = document.getElementById('link-status');
        const emailText   = document.getElementById('linked-email-display');
        const linkBtn     = document.getElementById('btn-link-classroom');
        const unlinkBtn   = document.getElementById('btn-unlink-classroom');

        if (docSnap.exists()) {
            const { email } = docSnap.data();
            if (statusBadge) { statusBadge.innerText = "연동됨"; statusBadge.className = "status-badge status-linked"; }
            if (emailText)   emailText.innerText = `연동된 계정: ${email}`;
            if (linkBtn)     linkBtn.innerText = "계정 변경하기";
            if (unlinkBtn)   unlinkBtn.style.display = "inline-block";
        } else {
            if (statusBadge) { statusBadge.innerText = "미연동"; statusBadge.className = "status-badge status-unlinked"; }
            if (emailText)   emailText.innerText = '';
            if (linkBtn)     linkBtn.innerText = "클래스룸 연동하기";
            if (unlinkBtn)   unlinkBtn.style.display = "none";
        }
    } catch (error) {
        console.error("Firestore 접근 실패:", error);
    }
}

function requestAuth() {
    if (tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        alert("Google 서비스 초기화 중입니다. 잠시 후 다시 시도해주세요.");
    }
}

// 인증 성공 → Google 계정 이메일 조회 후 Firestore 저장
async function handleAuthSuccess(tokenResponse) {
    try {
        // 동의한 Google 계정의 실제 이메일을 직접 조회
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        if (!userInfoRes.ok) throw new Error("사용자 정보 조회 실패");
        const { email } = await userInfoRes.json();

        // 토큰 + 이메일 + 만료 시각 저장 (55분 후 만료로 설정 — 5분 여유)
        await setDoc(doc(db, `users/${uid}/settings/classroom`), {
            email,
            access_token:  tokenResponse.access_token,
            token_expiry:  Date.now() + 55 * 60 * 1000,
            linkedAt:      new Date().toISOString()
        });

        alert(`${email} 계정으로 연동되었습니다.`);
        await checkLinkStatus();
    } catch (error) {
        console.error("연동 저장 실패:", error);
        alert("설정 저장 중 오류가 발생했습니다.");
    }
}

async function unlinkAccount() {
    if (confirm("연동을 해제하시겠습니까?\n저장된 토큰 정보가 삭제됩니다.")) {
        try {
            await deleteDoc(doc(db, `users/${uid}/settings/classroom`));
            alert("연동이 해제되었습니다.");
            await checkLinkStatus();
        } catch (error) {
            console.error("연동 해제 실패:", error);
            alert("연동 해제 중 오류가 발생했습니다.");
        }
    }
}


// ================================================================
// [토큰 관리] 유효성 확인 및 자동 갱신
// ================================================================

// Firestore에 저장된 토큰 확인 → 만료 시 자동 갱신 시도
async function getValidToken() {
    const docSnap = await getDoc(doc(db, `users/${uid}/settings/classroom`));

    if (!docSnap.exists()) throw new Error("NOT_LINKED");

    const { access_token, token_expiry } = docSnap.data();

    // 아직 유효하면 그대로 반환
    if (access_token && token_expiry && Date.now() < token_expiry) {
        return access_token;
    }

    // 만료됐으면 팝업 없이 자동 갱신 시도
    return await refreshTokenSilently();
}

function refreshTokenSilently() {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("tokenClient 미초기화"));

        const originalCallback = tokenClient.callback;

        tokenClient.callback = async (response) => {
            // callback 원복
            tokenClient.callback = originalCallback;

            if (response.error) {
                reject(new Error(response.error));
            } else {
                // Firestore의 토큰만 갱신 (이메일 등 나머지는 유지)
                await setDoc(doc(db, `users/${uid}/settings/classroom`), {
                    access_token: response.access_token,
                    token_expiry: Date.now() + 55 * 60 * 1000,
                }, { merge: true });
                resolve(response.access_token);
            }
        };

        // prompt 없이 요청 → 팝업 없이 갱신
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
            showNotLinkedMessage();
            return;
        }
        // 자동 갱신 실패 → 재동의 팝업
        showLoading("재인증이 필요합니다. 팝업을 확인해주세요...");
        try {
            token = await new Promise((resolve, reject) => {
                const originalCallback = tokenClient.callback;
                tokenClient.callback = async (response) => {
                    tokenClient.callback = originalCallback;
                    if (response.error) reject(new Error(response.error));
                    else { await handleAuthSuccess(response); resolve(response.access_token); }
                };
                tokenClient.requestAccessToken({ prompt: 'consent' });
            });
        } catch {
            showError("Google 인증에 실패했습니다. 설정 탭에서 다시 연동해주세요.");
            return;
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

// Google Classroom dueDate(UTC) → JS Date
function parseDueDate(dueDate, dueTime) {
    if (!dueDate) return null;
    const { year, month, day } = dueDate;
    return new Date(Date.UTC(year, month - 1, day, dueTime?.hours ?? 23, dueTime?.minutes ?? 59));
}


// ================================================================
// [Firestore 저장]
// ================================================================

async function saveTaskToFirestore(work) {
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

function showLoading(message = "불러오는 중...") {
    document.getElementById('classroom-modal-body').innerHTML = `
        <div style="text-align:center; padding:40px 0;">
            <div class="cl-spinner"></div>
            <p style="margin-top:16px; color:#555;">${message}</p>
        </div>`;
}

function showError(message) {
    document.getElementById('classroom-modal-body').innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <p style="color:#e74c3c; font-size:15px;">⚠️ ${message}</p>
            <button class="cl-btn-secondary" id="cl-err-close" style="margin-top:16px;">닫기</button>
        </div>`;
    document.getElementById('cl-err-close').addEventListener('click', closeModal);
}

function showNotLinkedMessage() {
    document.getElementById('classroom-modal-body').innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <p style="font-size:15px; color:#555;">Google 클래스룸이 연동되지 않았습니다.</p>
            <p style="font-size:13px; color:#888;">설정 탭에서 먼저 계정을 연동해주세요.</p>
            <button class="cl-btn-secondary" id="cl-go-settings" style="margin-top:16px;">설정으로 이동</button>
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
        <p style="margin:0 0 14px; font-size:14px; color:#555;">가져올 과제가 있는 수업을 선택하세요.</p>
        <div class="cl-list">
            ${courses.map(c => `
                <div class="cl-list-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
                    <span class="cl-item-name">${escapeHtml(c.name)}</span>
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
            <p style="margin:12px 0 14px; font-size:14px; color:#555;">
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
            const selected    = courseWork.filter(w => selectedIds.has(w.id));

            showLoading("과제를 저장하는 중...");

            let ok = 0, fail = 0;
            for (const w of selected) {
                try {
                    await saveTaskToFirestore({
                        id: w.id, title: w.title,
                        dueDate:     parseDueDate(w.dueDate, w.dueTime),
                        description: w.description,
                        courseId:    w.courseId
                    });
                    ok++;
                } catch (e) {
                    console.error("저장 실패:", w.title, e);
                    fail++;
                }
            }

            document.getElementById('classroom-modal-body').innerHTML = `
                <div style="text-align:center; padding:30px 0;">
                    <p style="font-size:22px;"></p>
                    <p style="font-size:16px; font-weight:bold;">${ok}개 과제를 저장했습니다.</p>
                    ${fail > 0 ? `<p style="color:#e74c3c;font-size:13px;">${fail}개는 저장에 실패했습니다.</p>` : ''}
                    <button class="cl-btn-primary" id="cl-done" style="margin-top:20px;">닫기</button>
                </div>`;
            document.getElementById('cl-done').addEventListener('click', closeModal);
        });

    } catch (e) {
        console.error(e);
        showError("과제 목록을 불러오지 못했습니다.");
    }
}

function escapeHtml(str = '') {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
