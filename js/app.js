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

        // 1-2. 콘텐츠 섹션 표시/숨김 처리 (⚠️ 누락되었던 display 속성 제어 복구)
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === targetId) {
                content.classList.add('active');
                content.style.display = 'block'; // 명시적으로 화면에 표시
            } else {
                content.style.display = 'none';  // 나머지는 명시적으로 숨김
            }
        });

        // 1-3. 현재 열어본 탭을 브라우저 로컬 스토리지에 저장 (새로고침 복구용)
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

    // 💡 3. 초기 접속 및 새로고침 시 마지막 탭을 복원하고 데이터 로드 강제 실행
    setTimeout(() => {
        // 저장된 탭이 없으면 기본값인 'dashboard'를 엽니다.
        const savedTab = localStorage.getItem('sasa_last_active_tab') || 'dashboard';
        switchTab(savedTab);
    }, 100);
});
