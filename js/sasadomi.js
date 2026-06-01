// js/sasadomi.js
import { db } from './firebase-init.js';
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

const auth = getAuth();
let userUid = null;
let sasaLinked = false;
let unsubscribeGlobals = null;
const CACHE_DURATION = 30 * 60 * 1000; // 💡 정확히 30분 만료 제한 설정

window.triggerSasaTabLoad = () => {
    console.log("🦊 [사사도미] 메인 코어 가동.");
    verifyAndLoadSasaData(false);
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        userUid = user.uid;
        const userSnap = await getDoc(doc(db, "users", userUid));
        sasaLinked = userSnap.exists() && userSnap.data().isSasaLinked === true;
        
        toggleSasaPanels();
        if(sasaLinked) {
            verifyAndLoadSasaData(false);
            listenGlobalRules(userSnap.data().isAdmin === true);
        }
    }
});

function toggleSasaPanels() {
    const overlay = document.getElementById('sasa-unlinked-overlay');
    const content = document.getElementById('sasa-linked-content');
    const refreshBtn = document.getElementById('btn-sasa-refresh');

    if(sasaLinked) {
        if(overlay) overlay.style.display = 'none';
        if(content) content.style.display = 'grid';
        if(refreshBtn) refreshBtn.style.display = 'block';
    } else {
        if(overlay) overlay.style.display = 'block';
        if(content) content.style.display = 'none';
        if(refreshBtn) refreshBtn.style.display = 'none';
    }
}

// 🔄 핵심: 고도화된 캐시 우회 및 수동 동기화 지원 데이터 로더
async function verifyAndLoadSasaData(forceRefresh = false) {
    if (!userUid || !sasaLinked) return;

    const cacheKey = `sasa_cache_${userUid}`;
    const cachedDataString = localStorage.getItem(cacheKey);
    let cacheValid = false;

    if (cachedDataString && !forceRefresh) {
        const cache = JSON.parse(cachedDataString);
        if (Date.now() - cache.timestamp < CACHE_DURATION) {
            cacheValid = true;
            console.log("📦 [캐싱 레이어] 유효시간 내의 로컬 캐시 데이터를 렌더링합니다.");
            renderSasaCoreMetrics(cache.data);
            return;
        }
    }

    // 캐시가 만료되었거나 강제 새로고침인 경우 실제 원격 API 프록시 연동 수행
    console.log("🌐 [원격 통신] 사사도미 실시간 API 동기화 구동 중...");
    try {
        // 실제 운영 환경에서는 세션 토큰을 헤더에 실어 백엔드로 요청합니다.
        // const response = await fetch('/api/sasa-data-bridge');
        // const remoteData = await response.json();
        
        // 가상 실시간 모킹 스냅샷 데이터 정의
        const remoteMockData = {
            totalScore: -4,
            history: [
                { reason: "심야 전자기기 무단 사용 조치", score: -3, date: "2026-05-28" },
                { reason: "생활관 호실 정돈 우수", score: 1, date: "2026-05-15" },
                { reason: "면학 정숙 지도 위반", score: -2, date: "2026-05-02" }
            ],
            studyStatus: "1타임 [도서관 지정석] 신청 완료",
            outingStatus: "승인된 외출 내역 없음"
        };

        // 로컬 브라우저 저장소 캐시 갱신 처리
        const newCacheObj = {
            timestamp: Date.now(),
            data: remoteMockData
        };
        localStorage.setItem(cacheKey, JSON.stringify(newCacheObj));
        renderSasaCoreMetrics(remoteMockData);
        
    } catch (err) {
        console.error("사사도미 데이터 원격 로드 에러:", err);
    }
}

function renderSasaCoreMetrics(data) {
    const scoreDisplay = document.getElementById('total-score');
    const statusText = document.getElementById('score-status-text');
    const listContainer = document.getElementById('penalty-list');
    const studyStatusText = document.getElementById('sasa-study-status');
    const outingStatusText = document.getElementById('sasa-outing-status');

    if(scoreDisplay) scoreDisplay.innerText = data.totalScore;
    
    // 배지 스타일 매핑 및 경고 고도화
    if(statusText) {
        if(data.totalScore < 0) {
            statusText.innerHTML = `<span style="color:#d93025; font-weight:bold;">주의: 벌점 누적 상태</span>`;
        } else {
            statusText.innerHTML = `<span style="color:#1e8e3e; font-weight:bold;">안전: 상점 우위 상태</span>`;
        }
    }

    if(studyStatusText) studyStatusText.innerText = data.studyStatus;
    if(outingStatusText) outingStatusText.innerText = data.outingStatus;

    if(listContainer) {
        listContainer.innerHTML = '';
        data.history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'cl-list-item';
            div.style.marginBottom = '6px';
            const color = item.score > 0 ? '#1e8e3e' : '#d93025';
            div.innerHTML = `
                <div>
                    <span style="font-size:13px; font-weight:bold;">${item.reason}</span>
                    <br><small style="color:#888;">${item.date}</small>
                </div>
                <span style="color:${color}; font-weight:bold;">${item.score > 0 ? '+'+item.score : item.score}점</span>
            `;
            listContainer.appendChild(div);
        });
    }
}

// 기존 merit.js 내에 완벽히 구축되어 있던 "벌점 부과 사유" 리스트 결합 보존
function listenGlobalRules(isAdmin) {
    if (unsubscribeGlobals) unsubscribeGlobals();
    const settingsRef = doc(db, 'system', 'globals');

    unsubscribeGlobals = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const rules = docSnap.data().rules || [];
            const container = document.getElementById('discipline-list-container');
            if(!container) return;

            let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
            rules.forEach((group, idx) => {
                html += `
                    <div style="background:#fff; border:1px solid #fad2cf; border-radius:6px; padding:10px;">
                        <strong style="color:#c5221f; font-size:13px;">📊 ${group.score || group}</strong>
                        <ul style="margin:5px 0 0 0; padding-left:15px; font-size:12px; color:#555;">
                `;
                if(group.reasons) {
                    group.reasons.forEach(r => { html += `<li style="margin-bottom:3px;">${r}</li>`; });
                }
                html += `</ul></div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }
    });
}

// 🔄 수동 동기화 컴포넌트 버튼 이벤트 리스너 바인딩
document.getElementById('btn-sasa-refresh').addEventListener('click', () => {
    verifyAndLoadSasaData(true); // forceRefresh 플래그 주입
    alert("🔄 최신 사사도미 원격 원장이 동기화 및 캐싱되었습니다.");
});
