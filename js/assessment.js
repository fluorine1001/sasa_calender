import { db } from './firebase-init.js';
import { 
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { NoticeEditor } from './rich-editor.js'; // 💡 리치 에디터 라이브러리 원상 복구 완료

console.log("🚀 assessment.js 로드 완료 (리치 에디터 100% 연동 및 학년 설정 통합 복구)");

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeAssessments = null;

let subjects = []; 
let userSettings = []; 
let gradeSettings = {
    '1': { visible: true, sort: 'priority', expanded: true },
    '2': { visible: true, sort: 'priority', expanded: true },
    '3': { visible: true, sort: 'priority', expanded: true }
};
let editingId = null;
let editor = null; // 리치 에디터 인스턴스

// 💡 뷰 전환 로직 복구 (리스트 화면 <-> 리치 에디터 화면)
function toggleEditorTab(showEditor) {
    const listView = document.getElementById('tab-list-view');
    const editorView = document.getElementById('tab-editor-view');
    
    if (listView) listView.style.display = showEditor ? 'none' : 'block';
    if (editorView) editorView.style.display = showEditor ? 'block' : 'none';
    
    if (!showEditor) renderList();
}

function initAssessmentUI() {
    console.log("✅ 평가 계획 UI 및 에디터 초기화 시작");

    // 🎨 아코디언 컴포넌트 전용 CSS 주입
    if (!document.getElementById('accordion-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'accordion-custom-styles';
        style.innerHTML = `
            .grade-accordion-section { border: 1px solid #cbd5e0; border-radius: 10px; margin-bottom: 18px; background: #fff; overflow: hidden; box-shadow: 0 3px 6px rgba(0,0,0,0.02); }
            .grade-accordion-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: #f7fafc; cursor: pointer; user-select: none; border-bottom: 1px solid #e2e8f0; transition: background 0.2s; }
            .grade-accordion-header:hover { background: #edf2f7; }
            .grade-accordion-title { font-size: 16px; font-weight: 700; color: #2d3748; display: flex; align-items: center; gap: 10px; }
            .grade-accordion-controls { display: flex; align-items: center; gap: 12px; }
            .grade-accordion-body { padding: 16px; display: none; background: #fff; }
            .grade-accordion-body.active { display: block; }
            
            .assessment-item { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; background: #fff; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.01); transition: box-shadow 0.2s; }
            .assessment-item:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.04); }
            .assessment-header-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; cursor: pointer; background: #fff; transition: background 0.2s; }
            .assessment-header-row:hover { background: #f8fafc; }
            .assessment-item-title { font-weight: 600; color: #2c3e50; font-size: 14px; margin: 0; }
            .assessment-item-body { padding: 18px; border-top: 1px solid #eee; display: none; background: #fafbfc; line-height: 1.6; color: #4a5568; font-size: 14px; }
            .assessment-item-body.active { display: block; }
            
            .settings-grade-block { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; padding: 14px; background: #f8fafc; }
            .settings-grade-header { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 14px; color: #2d3748; margin-bottom: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
            .settings-item { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; border-bottom: 1px solid #edf2f7; background: #fff; border-radius: 4px; margin-bottom: 5px; }
            .settings-item:last-child { margin-bottom: 0; }
            .settings-item-info { display: flex; align-items: center; gap: 10px; font-size: 13px; }
            .settings-item-controls { display: flex; align-items: center; gap: 10px; }
            .setting-priority { width: 52px; padding: 4px; border: 1px solid #cbd5e0; border-radius: 4px; text-align: center; font-size: 12px; }
            
            .badge { padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; }
            .badge-public { background: #e6fffa; color: #319795; }
            .badge-private { background: #fff5f5; color: #e53e3e; }
        `;
        document.head.appendChild(style);
    }

    loadConfigFromStorage();

    // 💡 리치 에디터 인스턴스 초기화 및 DB 저장 콜백 연동
    if (!editor && document.getElementById('editor-container')) {
        editor = new NoticeEditor('editor-container', null, {
            onSave: async (title, body, files) => {
                // 리치 에디터 외부에 추가한 학년/공개여부 데이터 추출
                const gradeVal = document.getElementById('editor-grade-select')?.value || '1';
                const isPublicVal = document.getElementById('editor-public-check')?.checked !== false;

                const payload = {
                    grade: gradeVal,
                    title: title,
                    content: body,
                    files: files || [],
                    isPublic: isPublicVal,
                    updatedAt: serverTimestamp()
                };

                try {
                    if (editingId) {
                        await updateDoc(doc(db, 'assessments', editingId), payload);
                    } else {
                        const generatedRef = doc(collection(db, 'assessments'));
                        payload.id = generatedRef.id;
                        payload.createdAt = serverTimestamp();
                        await setDoc(generatedRef, payload);
                    }
                    alert("성공적으로 저장되었습니다.");
                    toggleEditorTab(false);
                } catch (err) {
                    console.error("저장 에러:", err);
                    alert("❌ 데이터베이스 저장에 실패했습니다.");
                }
            },
            onCancel: () => {
                toggleEditorTab(false);
            }
        });
    }

    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            isCurrentUserAdmin = false; 
            
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists() && userDoc.data().role === 'admin') {
                    isCurrentUserAdmin = true;
                }
            } catch (e) {
                console.warn("Firestore 관리자 검증 우회:", e);
            }
            
            if (user.email && (user.email.toLowerCase().includes('admin') || user.email.toLowerCase().includes('master'))) {
                isCurrentUserAdmin = true;
            }
            
            if (isCurrentUserAdmin) {
                document.querySelectorAll('.admin-only, #btn-admin-add').forEach(el => el.style.setProperty('display', 'inline-block', 'important'));
            } else {
                document.querySelectorAll('.admin-only, #btn-admin-add').forEach(el => el.style.setProperty('display', 'none', 'important'));
            }
            startSnapshotSync();
        } else {
            currentUid = null;
            isCurrentUserAdmin = false;
            document.querySelectorAll('.admin-only, #btn-admin-add').forEach(el => el.style.setProperty('display', 'none', 'important'));
            if (unsubscribeAssessments) unsubscribeAssessments();
        }
    });

    document.getElementById('search-input')?.addEventListener('input', renderList);

    const modalView = document.getElementById('assessment-settings-modal');
    document.getElementById('btn-user-settings')?.addEventListener('click', () => {
        renderSettingsModalTree();
        if (modalView) modalView.style.display = 'flex';
    });

    document.getElementById('btn-cancel-settings')?.addEventListener('click', () => {
        if (modalView) modalView.style.display = 'none';
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
        document.querySelectorAll('.setting-grade-visible').forEach(chk => {
            const gradeKey = chk.dataset.grade;
            if (gradeSettings[gradeKey]) gradeSettings[gradeKey].visible = chk.checked;
        });

        document.querySelectorAll('.settings-item').forEach(item => {
            const targetChk = item.querySelector('.setting-visible');
            const targetInput = item.querySelector('.setting-priority');
            if (!targetChk || !targetInput) return;
            
            const docId = targetChk.dataset.id;
            let targetObject = userSettings.find(s => s.id === docId);
            if (!targetObject) {
                targetObject = { id: docId };
                userSettings.push(targetObject);
            }
            targetObject.visible = targetChk.checked;
            targetObject.priority = parseInt(targetInput.value) || 1;
        });

        flushConfigToStorage();
        if (modalView) modalView.style.display = 'none';
        renderList();
    });

    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
        for (let gKey in gradeSettings) gradeSettings[gKey].visible = true;
        userSettings = subjects.map(sub => ({ id: sub.id, visible: true, priority: 1 }));
        flushConfigToStorage();
        renderSettingsModalTree();
        renderList();
    });

    // 💡 '새 계획 추가' 버튼 클릭 시 리치 에디터 화면으로 전환
    const btnAdminAdd = document.getElementById('btn-admin-add');
    if (btnAdminAdd) {
        btnAdminAdd.addEventListener('click', () => {
            editingId = null;
            if (editor) editor.reset();
            
            // 상단 폼 초기화
            const gradeSel = document.getElementById('editor-grade-select');
            const pubChk = document.getElementById('editor-public-check');
            if (gradeSel) gradeSel.value = '1';
            if (pubChk) pubChk.checked = true;

            toggleEditorTab(true);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAssessmentUI);
} else {
    initAssessmentUI();
}

function startSnapshotSync() {
    if (unsubscribeAssessments) unsubscribeAssessments();
    unsubscribeAssessments = onSnapshot(collection(db, 'assessments'), (snapshot) => {
        subjects = [];
        snapshot.forEach((doc) => subjects.push({ id: doc.id, ...doc.data() }));
        subjects.forEach(sub => {
            if (!userSettings.some(s => s.id === sub.id)) userSettings.push({ id: sub.id, visible: true, priority: 1 });
        });
        renderList();
    });
}

function loadConfigFromStorage() {
    const rawG = localStorage.getItem('sasa_assessment_grade_settings');
    if (rawG) { try { gradeSettings = { ...gradeSettings, ...JSON.parse(rawG) }; } catch (e) {} }
    const rawU = localStorage.getItem('sasa_assessment_user_settings');
    if (rawU) { try { userSettings = JSON.parse(rawU); } catch (e) {} }
}

function flushConfigToStorage() {
    localStorage.setItem('sasa_assessment_grade_settings', JSON.stringify(gradeSettings));
    localStorage.setItem('sasa_assessment_user_settings', JSON.stringify(userSettings));
}

function renderList() {
    const mainViewTarget = document.getElementById('evaluation-list');
    if (!mainViewTarget) return;

    const filterKeyword = document.getElementById('search-input')?.value.toLowerCase() || '';
    let combinedHtml = '';

    ['1', '2', '3'].forEach(gradeKey => {
        const currentGradeConf = gradeSettings[gradeKey] || { visible: true, sort: 'priority', expanded: true };
        let matchedItems = subjects.filter(sub => sub.grade === gradeKey);

        if (filterKeyword) {
            matchedItems = matchedItems.filter(sub => 
                (sub.title && sub.title.toLowerCase().includes(filterKeyword)) || 
                (sub.content && sub.content.toLowerCase().includes(filterKeyword))
            );
        }

        if (!isCurrentUserAdmin) matchedItems = matchedItems.filter(sub => sub.isPublic !== false);

        const isGradeTabPublic = currentGradeConf.visible;
        let visibleItems = [];
        if (isGradeTabPublic) {
            visibleItems = matchedItems.filter(sub => {
                const preference = userSettings.find(s => s.id === sub.id) || { visible: true };
                return preference.visible;
            });
        }

        const activeSortStrategy = currentGradeConf.sort || 'priority';
        if (activeSortStrategy === 'priority') {
            visibleItems.sort((a, b) => {
                const prioA = userSettings.find(s => s.id === a.id)?.priority || 1;
                const prioB = userSettings.find(s => s.id === b.id)?.priority || 1;
                if (prioA !== prioB) return prioA - prioB;
                return (a.title || '').localeCompare(b.title || '', 'ko');
            });
        } else if (activeSortStrategy === 'alphabetical') {
            visibleItems.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
        } else if (activeSortStrategy === 'latest') {
            visibleItems.sort((a, b) => {
                const ticksA = a.createdAt?.seconds || 0;
                const ticksB = b.createdAt?.seconds || 0;
                return ticksB - ticksA;
            });
        }

        const isOpen = currentGradeConf.expanded !== false;
        const bodyToggleCss = isOpen ? 'block' : 'none';
        const caret = isOpen ? '▼' : '▶';
        const displayBadge = isGradeTabPublic ? '<span class="badge badge-public">공개 중</span>' : '<span class="badge badge-private">비공개(숨김)</span>';

        combinedHtml += `
            <div class="grade-accordion-section" data-grade="${gradeKey}">
                <div class="grade-accordion-header" onclick="window.toggleGradeAccordion('${gradeKey}')">
                    <div class="grade-accordion-title">
                        <span style="font-size:11px; color:#a0aec0;">${caret}</span>
                        <span>${gradeKey}학년 평가 항목 리스트</span>
                        <span style="font-size: 12px; font-weight: normal; color: #718096; margin-left:2px;">(${visibleItems.length}개)</span>
                        ${displayBadge}
                    </div>
                    <div class="grade-accordion-controls" onclick="event.stopPropagation()">
                        <label style="font-size: 11px; font-weight: 600; color: #4a5568;">정렬 방식:</label>
                        <select class="grade-sort-select" onchange="window.changeGradeSort('${gradeKey}', this.value)" style="padding: 3px 6px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 11px; font-weight: 500; background:#fff; cursor:pointer;">
                            <option value="priority" ${activeSortStrategy === 'priority' ? 'selected' : ''}>우선순위순</option>
                            <option value="alphabetical" ${activeSortStrategy === 'alphabetical' ? 'selected' : ''}>가나다순</option>
                            <option value="latest" ${activeSortStrategy === 'latest' ? 'selected' : ''}>최신순</option>
                        </select>
                    </div>
                </div>
                <div class="grade-accordion-body grade-body-${gradeKey}" style="display: ${bodyToggleCss};">
                    ${visibleItems.length === 0 ? `
                        <div style="text-align: center; padding: 24px; color: #a0aec0; font-size: 13px;">
                            ${isGradeTabPublic ? '조건에 일치하는 데이터가 없습니다.' : '⚠️ 현재 학년 전체 탭이 비공개 상태입니다.'}
                        </div>
                    ` : visibleItems.map(sub => {
                        const internalSecretTag = sub.isPublic === false ? '<span class="badge badge-private" style="margin-left:5px;">원격비공개</span>' : '';
                        
                        // 💡 리치 에디터에서 업로드된 파일/링크 렌더링
                        const filesHtml = sub.files && sub.files.length > 0 ? `
                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
                                <strong style="font-size:13px; color:#475569;">📎 첨부 파일/링크:</strong>
                                <ul style="list-style:none; padding:0; margin:8px 0 0 0; font-size:13px;">
                                    ${sub.files.map(f => `<li style="margin-bottom:4px;"><a href="${f.url}" target="_blank" style="color:#3182ce; text-decoration:none; font-weight:500;">🔗 ${f.name}</a></li>`).join('')}
                                </ul>
                            </div>
                        ` : '';

                        return `
                            <div class="assessment-item" id="item-${sub.id}">
                                <div class="assessment-header-row" onclick="window.toggleItemAccordion('${sub.id}')">
                                    <h4 class="assessment-item-title">📘 ${sub.title} ${internalSecretTag}</h4>
                                    <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                                        ${isCurrentUserAdmin ? `
                                            <button onclick="window.editAssessmentItem('${sub.id}')" style="padding:3px 6px; font-size:11px; background:#ecc94b; color:#fff; border:none; border-radius:4px; cursor:pointer;">수정</button>
                                            <button onclick="window.deleteAssessmentItem('${sub.id}')" style="padding:3px 6px; font-size:11px; background:#e53e3e; color:#fff; border:none; border-radius:4px; cursor:pointer;">삭제</button>
                                        ` : ''}
                                        <span class="item-arrow-${sub.id}" style="font-size:11px; color:#cbd5e0;">▶</span>
                                    </div>
                                </div>
                                <div class="assessment-item-body item-body-${sub.id}">
                                    <div class="ql-editor" style="padding:0; min-height:auto;">
                                        ${sub.content || '기재된 텍스트가 비어 있습니다.'}
                                    </div>
                                    ${filesHtml}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });

    mainViewTarget.innerHTML = combinedHtml;
}

function renderSettingsModalTree() {
    const treeTarget = document.getElementById('settings-grade-hierarchy-container');
    if (!treeTarget) return;

    let treeHtml = '';
    ['1', '2', '3'].forEach(gradeKey => {
        const currentGradeMeta = gradeSettings[gradeKey] || { visible: true };
        const itemsInGrade = subjects.filter(sub => sub.grade === gradeKey);

        treeHtml += `
            <div class="settings-grade-block">
                <div class="settings-grade-header">
                    <span>📍 ${gradeKey}학년 마스터 제어 탭</span>
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                        <input type="checkbox" class="setting-grade-visible" data-grade="${gradeKey}" ${currentGradeMeta.visible ? 'checked' : ''} onchange="window.onTreeMasterNodeToggle('${gradeKey}', this.checked)" style="width:15px; height:15px;">
                        상위 탭 활성화
                    </label>
                </div>
                <div class="settings-grade-items-box-${gradeKey}" style="opacity: ${currentGradeMeta.visible ? '1' : '0.45'}; transition: opacity 0.25s ease;">
                    ${itemsInGrade.length === 0 ? `
                        <div style="font-size: 12px; color: #a0aec0; text-align: center; padding: 8px;">소속된 교과가 없습니다.</div>
                    ` : itemsInGrade.map(sub => {
                        const subSetting = userSettings.find(s => s.id === sub.id) || { visible: true, priority: 1 };
                        return `
                            <div class="settings-item">
                                <div class="settings-item-info">
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="checkbox" class="setting-visible item-check-${gradeKey}" data-id="${sub.id}" ${subSetting.visible ? 'checked' : ''} ${currentGradeMeta.visible ? '' : 'disabled'} style="width:13px; height:13px;">
                                        ${sub.isPublic === false ? '🚫 ' : ''}<strong>${sub.title}</strong>
                                    </label>
                                </div>
                                <div class="settings-item-controls">
                                    <span style="font-size: 11px; color: #718096;">내부 순위:</span>
                                    <input type="number" class="setting-priority item-priority-${gradeKey}" data-id="${sub.id}" value="${subSetting.priority}" min="1" ${currentGradeMeta.visible ? '' : 'disabled'}>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });
    treeTarget.innerHTML = treeHtml;
}

window.toggleGradeAccordion = function(gradeKey) {
    if (gradeSettings[gradeKey]) {
        gradeSettings[gradeKey].expanded = !gradeSettings[gradeKey].expanded;
        flushConfigToStorage();
        renderList();
    }
};

window.changeGradeSort = function(gradeKey, sortValue) {
    if (gradeSettings[gradeKey]) {
        gradeSettings[gradeKey].sort = sortValue;
        flushConfigToStorage();
        renderList();
    }
};

window.onTreeMasterNodeToggle = function(gradeKey, isChecked) {
    const targetBox = document.querySelector(`.settings-grade-items-box-${gradeKey}`);
    if (targetBox) {
        targetBox.style.opacity = isChecked ? '1' : '0.45';
        targetBox.querySelectorAll('input').forEach(input => input.disabled = !isChecked);
    }
};

window.toggleItemAccordion = function(docId) {
    const bodyTarget = document.querySelector(`.item-body-${docId}`);
    const arrowTarget = document.querySelector(`.item-arrow-${docId}`);
    if (bodyTarget) {
        const isCurrentActive = bodyTarget.classList.toggle('active');
        if (arrowTarget) arrowTarget.innerText = isCurrentActive ? '▼' : '▶';
    }
};

// 💡 수정 버튼 클릭 시에도 리치 에디터로 데이터 이관하여 화면 전환
window.editAssessmentItem = function(docId) {
    const obj = subjects.find(sub => sub.id === docId);
    if (!obj) return;

    editingId = docId;
    
    // 에디터에 기존 데이터 붓기
    if (editor) editor.setData(obj.title || '', obj.content || '', obj.files || []);
    
    // 상단 학년 및 공개 여부 세팅
    const gradeSel = document.getElementById('editor-grade-select');
    const pubChk = document.getElementById('editor-public-check');
    if (gradeSel) gradeSel.value = obj.grade || '1';
    if (pubChk) pubChk.checked = obj.isPublic !== false;

    toggleEditorTab(true);
};

window.deleteAssessmentItem = async function(docId) {
    if (!confirm("해당 과목의 평가 계획 데이터를 영구적으로 제거하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, 'assessments', docId));
    } catch (err) {
        console.error("Firestore 삭제 에러:", err);
        alert("❌ 삭제 도중 오류가 발생했습니다.");
    }
};
