document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');

            // 1. 모든 메뉴의 active 클래스 제거 및 클릭한 메뉴에 추가
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. 모든 섹션 숨기기 및 타겟 섹션만 보이기
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === target) {
                    content.classList.add('active');
                }
            });
            
            // 3. (선택사항) 해당 탭이 열릴 때 필요한 데이터 로드 함수 호출
            // 예: if(target === 'calendar') loadCalendar();
        });
    });
});
