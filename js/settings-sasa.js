// js/settings-sasa.js (설정 파일의 핵심 제어기)
import { db } from './firebase-init.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

const auth = getAuth();
let targetUid = null;

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('sasa-auth-modal');
    const openBtn = document.getElementById('btn-open-sasa-modal');
    const closeBtn = document.getElementById('btn-close-sasa-modal');
    const cancelBtn = document.getElementById('btn-cancel-sasa-auth');
    const form = document.getElementById('sasa-credential-form');

    if(openBtn) openBtn.addEventListener('click', () => modal.style.display = 'flex');
    if(closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    if(cancelBtn) cancelBtn.addEventListener('click', () => modal.style.display = 'none');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            targetUid = user.uid;
            syncSasaLinkStatus();
        }
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const sasaId = document.getElementById('sasa-input-id').value.trim();
            const sasaPw = document.getElementById('sasa-input-pw').value;

            if(!sasaId || !sasaPw) return alert("인증 정보를 빠짐없이 기입해 주세요.");

            try {
                // 🔒 보안 통신 가상 프록시 API 호출 컨셉 적용
                // const response = await fetch('/api/sasa-authenticate', { method: 'POST', body: JSON.stringify({ sasaId, sasaPw }) });
                // const result = await response.json();
                
                // 통신 완료 즉시 메모리 및 입력창 비우기 처리로 평문 노출 최소화
                document.getElementById('sasa-credential-form').reset();

                // 가상 성공 프로토콜 및 세션 가공 데이터 파싱 시뮬레이션
                const mockStudentInfo = {
                    grade: sasaId.substring(0,1),
                    class: sasaId.substring(1,2),
                    number: sasaId.substring(2,4),
                    name: auth.currentUser.displayName || "사사인"
                };

                const userRef = doc(db, "users", targetUid);
                await updateDoc(userRef, {
                    isSasaLinked: true,
                    sasaStudentInfo: mockStudentInfo,
                    sasaSessionToken: "SECURE_SESSION_JWT_TOKEN_TOKEN_" + Date.now()
                });

                alert("🎉 사사도미 계정 연동 인증에 성공했습니다!");
                modal.style.display = 'none';
                syncSasaLinkStatus();
            } catch (error) {
                alert("인증 실패: 아이디 혹은 패스워드가 다릅니다.");
            }
        });
    }
});

async function syncSasaLinkStatus() {
    if (!targetUid) return;
    const userDoc = await getDoc(doc(db, "users", targetUid));
    const badge = document.getElementById('sasa-link-badge');
    const metaText = document.getElementById('sasa-user-meta');
    const openBtn = document.getElementById('btn-open-sasa-modal');

    if (userDoc.exists() && userDoc.data().isSasaLinked) {
        const info = userDoc.data().sasaStudentInfo;
        badge.innerText = "연동 완료";
        badge.className = "status-badge status-linked";
        metaText.innerText = `소속 기수: [${info.grade}학년 ${info.class}반 ${info.number}번 ${info.name}]`;
        openBtn.innerText = "🔧 연동 정보 수정";
        
        // 연동 해제 버튼 동적 빌드 지원
        if(!document.getElementById('btn-unlink-sasa')) {
            const unlinkBtn = document.createElement('button');
            unlinkBtn.id = 'btn-unlink-sasa';
            unlinkBtn.innerText = "연동 해제";
            unlinkBtn.style.cssText = "margin-left:10px; background:#fff; color:#d93025; border:1px solid #d93025; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:13px;";
            unlinkBtn.onclick = async () => {
                if(confirm("연동을 해제하면 실시간 면학 관리가 비활성화됩니다. 해제할까요?")) {
                    await updateDoc(doc(db, "users", targetUid), { isSasaLinked: false, sasaSessionToken: null, sasaStudentInfo: null });
                    localStorage.removeItem('sasadomi_cache');
                    alert("연동이 안전하게 파기되었습니다.");
                    syncSasaLinkStatus();
                }
            };
            openBtn.parentNode.appendChild(unlinkBtn);
        }
    } else {
        badge.innerText = "미연동";
        badge.className = "status-badge status-unlinked";
        metaText.innerText = "연동된 계정 정보가 없습니다.";
        openBtn.innerText = "계정 연결하기";
        const exUnlink = document.getElementById('btn-unlink-sasa');
        if(exUnlink) exUnlink.remove();
    }
}
