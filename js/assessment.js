import { db } from './firebase-init.js';
import { 
    doc, getDoc, setDoc, updateDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { NoticeEditor } from './rich-editor.js';

console.log("🚀 assessment.js 로드 완료 (설정 창 내 사전순 오름차순 정렬 적용)");

// 💡 전역 상태 및 권한 변수
let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeAssessments = null;

let subjects = []; 
let userSettings = [];
let editingId = null;

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
            
            .accordion-item.active .accordion-body { display: block; animation: fadeIn 0.3s ease-in-out; }
            .accordion-item.active .accordion-header { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
            .accordion-item.active .accordion-arrow { transform: rotate(180deg); }
            
            .accordion-arrow { transition: transform 0.3s; display: inline-block; color: #3b82f6; margin-left: 12px; font-size: 12px; }
            .btn-edit-subject, .btn-delete-subject, .btn-toggle-public { padding: 6px 12px; margin-left: 6px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background 0.2s; }
            
            .btn-toggle-public { background: #fef08a; color: #854d0e; }
            .btn-toggle-public:hover { background: #fde047; }
            .btn-edit-subject { background: #e2e8f0; color: #475569; }
            .btn-edit-subject:hover { background: #cbd5e1; }
            .btn-delete-subject { background: #fee2e2; color: #ef4444; }
            .btn-delete-subject:hover { background: #fecaca; }
            
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    const tabAssessment = document.getElementById('tab-list-view');
    const tabEditor = document.getElementById('tab-editor-view');
    const listContainer = document.getElementById('evaluation-list');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const settingsModal = document.getElementById('settings-modal');
    const btnAdminAdd = document.getElementById('btn-admin-add');

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
            try {
                const docSnap = await getDoc(assessmentRef);
                if (!docSnap.exists()) await setDoc(assessmentRef, { plans: [] });
            } catch (e) {
                console.error("문서 생성 오류:", e);
            }
            if (btnAdminAdd) btnAdminAdd.style.display = 'inline-block';
        } else {
            if (btnAdminAdd) btnAdminAdd.style.display = 'none';
        }

        unsubscribeAssessments = onSnapshot(assessmentRef, (docSnap) => {
            if (docSnap.exists()) {
                const rawPlans = docSnap.data().plans || [];
                subjects = rawPlans.filter(sub => sub !== null && typeof sub === 'object' && sub.id);
            } else {
                subjects = [];
            }
            
            subjects.forEach(sub => {
                if (!userSettings.find(s => s.id === sub.id)) {
                    userSettings.push({ id: sub.id, visible: true, priority: 1 });
                }
            });
            
            renderList();
        });
    }

    const editor = new NoticeEditor('editor-container', '<p>수식은 $...$ 로 입력하세요.</p>', {
        onSubmit: async (data) => {
            if (!isCurrentUserAdmin) return alert("수정 권한이 없습니다.");

            const assessmentRef = doc(db, 'system', 'assessments');
            let updatedSubjects = subjects.filter(sub => sub !== null && typeof sub === 'object' && sub.id);

            const safeTitle = data.title || '제목 없음';
            const safeContent = data.bodyHtml || '';
            const safeFiles = data.files || [];

            if (editingId) {
                const idx = updatedSubjects.findIndex(s => s.id === editingId);
                if (idx > -1) {
                    updatedSubjects[idx] = { 
                        ...updatedSubjects[idx], 
                        title: safeTitle, 
                        content: safeContent, 
                        files: safeFiles 
                    };
                }
            } else {
                updatedSubjects.push({ 
                    id: Date.now(), 
                    title: safeTitle, 
                    content: safeContent, 
                    files: safeFiles,
                    isPublic: true 
                });
            }

            try {
                await updateDoc(assessmentRef, { plans: updatedSubjects });
                editingId = null;
                toggleEditorTab(false);
            } catch (error) {
                console.error("Firestore 업데이트 에러:", error);
                alert("저장에 실패했습니다. 권한이나 네트워크를 확인해주세요.");
            }
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

    window.renderList = function() {
        const keyword = searchInput?.value.replace(/\s+/g, '').toLowerCase() || '';
        const sortType = sortSelect?.value || 'name-asc';

        let displayData = subjects.filter(sub => sub !== null && sub.id).filter(sub => {
            if (!isCurrentUserAdmin && sub.isPublic === false) return false;
            return true;
        }).map(sub => {
            const setting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
            return { ...sub, visible: setting.visible, priority: setting.priority };
        }).filter(sub => {
            const safeTitle = sub.title || ''; 
            const titleNoSpace = safeTitle.replace(/\s+/g, '').toLowerCase();
            return sub.visible && titleNoSpace.includes(keyword);
        });

        displayData.sort((a, b) => {
            const titleA = a.title || '';
            const titleB = b.title || '';

            if (sortType === 'name-asc') return titleA.localeCompare(titleB);
            if (sortType === 'name-desc') return titleB.localeCompare(titleA);
            if (sortType === 'priority-asc') {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return titleA.localeCompare(titleB);
            }
            if (sortType === 'priority-desc') {
                if (a.priority !== b.priority) return b.priority - a.priority;
                return titleB.localeCompare(titleA);
            }
        });

        listContainer.innerHTML = displayData.length > 0 ? displayData.map(sub => `
            <div class="accordion-item" data-id="${sub.id}" ${sub.isPublic === false ? 'style="border-color:#fca5a5; background:#fef2f2;"' : ''}>
                <div class="accordion-header">
                    <span style="flex-grow:1; display:flex; align-items:center;">
                        ${sub.isPublic === false ? `<span style="background:#ef4444; color:white; font-size:11px; padding:2px 6px; border-radius:4px; margin-right:8px; line-height:1;">비공개</span>` : ''}
                        📑 ${sub.title || '제목 없음'}
                    </span>
                    <div style="display:flex; align-items:center;">
                        ${isCurrentUserAdmin ? `
                            <button class="btn-toggle-public" onclick="togglePublic(${sub.id}, event)">${sub.isPublic === false ? '공개로 전환' : '비공개 처리'}</button>
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

    listContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.accordion-header');
        if (header && !e.target.closest('button')) {
            const item = header.parentElement;
            item.classList.toggle('active');
        }
    });

    window.togglePublic = async function(id, event) {
        event.stopPropagation();
        if (!isCurrentUserAdmin) return;

        const updatedSubjects = subjects.map(s => {
            if (s !== null && s.id === id) {
                return { ...s, isPublic: s.isPublic === false ? true : false };
            }
            return s;
        }).filter(s => s !== null && s.id);

        const assessmentRef = doc(db, 'system', 'assessments');
        try {
            await updateDoc(assessmentRef, { plans: updatedSubjects });
        } catch(e) {
            console.error("공개 상태 변경 에러:", e);
            alert("상태 변경에 실패했습니다.");
        }
    };

    window.editSubject = function(id, event) {
        event.stopPropagation();
        if (!isCurrentUserAdmin) return;
        const subject = subjects.find(s => s.id === id);
        if (subject) {
            editingId = id;
            editor.setData(subject.title || '', subject.content || '', subject.files || []);
            toggleEditorTab(true);
        }
    };

    window.deleteSubject = async function(id, event) {
        event.stopPropagation();
        if (!isCurrentUserAdmin) return;
        
        if (confirm("정말 이 항목을 삭제하시겠습니까? (서버에서도 영구 삭제됩니다)")) {
            const updatedSubjects = subjects.filter(s => s !== null && s.id && s.id !== id);
            const assessmentRef = doc(db, 'system', 'assessments');
            try {
                await updateDoc(assessmentRef, { plans: updatedSubjects });
                userSettings = userSettings.filter(s => s.id !== id);
            } catch(e) {
                console.error("삭제 에러:", e);
                alert("삭제에 실패했습니다.");
            }
        }
    };

    btnAdminAdd?.addEventListener('click', () => {
        if (!isCurrentUserAdmin) return alert("관리자만 작성할 수 있습니다.");
        editingId = null;
        editor.reset();
        toggleEditorTab(true);
    });

    document.getElementById('btn-user-settings')?.addEventListener('click', () => {
        const container = document.getElementById('settings-list');
        if(container) {
            container.innerHTML = subjects.filter(sub => sub && sub.id).filter(sub => {
                if (!isCurrentUserAdmin && sub.isPublic === false) return false;
                return true;
            })
            // 🚀 [핵심 수정] 설정 창 안의 목록을 열 때마다 항상 제목 기준 사전순(오름차순) 정렬 수행
            .sort((a, b) => {
                const titleA = a.title || '';
                const titleB = b.title || '';
                return titleA.localeCompare(titleB);
            })
            .map(sub => {
                const setting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
                return `
                    <div class="setting-item" style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
                        <label style="cursor:pointer;"><input type="checkbox" class="setting-visible" data-id="${sub.id}" ${setting.visible ? 'checked' : ''}> ${sub.isPublic === false ? '🚫[비공개] ' : ''}${sub.title || '제목 없음'}</label>
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
            if(!checkbox) return;
            
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
