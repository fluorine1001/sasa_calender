import { db } from './firebase-init.js';
import { 
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { NoticeEditor } from './rich-editor.js';

console.log("🚀 assessment.js 로드 완료 (리치 에디터 완전 연동 및 맞춤설정 인터페이스 버그 전면 수정)");

// 💡 전역 코어 데이터 상태 관리 구조
let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeAssessments = null;
let editorInstance = null; // 리치 에디터 인스턴스 변수
let editingId = null;      // 현재 수정 중인 평가 계획 문서 ID

let subjects = []; 
let userSettings = []; // 개별 과목 메타 속성 캐시: [{id: 'docId', visible: true, priority: 1}]

// 🌟 학년별 독립 제어 정보 기본 객체
let gradeSettings = {
    '1': { visible: true, sort: 'priority', expanded: true },
    '2': { visible: true, sort: 'priority', expanded: true },
    '3': { visible: true, sort: 'priority', expanded: true }
};

// 📎 리치 에디터용 기본 수식 가이드 데이터
const defaultLatexGuide = [
    { category: "1. 구별 기호 및 그리스 문자", inputs: [{ syntax: "\\dot{a}, \\ddot{a}", desc: "문자 위 점 기호", example: "$\\dot{a}, \\ddot{a}$" }] }
];

document.addEventListener('DOMContentLoaded', () => {
    // 🎨 독자적인 세련된 확장형 아코디언 컴포넌트 전용 CSS 주입
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

    // 💾 로컬 브라우저 설정 복구
    loadConfigFromStorage();

    // 🔐 dashboard.js 연동 규격 맞춤형 어드민 계정 인증 및 감시부
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            try {
                const userDoc = await getDoc(doc(db, `users/${currentUid}`));
                isCurrentUserAdmin = (userDoc.exists() && userDoc.data().isAdmin === true);
            } catch (e) { 
                isCurrentUserAdmin = false; 
            }
            
            // 실시간 권한 기반 UI 엘리먼트 노출 제어
            if (isCurrentUserAdmin) {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
                initRichEditor(); // 🛠️ 관리자일 경우 리치 에디터 인프라 엔진 기동
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
            startSnapshotSync();
        } else {
            currentUid = null;
            isCurrentUserAdmin = false;
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            if (unsubscribeAssessments) unsubscribeAssessments();
        }
    });

    // 🔍 실시간 검색창 바인딩
    document.getElementById('assessment-search')?.addEventListener('input', renderList);

    // ==========================================
    // ⚙️ 맞춤 설정 모달 제어 및 세 버튼 버그 수정 완료 영역
    // ==========================================
    const modalView = document.getElementById('assessment-settings-modal');

    // 맞춤설정 창 열기
    document.getElementById('btn-user-settings')?.addEventListener('click', () => {
        renderSettingsModalTree();
        if (modalView) modalView.style.display = 'flex';
    });

    // 👍 버그 수정 1: 우측 상단 '✕' (나가기) 버튼 이벤트 바인딩
    document.getElementById('btn-close-settings-x')?.addEventListener('click', () => {
        if (modalView) modalView.style.display = 'none';
    });

    // 👍 버그 수정 2: '설정 저장 및 닫기' 버튼 완벽 구동화
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
        // 학년 마스터 노드 상태 추출
        document.querySelectorAll('.setting-grade-visible').forEach(chk => {
            const gradeKey = chk.dataset.grade;
            if (gradeSettings[gradeKey]) gradeSettings[gradeKey].visible = chk.checked;
        });

        // 세부 항목 설정 상태 추출
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

    // 👍 버그 수정 3: '기본값 초기화' 버튼 리셋 및 트리 즉시 새로고침화
    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
        if (!confirm("모든 설정을 초기화하고 기본 상태로 되돌리시겠습니까?")) return;
        for (let gKey in gradeSettings) {
            gradeSettings[gKey].visible = true;
        }
        userSettings = subjects.map(sub => ({ id: sub.id, visible: true, priority: 1 }));
        flushConfigToStorage();
        renderSettingsModalTree(); // 트리 뷰 컴포넌트 재생성
        renderList();
    });

    // ==========================================
    // ➕ 관리자 전용 에디터 전환 처리 (Bug 1 수정 완료)
    // ==========================================
    document.getElementById('btn-add-assessment')?.addEventListener('click', () => {
        editingId = null;
        if (editorInstance) editorInstance.reset();
        
        // 에디터 상단 메타 제어 바 초기값 할당
        document.getElementById('editor-grade-select').value = "1";
        document.getElementById('editor-public-check').checked = true;
        
        switchToEditorView(); // 인라인 에디터 뷰 활성화
    });
});

// 🛠️ 리치 에디터(NoticeEditor) 라이브러리 연동 핵심 생성기
function initRichEditor() {
    if (editorInstance || !document.getElementById('editor-container')) return;

    editorInstance = new NoticeEditor('editor-container', defaultLatexGuide, {
        onSubmit: async (data) => {
            const selectedGrade = document.getElementById('editor-grade-select').value;
            const isPublicChecked = document.getElementById('editor-public-check').checked;

            const payload = {
                grade: selectedGrade,
                title: data.title,
                content: data.bodyHtml, // Quill 에디터로부터 정제된 HTML 본문 수신
                files: data.files || [],  // 파일 링크 배열 매핑
                isPublic: isPublicChecked,
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
                editingId = null;
                editorInstance.reset();
                switchToListView();
            } catch (err) {
                console.error("Firestore 평가계획 작성 트랜잭션 에러:", err);
                alert("❌ 평가 계획 저장 도중 에러가 발생했습니다.");
            }
        },
        onCancel: () => {
            editingId = null;
            editorInstance.reset();
            switchToListView();
        }
    });
}

function switchToListView() {
    document.getElementById('evaluation-list').style.display = 'block';
    document.getElementById('tab-editor-view').style.display = 'none';
}

function switchToEditorView() {
    document.getElementById('evaluation-list').style.display = 'none';
    document.getElementById('tab-editor-view').style.display = 'block';
}

// 🔄 파이어베이스 실시간 데이터 수신 채널 개방
function startSnapshotSync() {
    if (unsubscribeAssessments) unsubscribeAssessments();
    
    unsubscribeAssessments = onSnapshot(collection(db, 'assessments'), (snapshot) => {
        subjects = [];
        snapshot.forEach((doc) => {
            subjects.push({ id: doc.id, ...doc.data() });
        });
        
        subjects.forEach(sub => {
            if (!userSettings.some(s => s.id === sub.id)) {
                userSettings.push({ id: sub.id, visible: true, priority: 1 });
            }
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

// 📊 학년별 아코디언 렌더링 엔진 (Bug 2 수정 반영: evaluation-list 연동)
function renderList() {
    const mainViewTarget = document.getElementById('evaluation-list'); // 🎯 타겟 ID 버그 수정 완료
    if (!mainViewTarget) return;

    const filterKeyword = document.getElementById('assessment-search')?.value.toLowerCase() || '';
    let combinedHtml = '';

    ['1', '2', '3'].forEach(gradeKey => {
        const currentGradeConf = gradeSettings[gradeKey] || { visible: true, sort: 'priority', expanded: true };
        let matchedItems = subjects.filter(sub => sub.grade === gradeKey);

        if (filterKeyword) {
            matchedItems = matchedItems.filter(sub => 
                sub.title.toLowerCase().includes(filterKeyword) || 
                sub.content.toLowerCase().includes(filterKeyword)
            );
        }

        // 일반 학생 계정인 경우 비공개 데이터 필터 아웃
        if (!isCurrentUserAdmin) {
            matchedItems = matchedItems.filter(sub => sub.isPublic !== false);
        }

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
                return a.title.localeCompare(b.title, 'ko');
            });
        } else if (activeSortStrategy === 'alphabetical') {
            visibleItems.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
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
                        <span>${gradeKey}학년 평가 항목 계획</span>
                        <span style="font-size: 12px; font-weight: normal; color: #718096; margin-left:2px;">(총 ${visibleItems.length}개)</span>
                        ${displayBadge}
                    </div>
                    <div class="grade-accordion-controls" onclick="event.stopPropagation()">
                        <label style="font-size: 11px; font-weight: 600; color: #4a5568;">정렬:</label>
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
                            ${isGradeTabPublic ? '등록된 데이터가 없거나 맞춤설정에서 모두 해제되었습니다.' : '⚠️ 현재 학년 전체 탭이 숨김(비공개) 처리 상태입니다.'}
                        </div>
                    ` : visibleItems.map(sub => {
                        const internalSecretTag = sub.isPublic === false ? '<span class="badge badge-private" style="margin-left:5px;">원격비공개</span>' : '';
                        
                        // 에디터에서 올라온 첨부파일 리스트 파싱 컴포넌트
                        let filesHtml = '';
                        if (sub.files && sub.files.length > 0) {
                            filesHtml = `<div style="margin-top:14px; padding:10px; background:#f0f4f9; border-radius:6px;"><span style="font-size:12px; font-weight:bold; color:#1a73e8;">📎 첨부파일</span><ul style="margin:5px 0 0 0; padding-left:15px; list-style-type:none;">`;
                            sub.files.forEach(f => { filesHtml += `<li style="margin-bottom:2px;"><a href="${f.url}" target="_blank" style="font-size:13px; color:#1a73e8; text-decoration:none; font-weight:500;">${f.name}</a></li>`; });
                            filesHtml += `</ul></div>`;
                        }

                        return `
                            <div class="assessment-item" id="item-${sub.id}">
                                <div class="assessment-header-row" onclick="window.toggleItemAccordion('${sub.id}')">
                                    <h4 class="assessment-item-title">
                                        📘 ${sub.title} ${internalSecretTag}
                                    </h4>
                                    <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                                        ${isCurrentUserAdmin ? `
                                            <button onclick="window.editAssessmentItem('${sub.id}')" style="padding:3px 8px; font-size:11px; background:#ecc94b; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">수정</button>
                                            <button onclick="window.deleteAssessmentItem('${sub.id}')" style="padding:3px 8px; font-size:11px; background:#e53e3e; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">삭제</button>
                                        ` : ''}
                                        <span class="item-arrow-${sub.id}" style="font-size:11px; color:#cbd5e0; margin-left:4px;">▶</span>
                                    </div>
                                </div>
                                <div class="assessment-item-body item-body-${sub.id} ql-editor">
                                    <div>${sub.content || '본문 기재 내용이 없습니다.'}</div>
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

// ⚙️ 맞춤 설정 내의 계층 구조 트리 형성 뷰어 (Bug 3 컨테이너 타겟 매핑 수정 완료)
function renderSettingsModalTree() {
    const treeTarget = document.getElementById('assessment-settings-container'); // 🎯 HTML 내 실제 ID 구조로 완벽 수정
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
                        <div style="font-size: 12px; color: #a0aec0; text-align: center; padding: 8px;">본 학년에 등록된 과목이 없습니다.</div>
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
                                    <span style="font-size: 11px; color: #718096;">순위:</span>
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

// ==========================================
// 🔗 전역 윈도우 스코프 바인딩 브릿지 (HTML 인라인 호출 대응)
// ==========================================
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
        targetBox.querySelectorAll('input').forEach(input => {
            input.disabled = !isChecked;
        });
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

window.editAssessmentItem = function(docId) {
    const object = subjects.find(sub => sub.id === docId);
    if (!object) return;

    editingId = docId;
    
    // 에디터 상단 설정 제어 컴포넌트에 데이터 로드
    document.getElementById('editor-grade-select').value = object.grade || '1';
    document.getElementById('editor-public-check').checked = object.isPublic !== false;

    // 리치 에디터 인스턴스 내부에 본문 및 첨부파일 데이터 전송 주입
    if (editorInstance) {
        editorInstance.setData(object.title || '', object.content || '', object.files || []);
    }

    switchToEditorView(); // 에디터 폼 영역 노출
};

window.deleteAssessmentItem = async function(docId) {
    if (!confirm("해당 교과 평가 계획을 클라우드 데이터베이스에서 영구히 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, 'assessments', docId));
    } catch (err) {
        console.error("Firestore Document 제거 요청 파열:", err);
        alert("❌ 권한 거부 또는 오프라인 장애로 삭제를 완료하지 못했습니다.");
    }
};
