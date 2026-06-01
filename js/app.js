// js/app.js 수정 사항 반영
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                // 기존의 하드코딩 요소를 유연하게 보완
                if (content.id === target) {
                    content.classList.add('active');
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            });
            
            // 💡 탭 특화 트리거 함수 바인딩 연계
            if (target === 'dashboard' && window.triggerDashboardLoad) window.triggerDashboardLoad();
            if (target === 'sasadomi' && window.triggerSasaTabLoad) window.triggerSasaTabLoad();
        });
    });
});
