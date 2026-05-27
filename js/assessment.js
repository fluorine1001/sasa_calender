import { db } from './firebase-init.js';
import { 
    doc, getDoc, setDoc, updateDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { NoticeEditor } from './rich-editor.js';

console.log("🚀 assessment.js 로드 완료 (관리자 권한 제어 및 실시간 동기화 적용)");

// 💡 전역 상태 및 권한 변수
let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeAssessments = null;

// 기존 상태 관리
let subjects = []; 
let userSettings = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
    // 🎨 아코디언 및 리스트 UI용 CSS 자동 주입 (원본 유지)
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

    // DOM 요소
    const tabAssessment = document.getElementById('tab-list-view');
    const tabEditor = document.getElementById('tab-editor-view');
    const listContainer = document.getElementById('evaluation-list');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const settingsModal = document.getElementById('settings-modal');
    const btnAdminAdd = document.getElementById('btn-admin-add');

    // ==========================================
    // 🔐 Auth 및 실시간 데이터 연동 (신규 추가)
    // ==========================================
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            try {
                const userDoc = await getDoc(doc(db, `users/${currentUid}`));
                isCurrentUserAdmin = (userDoc.exists() && userDoc.data().isAdmin === true);
            } catch (error) {
                console.error("권한 체크 에러:", error);
                isCurrentUserAdmin = false;
            }
            loadAssessmentPlans(); 
        } else {
            currentUid = null;
            isCurrentUserAdmin = false;
            if (unsubscribeAssessments) unsubscribeAssessments();
            subjects = [];
            renderList();
        }
    });

    async function loadAssessmentPlans() {
        if (unsubscribeAssessments) unsubscribeAssessments();
        const assessmentRef = doc(db, 'system', 'assessments');

        if (isCurrentUserAdmin) {
            const docSnap = await getDoc(assessmentRef);
            if (!docSnap.exists()) await setDoc(assessmentRef, { plans: [] });
            if (btnAdminAdd) btnAdminAdd.style.display = 'inline-block'; // 관리자일 때만 추가 버튼 표시
        } else {
            if (btnAdminAdd) btnAdminAdd.style.display = 'none';
        }

        unsubscribeAssessments = onSnapshot(assessmentRef, (docSnap) => {
            if (docSnap.exists()) {
                subjects = docSnap.data().plans || [];
            } else {
                subjects = [];
            }
            
            // 💡 새로 추가된 과목이 있다면 로컬 userSettings에도 기본값(보임) 추가 보정
            subjects.forEach(sub => {
                if (!userSettings.find(s => s.id === sub.id)) {
                    userSettings.push({ id: sub.id, visible: true, priority: 1 });
                }
            });
            
            renderList();
        });
    }

    // ==========================================
    // ✍️ 에디터 설정 (수정 시 로컬 배열 대신 Firestore 업데이트)
    // ==========================================
    const editor = new NoticeEditor('editor-container', '<p>수식은 $...$ 로 입력하세요.</p>', {
        onSubmit: async (data) => {
            if (!isCurrentUserAdmin) return alert("수정 권한이 없습니다.");

            const assessmentRef = doc(db, 'system', 'assessments');
            let updatedSubjects = [...subjects];

            if (editingId) {
                const idx = updatedSubjects.findIndex(s => s.id === editingId);
                if (idx > -1) {
                    updatedSubjects[idx] = { 
                        ...updatedSubjects[idx], 
                        title: data.title, 
                        content: data.bodyHtml, 
                        files: data.files 
                    };
                }
            } else {
                const newId = Date.now();
                updatedSubjects.push({ 
                    id: newId, 
                    title: data.title, 
                    content: data.bodyHtml, 
                    files: data.files 
                });
            }

            // DB 업데이트 (이후 onSnapshot이 트리거되어 화면이 자동 갱신됨)
            await updateDoc(assessmentRef, { plans: updatedSubjects });
            
            editingId = null;
            toggleEditorTab(false);
        },
        onCancel: () => {
            editingId = null;
            toggleEditorTab(false);
        }
    });

    function toggleEditorTab(showEditor) {
        if (showEditor) {
            tabAssessment.style.display = 'none';
            tabEditor.style.display = 'block';
        } else {
            tabEditor.style.display = 'none';
            tabAssessment.style.display = 'block';
        }
    }

    // ==========================================
    // 🖥️ 리스트 렌더링 (원본 로직 유지 + 관리자 버튼 조건부 렌더링)
    // ==========================================
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
                        ${isCurrentUserAdmin ? `
                            <button class="btn-edit-subject" onclick="editSubject(${sub.id}, event)">수정</button>
                            <button class="btn-delete-subject" onclick="deleteSubject(${sub.id}, event)">삭제</button>
                        ` : ''}
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

    // ==========================================
    // 🖱️ 이벤트 리스너 및 액션
    // ==========================================
    listContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.accordion-header');
        if (header && !e.target.closest('button')) {
            const item = header.parentElement;
            item.classList.toggle('active');
        }
    });

    window.editSubject = function(id, event) {
        event.stopPropagation();
        if (!isCurrentUserAdmin) return;
        const subject = subjects.find(s => s.id === id);
        if (subject) {
            editingId = id;
            editor.setData(subject.title, subject.content, subject.files);
            toggleEditorTab(true);
        }
    };

    window.deleteSubject = async function(id, event) {
        event.stopPropagation();
        if (!isCurrentUserAdmin) return;
        
        if (confirm("정말 이 항목을 삭제하시겠습니까? (서버에서도 영구 삭제됩니다)")) {
            const updatedSubjects = subjects.filter(s => s.id !== id);
            const assessmentRef = doc(db, 'system', 'assessments');
            await updateDoc(assessmentRef, { plans: updatedSubjects }); // DB 반영
            
            userSettings = userSettings.filter(s => s.id !== id); // 로컬 설정 정리
        }
    };

    btnAdminAdd?.addEventListener('click', () => {
        if (!isCurrentUserAdmin) return alert("관리자만 작성할 수 있습니다.");
        editingId = null;
        editor.reset();
        toggleEditorTab(true);
    });

    // ⚙️ 개인화 설정 모달 동작 (원본 그대로 유지)
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
        document.getElementById('btn-user-settings').click(); 
    });

    searchInput?.addEventListener('input', renderList);
    sortSelect?.addEventListener('change', renderList);
});
