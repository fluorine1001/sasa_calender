import { NoticeEditor } from './rich-editor.js';

document.addEventListener('DOMContentLoaded', () => {
    // 🎨 아코디언 및 리스트 UI용 CSS 자동 주입
    if (!document.getElementById('accordion-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'accordion-custom-styles';
        style.innerHTML = `
            .accordion-item { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; background: #fff; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: box-shadow 0.2s; }
            .accordion-item:hover { box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            .accordion-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; cursor: pointer; background: #ffffff; font-weight: 600; font-size: 15px; color: #1e293b; transition: all 0.2s; }
            .accordion-header:hover { background: #f8fafc; }
            .accordion-body { display: none; padding: 20px; border-top: 1px solid #e2e8f0; color: #334155; line-height: 1.6; background: #fafbfc; }
            
            /* 토글이 열렸을 때(.active)의 스타일 */
            .accordion-item.active .accordion-body { display: block; animation: fadeIn 0.3s ease-in-out; }
            .accordion-item.active .accordion-header { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
            .accordion-item.active .accordion-arrow { transform: rotate(180deg); }
            
            .accordion-arrow { transition: transform 0.3s; display: inline-block; color: #3b82f6; margin-left: 12px; font-size: 12px; }
            .btn-edit-subject, .btn-delete-subject { padding: 6px 12px; margin-left: 6px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background 0.2s; }
            .btn-edit-subject { background: #e2e8f0; color: #475569; }
            .btn-edit-subject:hover { background: #cbd5e1; }
            .btn-delete-subject { background: #fee2e2; color: #ef4444; }
            .btn-delete-subject:hover { background: #fecaca; }
            
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    // 1. 과목 데이터 및 설정 데이터 상태 관리
    let subjects = [
    ];
    let userSettings = subjects.map(sub => ({ id: sub.id, visible: true, priority: 1 }));
    let editingId = null;

    // DOM 요소
    const tabAssessment = document.getElementById('tab-list-view');
    const tabEditor = document.getElementById('tab-editor-view');
    const listContainer = document.getElementById('evaluation-list');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const settingsModal = document.getElementById('settings-modal');

    // 2. NoticeEditor 인스턴스화
    const editor = new NoticeEditor('editor-container', '<p>수식은 $...$ 로 입력하세요.</p>', {
        onSubmit: async (data) => {
            if (editingId) {
                const idx = subjects.findIndex(s => s.id === editingId);
                if (idx > -1) {
                    subjects[idx].title = data.title;
                    subjects[idx].content = data.bodyHtml;
                    subjects[idx].files = data.files;
                }
            } else {
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
            tabAssessment.style.display = 'none';
            tabEditor.style.display = 'block';
        } else {
            tabEditor.style.display = 'none';
            tabAssessment.style.display = 'block';
        }
    }

    // 3. 리스트 렌더링
    window.renderList = function() {
        const keyword = searchInput?.value.replace(/\s+/g, '').toLowerCase() || '';
        const sortType = sortSelect?.value || 'name-asc';

        let displayData = subjects.map(sub => {
            const setting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
            return { ...sub, visible: setting.visible, priority: setting.priority };
        }).filter(sub => {
            const titleNoSpace = sub.title.replace(/\s+/g, '').toLowerCase();
            return sub.visible && titleNoSpace.includes(keyword);
        });

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

        listContainer.innerHTML = displayData.length > 0 ? displayData.map(sub => `
            <div class="accordion-item" data-id="${sub.id}">
                <div class="accordion-header">
                    <span style="flex-grow:1;">📑 ${sub.title}</span>
                    <div style="display:flex; align-items:center;">
                        <button class="btn-edit-subject" onclick="editSubject(${sub.id}, event)">수정</button>
                        <button class="btn-delete-subject" onclick="deleteSubject(${sub.id}, event)">삭제</button>
                        <span class="accordion-arrow">▼</span>
                    </div>
                </div>
                <div class="accordion-body">
                    <div class="ql-editor" style="padding:0; min-height:auto;">
                        ${sub.content || '<span style="color:#999;">내용이 없습니다.</span>'}
                    </div>
                    ${sub.files && sub.files.length > 0 ? `
                        <div style="margin-top:15px; padding-top:15px; border-top:1px dashed #cbd5e1;">
                            <strong style="font-size:13px; color:#475569;">📎 첨부 파일/링크:</strong>
                            <ul style="list-style:none; padding:0; margin:8px 0 0 0; font-size:13px;">
                                ${sub.files.map(f => `<li style="margin-bottom:4px;"><a href="${f.url}" target="_blank" style="color:#2563eb; text-decoration:none;">🔗 ${f.name}</a></li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('') : '<div style="text-align:center; padding: 40px; color:#94a3b8; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1;">검색 결과가 없거나 표시할 항목이 없습니다.</div>';
    };

    // 아코디언 토글 이벤트 위임
    listContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.accordion-header');
        // 버튼을 누른 경우는 아코디언이 토글되지 않도록 방어
        if (header && !e.target.closest('button')) {
            const item = header.parentElement;
            item.classList.toggle('active');
        }
    });

    window.editSubject = function(id, event) {
        event.stopPropagation();
        const subject = subjects.find(s => s.id === id);
        if (subject) {
            editingId = id;
            editor.setData(subject.title, subject.content, subject.files);
            toggleEditorTab(true);
        }
    };

    window.deleteSubject = function(id, event) {
        event.stopPropagation();
        if (confirm("정말 이 항목을 삭제하시겠습니까?")) {
            subjects = subjects.filter(s => s.id !== id);
            userSettings = userSettings.filter(s => s.id !== id);
            renderList();
        }
    };

    // 이벤트 리스너 바인딩
    document.getElementById('btn-admin-add')?.addEventListener('click', () => {
        editingId = null;
        editor.reset();
        toggleEditorTab(true);
    });

    document.getElementById('btn-user-settings')?.addEventListener('click', () => {
        const container = document.getElementById('settings-list');
        if(container) {
            container.innerHTML = subjects.map(sub => {
                const setting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
                return `
                    <div class="setting-item" style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
                        <label style="cursor:pointer;"><input type="checkbox" class="setting-visible" data-id="${sub.id}" ${setting.visible ? 'checked' : ''}> ${sub.title}</label>
                        <div>우선순위: <input type="number" class="setting-priority" data-id="${sub.id}" value="${setting.priority}" style="width:40px; text-align:center;"></div>
                    </div>
                `;
            }).join('');
        }
        if(settingsModal) settingsModal.style.display = 'flex';
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
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
        if(settingsModal) settingsModal.style.display = 'none';
        renderList();
    });

    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
        userSettings.forEach(s => { s.visible = true; s.priority = 1; });
        document.getElementById('btn-user-settings').click(); // 모달 리렌더링
    });

    searchInput?.addEventListener('input', renderList);
    sortSelect?.addEventListener('change', renderList);

    // 초기 렌더링
    renderList();
});
