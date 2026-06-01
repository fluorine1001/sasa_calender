// js/sasadomi.js
import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let savedSasaId = null;
let savedSasaToken = null;

// ==========================================
// ⚠️ [필수 기입] 개발자님의 실제 백엔드 서버 환경에 맞게 수정하세요!
// ==========================================
const API_BASE_URL = 'https://sasadomi-system.vercel.app'; 
const API_KEY = 'sasa_dev_497a738259f6cd256b737c2a24073dca8b3681c9b2352b2d'; 

function initSasadomi() {
    console.log("[Sasadomi] 모듈 통합 초기화 엔진 가동...");

    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            await checkSasaIntegrationStatus();
        } else {
            currentUid = null;
            savedSasaId = null;
            savedSasaToken = null;
        }
    });

    const modal = document.getElementById('sasa-auth-modal');
    const closeBtn = document.getElementById('btn-close-sasa-modal');
    const cancelBtn = document.getElementById('btn-cancel-sasa-auth');
    const form = document.getElementById('sasa-credential-form');

    const closeModal = () => {
        if (modal) modal.style.display = 'none';
        if (form) form.reset(); 
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const actionGroup = document.getElementById('sasa-action-group');
    if (actionGroup) {
        actionGroup.addEventListener('click', async (e) => {
            if (e.target.id === 'btn-open-sasa-modal') {
                if (modal) modal.style.display = 'flex';
            } else if (e.target.id === 'btn-disconnect-sasa') {
                if (confirm("정말로 사사도미 계정 연동을 해제하시겠습니까?\n서버에 보관된 암호화 세션 정보가 즉시 파기됩니다.")) {
                    await handleSasaDisconnect();
                }
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUid) return alert("로그인이 필요합니다.");

            const sasaId = document.getElementById('sasa-input-id').value.trim();
            const sasaPw = document.getElementById('sasa-input-pw').value;

            if (!/^s\d{10}$/.test(sasaId)) return alert("올바른 학번 형식(11자리, 예: s2026010701)을 제공해주세요.");
            if (!sasaPw) return alert("비밀번호를 입력해주세요.");

            try {
                const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
                    body: JSON.stringify({ studentId: sasaId, studentPw: sasaPw })
                });

                const data = await response.json();

                if (data.success && data.sessionToken) {
                    const userConfigRef = doc(db, "users", currentUid);
                    await setDoc(userConfigRef, {
                        isSasaLinked: true,
                        sasaStudentId: sasaId,
                        sasaToken: data.sessionToken,
                        sasaLinkedAt: serverTimestamp()
                    }, { merge: true });
                    
                    alert("사사도미 계정이 성공적으로 연동되었습니다!");
                    closeModal();
                    await checkSasaIntegrationStatus(); 
                } else {
                    alert(data.message || "연동 실패: 학번 또는 비밀번호를 다시 확인하세요.");
                }
            } catch (error) {
                console.error("사사도미 연동 API 통신 에러:", error);
                alert("기숙사 시스템 서버와 통신하는 중 내부 오류가 발생했습니다.");
            }
        });
    }

    setupApplicationButtons();
    setupApplicationListToggles(); 
}

async function checkSasaIntegrationStatus() {
    if (!currentUid) return;
    
    const userDocRef = doc(db, "users", currentUid);
    const docSnap = await getDoc(userDocRef);
    
    const badge = document.getElementById('sasa-link-badge');
    const userMeta = document.getElementById('sasa-user-meta');
    const actionGroup = document.getElementById('sasa-action-group');
    const unlinkedOverlay = document.getElementById('sasa-unlinked-overlay');
    const linkedContent = document.getElementById('sasa-linked-content');

    if (docSnap.exists() && docSnap.data().isSasaLinked && docSnap.data().sasaToken) {
        const userData = docSnap.data();
        savedSasaId = userData.sasaStudentId;
        savedSasaToken = userData.sasaToken;

        if (badge) {
            badge.innerText = "연동 완료";
            badge.className = "status-badge status-linked";
        }
        if (userMeta) userMeta.innerHTML = `✅ 연동된 기숙사 계정: <span style="color:#1a73e8; font-weight:bold;">${savedSasaId}</span>`;
        if (actionGroup) actionGroup.innerHTML = `<button id="btn-disconnect-sasa" class="cl-btn-secondary" style="background-color:#ea4335; color:#fff; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:600;">연동 해제하기</button>`;

        if (unlinkedOverlay) unlinkedOverlay.style.display = 'none';
        if (linkedContent) linkedContent.style.display = 'grid';
    } else {
        savedSasaId = null;
        savedSasaToken = null;

        if (badge) {
            badge.innerText = "미연동";
            badge.className = "status-badge status-unlinked";
        }
        if (userMeta) userMeta.innerText = "연동된 계정 정보가 없습니다.";
        if (actionGroup) actionGroup.innerHTML = `<button id="btn-open-sasa-modal" class="cl-btn-primary">계정 연동하기</button>`;

        if (unlinkedOverlay) unlinkedOverlay.style.display = 'block';
        if (linkedContent) linkedContent.style.display = 'none';
    }
}

async function handleSasaDisconnect() {
    if (!currentUid || !savedSasaId) return;

    try {
        await fetch(`${API_BASE_URL}/v1/auth/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ studentId: savedSasaId, token: savedSasaToken })
        });
    } catch (e) {
        console.warn("백엔드 세션 파기 실패:", e);
    }

    try {
        const userConfigRef = doc(db, "users", currentUid);
        await setDoc(userConfigRef, {
            isSasaLinked: false, sasaStudentId: null, sasaToken: null, sasaLinkedAt: null
        }, { merge: true });

        alert("사사도미 시스템 연동이 완전히 해제되었습니다.");
        await checkSasaIntegrationStatus();
    } catch (error) {
        console.error("Firestore 초기화 실패:", error);
    }
}

async function loadSasadomiData() {
    if (!savedSasaId || !savedSasaToken) return;

    const scoreDisplay = document.getElementById('total-score');
    const statusText = document.getElementById('score-status-text');
    const penaltyListContainer = document.getElementById('penalty-list');

    if (statusText) statusText.innerText = "기숙사 서버 크롤링 중...";

    try {
        const url = `${API_BASE_URL}/v1/points?studentId=${savedSasaId}&token=${savedSasaToken}`;
        const response = await fetch(url, { method: 'GET', headers: { 'x-api-key': API_KEY } });
        const data = await response.json();

        if (data.success) {
            const netScore = data.totalReward - data.totalPenalty;
            if (scoreDisplay) {
                scoreDisplay.innerText = netScore;
                scoreDisplay.style.color = netScore >= 0 ? '#1a73e8' : '#d93025';
            }
            if (statusText) statusText.innerHTML = `상점 <span style="color:#34a853; font-weight:bold;">${data.totalReward}점</span> / 벌점 <span style="color:#ea4335; font-weight:bold;">${data.totalPenalty}점</span>`;

            let listHtml = '';
            if (data.rewardList && data.rewardList.length > 0) {
                data.rewardList.forEach(item => {
                    listHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9; font-size:13px;">
                            <span style="color:#34a853; font-weight:bold; width:65px; flex-shrink:0;">[상점 +${item.score}]</span>
                            <div style="flex:1; padding:0 8px;">
                                <div style="font-weight:600; color:#334155;">${item.reason}</div>
                                <div style="font-size:11px; color:#64748b;">${item.comment || ''}</div>
                            </div>
                            <span style="color:#94a3b8; font-size:11px; flex-shrink:0;">${item.date}</span>
                        </div>`;
                });
            }

            if (data.penaltyList && data.penaltyList.length > 0) {
                data.penaltyList.forEach(item => {
                    listHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9; font-size:13px;">
                            <span style="color:#ea4335; font-weight:bold; width:65px; flex-shrink:0;">[벌점 -${item.score}]</span>
                            <div style="flex:1; padding:0 8px;">
                                <div style="font-weight:600; color:#334155; ">${item.reason}</div>
                                <div style="font-size:11px; color:#64748b;">${item.comment || ''}</div>
                            </div>
                            <span style="color:#94a3b8; font-size:11px; flex-shrink:0;">${item.date}</span>
                        </div>`;
                });
            }

            if (penaltyListContainer) penaltyListContainer.innerHTML = listHtml || '<p style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">깨끗합니다! 부여된 상벌점 내역이 없습니다.</p>';
        } else {
            if (statusText) statusText.innerText = "데이터를 가져오지 못했습니다: " + data.message;
        }
    } catch (error) {
        if (statusText) statusText.innerText = "기숙사 서버 네트워크 연결 장애";
    }
}

// ==========================================
// 📋 [기능 5] 자율학습 / 외출 신청 내역 조회, 토글 및 삭제 기능
// ==========================================
function setupApplicationListToggles() {
    const toggleStudy = document.getElementById('toggle-study-list');
    const containerStudy = document.getElementById('study-list-container');
    const iconStudy = document.getElementById('study-toggle-icon');

    const toggleOut = document.getElementById('toggle-out-list');
    const containerOut = document.getElementById('out-list-container');
    const iconOut = document.getElementById('out-toggle-icon');

    const btnRefreshApps = document.getElementById('btn-refresh-apps');

    if (toggleStudy) {
        toggleStudy.addEventListener('click', () => {
            const isHidden = containerStudy.style.display === 'none';
            containerStudy.style.display = isHidden ? 'block' : 'none';
            iconStudy.innerText = isHidden ? '▲' : '▼';
        });
    }

    if (toggleOut) {
        toggleOut.addEventListener('click', () => {
            const isHidden = containerOut.style.display === 'none';
            containerOut.style.display = isHidden ? 'block' : 'none';
            iconOut.innerText = isHidden ? '▲' : '▼';
        });
    }

    if (btnRefreshApps) {
        btnRefreshApps.addEventListener('click', () => {
            btnRefreshApps.innerText = "불러오는 중...";
            btnRefreshApps.disabled = true;
            loadApplicationData().finally(() => {
                btnRefreshApps.innerText = "새로고침";
                btnRefreshApps.disabled = false;
            });
        });
    }
}

function getStatusBadgeHtml(status) {
    if (status.includes('승인')) return `<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">${status}</span>`;
    if (status.includes('거절') || status.includes('반려') || status.includes('삭제')) return `<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">${status}</span>`;
    return `<span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">${status}</span>`; // 대기
}

async function loadApplicationData() {
    if (!savedSasaId || !savedSasaToken) return;

    const studyContainer = document.getElementById('study-list-container');
    const outContainer = document.getElementById('out-list-container');
    
    // 💡 시각적 즉각 반응을 위한 로딩 UI 삽입
    if (studyContainer) studyContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:15px;">데이터 갱신 중...⏳</div>';
    if (outContainer) outContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:15px;">데이터 갱신 중...⏳</div>';

    try {
        const url = `${API_BASE_URL}/v1/applications?studentId=${savedSasaId}&token=${savedSasaToken}`;
        const response = await fetch(url, { method: 'GET', headers: { 'x-api-key': API_KEY } });
        const data = await response.json();

        if (data.success) {
            // 1. 자율학습 내역 렌더링 (모두 삭제 가능)
            if (studyContainer) {
                if (!data.studyList || data.studyList.length === 0) {
                    studyContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:15px;">신청 내역이 없습니다.</div>';
                } else {
                    studyContainer.innerHTML = data.studyList.map(item => `
                        <div style="padding:10px 5px; border-bottom:1px solid #f1f5f9; font-size:13px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <span style="font-weight:600; color:#334155;">${item.date} [${item.time}]</span>
                                ${getStatusBadgeHtml(item.status)}
                            </div>
                            <div style="color:#64748b; font-size:12px;">📍 ${item.place} ${item.teacher ? `(지도: ${item.teacher})` : ''}</div>
                            ${item.detail ? `<div style="color:#94a3b8; font-size:11px; margin-top:3px;">📝 사유: ${item.detail}</div>` : ''}
                            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:6px;">
                                <button onclick="window.deleteSasaApplication('study', '${item.id}')" style="background:#fee2e2; color:#991b1b; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🗑️ 삭제/취소</button>
                                <div style="color:#cbd5e1; font-size:10px; text-align:right;">신청일시: ${item.applyDate}</div>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // 2. 외출/외박 내역 렌더링 (승인된 내역은 삭제 불가)
            if (outContainer) {
                if (!data.outList || data.outList.length === 0) {
                    outContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:15px;">신청 내역이 없습니다.</div>';
                } else {
                    outContainer.innerHTML = data.outList.map(item => {
                        const isApproved = item.status.includes('승인');
                        const deleteBtnHtml = isApproved 
                            ? `<span style="font-size:11px; color:#94a3b8; font-weight:600;">승인됨 (삭제불가)</span>`
                            : `<button onclick="window.deleteSasaApplication('out', '${item.id}')" style="background:#fee2e2; color:#991b1b; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🗑️ 삭제/취소</button>`;

                        return `
                        <div style="padding:10px 5px; border-bottom:1px solid #f1f5f9; font-size:13px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <span style="font-weight:600; color:#334155;">[${item.type}] ${item.reason}</span>
                                ${getStatusBadgeHtml(item.status)}
                            </div>
                            <div style="color:#64748b; font-size:12px;">출발: <span style="color:#2563eb; font-weight:500;">${item.outDate}</span></div>
                            <div style="color:#64748b; font-size:12px;">귀교: <span style="color:#e11d48; font-weight:500;">${item.inDate}</span></div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:6px;">
                                ${deleteBtnHtml}
                                <div style="color:#cbd5e1; font-size:10px; text-align:right;">신청일시: ${item.applyDate}</div>
                            </div>
                        </div>
                        `;
                    }).join('');
                }
            }
        }
    } catch (e) {
        if (studyContainer) studyContainer.innerHTML = `<div style="color:#ef4444; font-size:12px; text-align:center; padding:10px;">데이터 로드 실패</div>`;
        if (outContainer) outContainer.innerHTML = `<div style="color:#ef4444; font-size:12px; text-align:center; padding:10px;">데이터 로드 실패</div>`;
    }
}

// 🗑️ 동적으로 렌더링된 삭제 버튼에서 호출할 전역 함수 바인딩
window.deleteSasaApplication = async function(type, id) {
    if (!savedSasaId || !savedSasaToken) return alert("인증 정보가 없습니다.");
    if (!confirm("정말로 이 신청 내역을 삭제/취소하시겠습니까?")) return;

    try {
        const response = await fetch(`${API_BASE_URL}/v1/applications/${type}/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ studentId: savedSasaId, token: savedSasaToken })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert("✅ 정상적으로 취소 및 삭제되었습니다.");
            // 💡 삭제 성공 후 자동으로 목록 새로고침 (await 추가)
            await loadApplicationData(); 
        } else {
            alert("❌ 삭제 실패: " + data.message);
        }
    } catch (e) {
        console.error("삭제 요청 에러:", e);
        alert("서버 연결에 실패했습니다.");
    }
};

// ==========================================
// ⚙️ [공통] 메타데이터 및 신청 대행 UI 유틸
// ==========================================
let sasaMetaCache = null;

async function fetchSasaMetaOptions() {
    if (sasaMetaCache) return sasaMetaCache;
    try {
        const response = await fetch(`${API_BASE_URL}/v1/meta/options`, { method: 'GET', headers: { 'x-api-key': API_KEY } });
        const data = await response.json();
        if (data.success) {
            sasaMetaCache = data;
            return data;
        } else {
            throw new Error("메타데이터 로드 실패");
        }
    } catch (e) {
        alert("신청 옵션 데이터를 불러오지 못했습니다.");
        return null;
    }
}

function getUnixTimestampSeconds(dateStr, timeStr = "00:00") {
    const dateObj = new Date(`${dateStr}T${timeStr}:00+09:00`);
    return Math.floor(dateObj.getTime() / 1000);
}

function getOrCreateDynamicModal() {
    let modal = document.getElementById('sasa-dynamic-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sasa-dynamic-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:2000; align-items:center; justify-content:center;';
        document.body.appendChild(modal);
    }
    return modal;
}

function setupApplicationButtons() {
    const btnToggleStudy = document.getElementById('btn-toggle-study');
    if (btnToggleStudy) {
        btnToggleStudy.addEventListener('click', async () => {
            if (!savedSasaId || !savedSasaToken) return alert("🔒 사사도미 계정 연동이 필요합니다.");

            btnToggleStudy.innerText = "⏳ 옵션 로딩 중...";
            const meta = await fetchSasaMetaOptions();
            btnToggleStudy.innerText = "자습 신청 대행";
            if (!meta) return;

            const today = new Date().toLocaleDateString('en-CA'); 
            const modal = getOrCreateDynamicModal();
            modal.innerHTML = `
                <div class="cl-modal-box" style="width:400px; background:#fff; border-radius:12px; overflow:hidden;">
                    <div class="cl-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:15px 20px;">
                        <h3 style="margin:0; font-size:16px; color:#1e293b; display:flex; justify-content:space-between; align-items:center;">
                            🌙 야간 자율학습 신청
                            <button class="cl-modal-close" onclick="document.getElementById('sasa-dynamic-modal').style.display='none'" style="background:none; border:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
                        </h3>
                    </div>
                    <form id="study-apply-form" style="padding:20px; display:flex; flex-direction:column; gap:15px;">
                        <div>
                            <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:5px;">신청 날짜</label>
                            <input type="date" id="study-date" value="${today}" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:5px;">교시 선택</label>
                            <select id="study-time" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                                ${meta.studyTimes.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:5px;">학습 장소</label>
                            <select id="study-place" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                                ${meta.studyPlaces.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
                            </select>
                        </div>
                        <div id="teacher-wrapper" style="display:none; background:#fef2f2; padding:10px; border-radius:6px; border:1px solid #fecaca;">
                            <label style="font-size:13px; font-weight:600; color:#b91c1c; display:block; margin-bottom:5px;">지도 교사 (본관 신청시 필수)</label>
                            <select id="study-teacher" style="width:100%; padding:10px; border:1px solid #fca5a5; border-radius:6px; box-sizing:border-box;">
                                <option value="">선택하세요</option>
                                ${meta.teachers.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:5px;">기타 사유</label>
                            <input type="text" id="study-reason" placeholder="필요시 작성" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                        </div>
                        <button type="submit" class="cl-btn-primary" style="margin-top:5px; background:#3b82f6; color:white; padding:12px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;">신청 제출하기</button>
                    </form>
                </div>
            `;
            modal.style.display = 'flex';

            const placeSelect = document.getElementById('study-place');
            const teacherWrapper = document.getElementById('teacher-wrapper');
            placeSelect.addEventListener('change', (e) => {
                teacherWrapper.style.display = e.target.value === '3' ? 'block' : 'none';
            });

            document.getElementById('study-apply-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const dateVal = document.getElementById('study-date').value;
                const timeVal = document.getElementById('study-time').value;
                const placeVal = document.getElementById('study-place').value;
                const teacherVal = placeVal === '3' ? document.getElementById('study-teacher').value : '';
                const reasonVal = document.getElementById('study-reason').value;

                if (placeVal === '3' && !teacherVal) return alert("본관 신청 시 지도교사를 선택해야 합니다.");

                const unixDate = getUnixTimestampSeconds(dateVal); 
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerText;
                submitBtn.disabled = true;
                submitBtn.innerText = "요청 처리 중...";

                try {
                    const res = await fetch(`${API_BASE_URL}/v1/applications/study`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
                        body: JSON.stringify({
                            studentId: savedSasaId, token: savedSasaToken,
                            date: unixDate, time: timeVal, place: placeVal, detail: teacherVal, detail_reason: reasonVal
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert("✅ 자율학습 신청이 완료되었습니다!");
                        modal.style.display = 'none';
                        // 💡 신청 성공 후 자동으로 목록 새로고침 (await 추가)
                        await loadApplicationData(); 
                    } else {
                        alert("❌ 실패: " + data.message);
                    }
                } catch (err) {
                    alert("서버 연결에 실패했습니다.");
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
            });
        });
    }

    const btnApplyOuting = document.getElementById('btn-apply-outing');
    if (btnApplyOuting) {
        btnApplyOuting.addEventListener('click', async () => {
            if (!savedSasaId || !savedSasaToken) return alert("🔒 사사도미 계정 연동이 필요합니다.");

            btnApplyOuting.innerText = "⏳ 옵션 로딩 중...";
            const meta = await fetchSasaMetaOptions();
            btnApplyOuting.innerText = "외출 신청 작성";
            if (!meta) return;

            const today = new Date().toLocaleDateString('en-CA'); 
            const modal = getOrCreateDynamicModal();
            modal.innerHTML = `
                <div class="cl-modal-box" style="width:420px; background:#fff; border-radius:12px; overflow:hidden;">
                    <div class="cl-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:15px 20px;">
                        <h3 style="margin:0; font-size:16px; color:#1e293b; display:flex; justify-content:space-between; align-items:center;">
                            🚶 외출/외박 신청
                            <button class="cl-modal-close" onclick="document.getElementById('sasa-dynamic-modal').style.display='none'" style="background:none; border:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
                        </h3>
                    </div>
                    <form id="outing-apply-form" style="padding:20px; display:flex; flex-direction:column; gap:15px;">
                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:5px;">종류</label>
                                <select id="out-type" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                                    <option value="1">외출</option>
                                    <option value="2">외박</option>
                                </select>
                            </div>
                            <div style="flex:2;">
                                <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:5px;">사유</label>
                                <input type="text" id="out-reason" required placeholder="예: 병원 진료" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                            </div>
                        </div>
                        
                        <div style="background:#f1f5f9; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                            <label style="font-size:13px; font-weight:bold; color:#0f172a; display:block; margin-bottom:8px;">출발 (나가는 시간)</label>
                            <div style="display:flex; gap:8px;">
                                <input type="date" id="out-start-date" value="${today}" required style="flex:2; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                                <select id="out-start-time" required style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                                    ${meta.outTimes.map(t => `<option value="${t}">${t}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div style="background:#fff1f2; padding:15px; border-radius:8px; border:1px solid #ffe4e6;">
                            <label style="font-size:13px; font-weight:bold; color:#be123c; display:block; margin-bottom:8px;">귀교 (돌아오는 시간)</label>
                            <div style="display:flex; gap:8px;">
                                <input type="date" id="out-end-date" value="${today}" required style="flex:2; padding:8px; border:1px solid #fecdd3; border-radius:6px; box-sizing:border-box;">
                                <select id="out-end-time" required style="flex:1; padding:8px; border:1px solid #fecdd3; border-radius:6px; box-sizing:border-box;">
                                    ${meta.outTimes.map(t => `<option value="${t}" ${t==='18:00'?'selected':''}>${t}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <button type="submit" class="cl-btn-primary" style="margin-top:5px; background:#e11d48; color:white; padding:12px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;">결재 상신하기</button>
                    </form>
                </div>
            `;
            modal.style.display = 'flex';

            document.getElementById('outing-apply-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const typeVal = document.getElementById('out-type').value;
                const reasonVal = document.getElementById('out-reason').value;
                
                const bdateUnix = getUnixTimestampSeconds(document.getElementById('out-start-date').value, document.getElementById('out-start-time').value);
                const edateUnix = getUnixTimestampSeconds(document.getElementById('out-end-date').value, document.getElementById('out-end-time').value);

                if (bdateUnix >= edateUnix) return alert("귀교 시간이 출발 시간보다 빠르거나 같을 수 없습니다.");
                
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerText;
                submitBtn.disabled = true;
                submitBtn.innerText = "요청 처리 중...";

                try {
                    const res = await fetch(`${API_BASE_URL}/v1/applications/out`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
                        body: JSON.stringify({
                            studentId: savedSasaId, token: savedSasaToken,
                            type: typeVal, reason: reasonVal, bdate: bdateUnix, edate: edateUnix
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert("✅ 외출/외박 신청이 성공적으로 접수되었습니다!");
                        modal.style.display = 'none';
                        // 💡 신청 성공 후 자동으로 목록 새로고침 (await 추가)
                        await loadApplicationData(); 
                    } else {
                        alert("❌ 반려됨: " + data.message);
                    }
                } catch (err) {
                    alert("서버 연결에 실패했습니다.");
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
            });
        });
    }
}

// ==========================================
// 🔗 [전역 바인딩] app.js 의 탭 체인저와 가교 연결
// ==========================================
window.triggerSasaTabLoad = function() {
    console.log("[Hook] 사사도미 탭 진입 감지됨. 데이터 스크래핑 런타임 시작.");
    checkSasaIntegrationStatus().then(() => {
        if (savedSasaId && savedSasaToken) {
            loadSasadomiData();      
            loadApplicationData();   
        }
    });
};

document.addEventListener('DOMContentLoaded', initSasadomi);
