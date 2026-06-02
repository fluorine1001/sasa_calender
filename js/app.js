// js/app.js

document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // 웹페이지 로드 후 본문을 서서히 나타나게 하는 애니메이션
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 50);

    // 💡 1. 탭 전환 및 데이터 로드를 담당하는 핵심 통합 함수
    function switchTab(targetId) {
        // 1-1. 메뉴버튼 활성화/비활성화 처리
        navItems.forEach(nav => {
            if (nav.getAttribute('data-target') === targetId) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });

        // 1-2. 콘텐츠 섹션 표시/숨김 처리
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === targetId) {
                content.classList.add('active');
                content.style.display = 'block'; // 명시적으로 화면에 표시
            } else {
                content.style.display = 'none';  // 나머지는 명시적으로 숨김
            }
        });

        // 1-3. 현재 열어본 탭을 브라우저 로컬 스토리지에 저장 (같은 세션 내 새로고침 복구용)
        localStorage.setItem('sasa_last_active_tab', targetId);

        // 1-4. 각 탭에 맞는 데이터 불러오기(Hook) 실행
        if (targetId === 'dashboard' && typeof window.triggerDashboardLoad === 'function') {
            window.triggerDashboardLoad();
        }
        if (targetId === 'sasadomi' && typeof window.triggerSasaTabLoad === 'function') {
            window.triggerSasaTabLoad();
        }
    }

    // 💡 2. 사용자가 직접 메뉴를 클릭했을 때의 이벤트 바인딩
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            switchTab(target);
        });
    });

    // 💡 3. 초기 접속 및 새로고침 제어 로직 (사이트 처음 진입 시 항상 대시보드로 강제 고정)
    setTimeout(() => {
        let targetTab = 'dashboard';

        // 현재 탭(탭 세션) 내에서 F5를 누른 새로고침인 경우에만 이전 탭 기록을 유지합니다.
        // 브라우저를 완전히 새로 켜거나 사이트를 새로 입력해 들어온 경우(=처음 열었을 때)는 무조건 dashboard로 시작합니다.
        if (sessionStorage.getItem('sasa_session_active') === 'true') {
            targetTab = localStorage.getItem('sasa_last_active_tab') || 'dashboard';
        } else {
            // 사이트에 처음 진입했음을 마킹합니다. (이후 새로고침은 세션으로 인정)
            sessionStorage.setItem('sasa_session_active', 'true');
        }

        switchTab(targetTab);
    }, 100);
});
// 💡 [추가] 모바일 슬라이딩 사이드바 제어 로직
const mobileToggleBtn = document.querySelector('.mobile-menu-toggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.sidebar-overlay');

if (mobileToggleBtn && sidebar && overlay) {
        // 열기/닫기 토글 함수
    function toggleSidebar() {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    }

        // 1. 햄버거 버튼 클릭 시 토글
    mobileToggleBtn.addEventListener('click', toggleSidebar);
        
        // 2. 어두운 배경(오버레이) 클릭 시 닫기
    overlay.addEventListener('click', toggleSidebar);

        // 3. 모바일에서 탭(메뉴)을 선택하면 사이드바가 자동으로 닫히게 처리
    navItems.forEach(item => {
        item.addEventListener('click', () => {
                // 화면 너비가 768px 이하이고, 사이드바가 열려있을 때만 닫기
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                toggleSidebar();
            }
        });
    });
}
