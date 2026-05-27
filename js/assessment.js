document.addEventListener('DOMContentLoaded', () => {
    // 1. 과목 데이터 및 설정 데이터 상태 관리
    let subjects = [
        { id: 1, title: "2026 1학기 국어 평가계획", content: "<p>중간 40%, 기말 40%, 수행 20%</p>", files: [] },
        { id: 2, title: "2026 1학기 수학 평가계획", content: "<p>수행평가 100%</p>", files: [] }
    ];
    let userSettings = subjects.map(sub => ({ id: sub.id, visible: true, priority: 1 }));
    let editingId = null; // 수정 모드 판별용

    // DOM 요소
    const tabAssessment = document.getElementById('tab-assessment');
    const tabEditor = document.getElementById('tab-editor');
    const listContainer = document.getElementById('evaluation-list');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const settingsModal = document.getElementById('settings-modal');

    // 2. NoticeEditor 인스턴스화 (rich_editor.js)
    const editor = new NoticeEditor('editor-container', '<p>수식은 $...$ 로 입력하세요.</p>', {
        onSubmit: async (data) => {
            if (editingId) {
                // 기존 데이터 수정
                const idx = subjects.findIndex(s => s.id === editingId);
                if (idx > -1) {
                    subjects[idx].title = data.title;
                    subjects[idx].content = data.bodyHtml;
                    subjects[idx].files = data.files;
                }
            } else {
                // 새 데이터 추가
                const newId = Date.now();
                subjects.push({ id: newId, title: data.title, content: data.bodyHtml, files: data.files });
                userSettings.push({ id: newId, visible: true, priority: 1 });
            }
            editingId = null;
            renderList();
            toggleEditorTab(false);
        },
        onCancel: () => {
            editingId = null;
            toggleEditorTab(false);
        }
    });

    // 리스트 <-> 에디터 탭 전환
    function toggleEditorTab(showEditor) {
        if (showEditor) {
            tabAssessment.classList.remove('active');
            tabEditor.classList.add('active');
        } else {
            tabEditor.classList.remove('active');
            tabAssessment.classList.add('active');
        }
    }

    // 3. 리스트 렌더링 (검색 및 정렬 로직 포함)
    window.renderList = function() {
        const keyword = searchInput.value.replace(/\s+/g, '').toLowerCase();
        const sortType = sortSelect.value;

        // 가시성 필터링 및 띄어쓰기 무시 검색 적용
        let displayData = subjects.map(sub => {
            const setting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
            return { ...sub, visible: setting.visible, priority: setting.priority };
        }).filter(sub => {
            const titleNoSpace = sub.title.replace(/\s+/g, '').toLowerCase();
            return sub.visible && titleNoSpace.includes(keyword);
        });

        // 정렬 적용
        displayData.sort((a, b) => {
            if (sortType === 'name-asc') return a.title.localeCompare(b.title);
            if (sortType === 'name-desc') return b.title.localeCompare(a.title);
            
            if (sortType === 'priority-asc') {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.title.localeCompare(b.title);
            }
            if (sortType === 'priority-desc') {
                if (a.priority !== b.priority) return b.priority - a.priority;
                return b.title.localeCompare(a.title);
            }
        });

        // HTML 렌더링
        listContainer.innerHTML = displayData.length > 0 ? displayData.map(sub => `
            <div class="accordion-item" data-id="${sub.id}">
                <div class="accordion-header">
                    <span>${sub.title}</span>
                    <div>
                        <button class="btn-edit-subject" onclick="editSubject(${sub.id}, event)">수정</button>
                        <button class="btn-delete-subject" onclick="deleteSubject(${sub.id}, event)">삭제</button>
                        <span style="color:#1a73e8; margin-left:8px; font-size:12px;">▼</span>
                    </div>
                </div>
                <div class="accordion-body">
                    <div class="ql-editor" style="padding:0; min-height:auto;">
                        ${sub.content}
                    </div>
                </div>
            </div>
        `).join('') : '<div style="text-align:center; padding: 40px; color:#999;">검색 결과가 없거나 표시할 항목이 없습니다.</div>';
    };

    // 아코디언 토글 이벤트 위임
    listContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.accordion-header');
        // 수정/삭제 버튼 클릭 시 아코디언이 열리지 않도록 예외 처리
        if (header && !e.target.closest('button')) {
            header.parentElement.classList.toggle('active');
        }
    });

    // 항목 수정 (에디터에 기존 데이터 셋업)
    window.editSubject = function(id, event) {
        event.stopPropagation();
        const subject = subjects.find(s => s.id === id);
        if (subject) {
            editingId = id;
            editor.setData(subject.title, subject.content, subject.files);
            toggleEditorTab(true);
        }
    };

    // 항목 삭제
    window.deleteSubject = function(id, event) {
        event.stopPropagation();
        if (confirm("정말 이 평가 계획을 삭제하시겠습니까?")) {
            subjects = subjects.filter(s => s.id !== id);
            userSettings = userSettings.filter(s => s.id !== id);
            renderList();
        }
    };

    // 새 계획 추가 버튼 클릭
    document.getElementById('btn-admin-add').addEventListener('click', () => {
        editingId = null;
        editor.reset();
        toggleEditorTab(true);
    });

    // 4. 모달 관련 로직 (보기 설정 및 우선순위 설정)
    function renderSettings() {
        const container = document.getElementById('settings-list');
        container.innerHTML = subjects.map(sub => {
            const setting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
            return `
                <div class="setting-item">
                    <label>
                        <input type="checkbox" class="setting-visible" data-id="${sub.id}" ${setting.visible ? 'checked' : ''}>
                        ${sub.title}
                    </label>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:12px; color:#666;">우선순위</span>
                        <input type="number" class="setting-priority" data-id="${sub.id}" value="${setting.priority}">
                    </div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('btn-user-settings').addEventListener('click', () => {
        renderSettings();
        settingsModal.style.display = 'flex';
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
        document.querySelectorAll('.setting-item').forEach(item => {
            const checkbox = item.querySelector('.setting-visible');
            const numberInput = item.querySelector('.setting-priority');
            const id = parseInt(checkbox.dataset.id);
            
            const setting = userSettings.find(s => s.id === id);
            if (setting) {
                setting.visible = checkbox.checked;
                setting.priority = parseInt(numberInput.value) || 1;
            }
        });
        settingsModal.style.display = 'none';
        renderList();
    });

    document.getElementById('btn-reset-settings').addEventListener('click', () => {
        userSettings.forEach(s => { s.visible = true; s.priority = 1; });
        renderSettings();
    });

    // 검색 및 정렬 이벤트
    searchInput.addEventListener('input', renderList);
    sortSelect.addEventListener('change', renderList);

    // 초기 렌더링
    renderList();
});
