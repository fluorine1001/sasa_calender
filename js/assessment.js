import { db } from './firebase-init.js';
import { 
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { NoticeEditor } from './rich-editor.js';

console.log("🚀 [Assessment Debug] assessment.js 파일 로드 시작");

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeAssessments = null;
let editorInstance = null; 
let editingId = null;      

let subjects = []; 
let userSettings = []; 

let gradeSettings = {
    '1': { visible: true, sort: 'priority', expanded: true },
    '2': { visible: true, sort: 'priority', expanded: true },
    '3': { visible: true, sort: 'priority', expanded: true }
};

const defaultLatexGuide = [
    { category: "1. 구별 기호 및 그리스 문자", inputs: [{ syntax: "\\dot{a}, \\ddot{a}", desc: "문자 위 점 기호", example: "$\\dot{a}, \\ddot{a}$" }] }
];

// 🔒 초기화 실행 함수
function initializeAssessmentModule() {
    console.log("🎬 [Assessment Debug] initializeAssessmentModule() 실행됨");

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
            .settings-item-info { display: flex; align-items: center; gap: 10px; font-size: 13px; }
            .settings-item-controls { display: flex; align-items: center; gap: 10px; }
            .setting-priority { width: 52px; padding: 4px; border: 1px solid #cbd5e0; border-radius: 4px; text-align: center; font-size: 12px; }
            
            .badge { padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; }
            .badge-public { background: #e6fffa; color: #319795; }
            .badge-private { background: #fff5f5; color: #e53e3e; }
        `;
        document.head.appendChild(style);
        console.log("🎨 [Assessment Debug] 커스텀 CSS 스타일 주입 완료");
    }

    // 🔍 [핵심 디버깅] HTML 안에 ID들이 정상적으로 존재하는지 교차 검증 검사기
    console.log("🔍 [Assessment Debug] 현재 HTML 문서 내 주요 ID 연결 상태 점검...");
    const targetIDs = [
        'btn-user-settings', 'assessment-settings-modal', 'assessment-btn-close-x', 
        'assessment-btn-save', 'assessment-btn-reset', 'btn-admin-add', 
        'assessment-tab-editor-view', 'assessment-editor-container', 
        'assessment-editor-grade-select', 'assessment-editor-public-check', 'evaluation-list'
    ];
    
    targetIDs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`✅ [ID 매칭 성공] "${id}" 요소를 정상적으로 찾았습니다.`, element);
        } else {
            console.error(`🚨 [ID 매칭 실패!!] "${id}" 요소가 현재 HTML에 존재하지 않습니다! 관련 기능이 100% 작동하지 않습니다.`);
            
            const alternativeId = id.replace('assessment-', '').replace('btn-save', 'btn-close-settings').replace('btn-reset', 'btn-reset-settings').replace('btn-close-x', 'btn-close-settings-x');
            if (document.getElementById(alternativeId)) {
                console.warn(`💡 [힌트] "${id}" 대신 접두사가 없는 구형 ID "${alternativeId}"가 HTML에 남아있습니다. HTML 태그의 ID를 수정하셔야 합니다!`);
            }
        }
    });

    // 📦 [위치 오류 해결 보정 레이아웃 패치]
    const listView = document.getElementById('tab-list-view');
    const editorView = document.getElementById('assessment-tab-editor-view') || document.getElementById('tab-editor-view');
    if (listView && editorView && editorView.parentNode !== listView.parentNode) {
        console.log("📦 [레이아웃 보정] 에디터 뷰가 메인 콘텐츠 영역 밖에 위치하여 리스트 뷰의 부모 내부로 이동 조치되었습니다.");
        listView.parentNode.appendChild(editorView);
    }

    loadConfigFromStorage();

    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        console.log("🔐 [Assessment Debug] 인증 상태 감지됨:", user ? `UID: ${user.uid}` : "로그아웃 상태");
        if (user) {
            currentUid = user.uid;
            try {
                const userDoc = await getDoc(doc(db, `users/${currentUid}`));
                isCurrentUserAdmin = (userDoc.exists() && userDoc.data().isAdmin === true);
                console.log(`🛡️ [Assessment Debug] 관리자 여부 검증 결과: ${isCurrentUserAdmin}`);
            } catch (e) { 
                console.error("🚨 관리자 정보 획득 실패:", e);
                isCurrentUserAdmin = false; 
            }
            
            if (isCurrentUserAdmin) {
                document.querySelectorAll('#btn-admin-add, .admin-only').forEach(el => el.style.setProperty('display', 'inline-block', 'important'));
                initRichEditorInstance(); 
            } else {
                document.querySelectorAll('#btn-admin-add, .admin-only').forEach(el => el.style.setProperty('display', 'none', 'important'));
            }
            startSnapshotSync();
        } else {
            currentUid = null;
            isCurrentUserAdmin = false;
            document.querySelectorAll('#btn-admin-add, .admin-only').forEach(el => el.style.setProperty('display', 'none', 'important'));
            if (unsubscribeAssessments) unsubscribeAssessments();
        }
    });

    document.getElementById('search-input')?.addEventListener('input', () => {
        console.log("⌨️ 검색어 입력 감지됨");
        renderList();
    });

    const settingsModal = document.getElementById('assessment-settings-modal');

    // 1. 설정 창 열기 버튼
    const btnUserSettings = document.getElementById('btn-user-settings');
    if (btnUserSettings) {
        btnUserSettings.addEventListener('click', () => {
            console.log("🔘 [클릭 로그] '맞춤 설정(톱니바퀴)' 버튼이 클릭되었습니다.");
            renderSettingsModalTree();
            if (settingsModal) {
                settingsModal.style.display = 'flex';
                console.log("🔓 맞춤 설정 모달창 노출 (display = flex)");
            } else {
                console.error("🚨 settingsModal 요소가 없어서 창을 열 수 없습니다.");
            }
        });
    }

    // 2. 상단 ✕ 버튼
    const btnCloseX = document.getElementById('assessment-btn-close-x') || document.getElementById('btn-close-settings-x');
    if (btnCloseX) {
        btnCloseX.addEventListener('click', () => {
            console.log("🔘 [클릭 로그] 모달 상단 '✕' 닫기 버튼이 클릭되었습니다.");
            if (settingsModal) settingsModal.style.display = 'none';
        });
    }

    // 3. 설정 저장 및 닫기 버튼
    const btnSave = document.getElementById('assessment-btn-save') || document.getElementById('btn-close-settings');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            console.log("🔘 [클릭 로그] '설정 저장 및 닫기' 버튼이 클릭되었습니다.");
            
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
            renderList();
            if (settingsModal) settingsModal.style.display = 'none';
            alert("✅ 맞춤 설정이 성공적으로 저장되었습니다.");
            console.log("💾 맞춤 설정 로컬 스토리지 저장 및 반영 완료");
        });
    }

    // 4. 기본값 초기화 버튼
    const btnReset = document.getElementById('assessment-btn-reset') || document.getElementById('btn-reset-settings');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            console.log("🔘 [클릭 로그] '기본값 초기화' 버튼이 클릭되었습니다.");
            if (!confirm("모든 설정을 초기화하고 기본 상태로 되돌리시겠습니까?")) return;
            gradeSettings = {
                '1': { visible: true, sort: 'priority', expanded: true },
                '2': { visible: true, sort: 'priority', expanded: true },
                '3': { visible: true, sort: 'priority', expanded: true }
            };
            userSettings = subjects.map(sub => ({ id: sub.id, visible: true, priority: 1 }));
            
            flushConfigToStorage();
            renderSettingsModalTree(); 
            renderList();
            alert("🔄 설정이 초기화되었습니다. '설정 저장 및 닫기'를 누르면 최종 반영됩니다.");
        });
    }

    // ➕ "새 계획 추가" 클릭 이벤트 및 로그
    const btnAdminAdd = document.getElementById('btn-admin-add');
    if (btnAdminAdd) {
        btnAdminAdd.addEventListener('click', () => {
            console.log("🔘 [클릭 로그] '[➕ 새 계획 추가]' 버튼이 클릭되었습니다.");
            editingId = null;
            if (editorInstance && typeof editorInstance.reset === 'function') {
                editorInstance.reset();
                console.log("🔄 에디터 인스턴스 폼 초기화 완료");
            } else {
                console.warn("⚠️ 에디터 인스턴스가 존재하지 않거나 reset 메소드가 없습니다.");
            }
            
            const gradeSelect = document.getElementById('assessment-editor-grade-select') || document.getElementById('editor-grade-select');
            const publicCheck = document.getElementById('assessment-editor-public-check') || document.getElementById('editor-public-check');
            
            if (gradeSelect) {
                gradeSelect.value = "1";
                console.log("🎯 대상 학년 셀렉트 박스 기본값 '1학년' 강제 지정 성공");
            } else {
                console.error("🚨 대상 학년 셀렉트 박스(ID: assessment-editor-grade-select)를 찾을 수 없습니다.");
            }
            
            if (publicCheck) publicCheck.checked = true;
            
            switchToEditorView(); 
        });
    }

    // 🏃 타 메뉴/탭 이동 시 에디터 폼 자동 닫기 핸들러
    document.addEventListener('click', (e) => {
        const isExternalTabClick = e.target.closest('.sidebar, #sidebar, .sidebar-menu, .nav-tabs, [data-tab]') && 
                                   !e.target.closest('#btn-admin-add, #btn-user-settings, #assessment-settings-modal');
        
        if (isExternalTabClick) {
            console.log("🏃 [Assessment Debug] 다른 탭으로의 이동이 감지되어 작성 중인 에디터창을 닫습니다.");
            editingId = null;
            if (editorInstance && typeof editorInstance.reset === 'function') editorInstance.reset();
            switchToListView();
        }
    });

    switchToListView();
}

// ✍️ 리치 에디터 라이브러리 연동 및 데이터 아이디 기반 분리 저장 설계 적용
function initRichEditorInstance() {
    const containerId = document.getElementById('assessment-editor-container') ? 'assessment-editor-container' : 'editor-container';
    console.log(`✍️ [Assessment Debug] 에디터 초기화 시도중... 대상 컨테이너 ID: "${containerId}"`);
    
    if (!document.getElementById(containerId)) {
        console.error(`🚨 에디터 컨테이너 ID "${containerId}"가 HTML에 없어 초기화가 중단되었습니다.`);
        return;
    }

    if (editorInstance) {
        console.log("✨ 에디터 인스턴스가 이미 존재하므로 재지정하지 않고 건너뜁니다.");
        return;
    }

    try {
        editorInstance = new NoticeEditor(containerId, defaultLatexGuide, {
            onSubmit: async (data) => {
                console.log("💾 에디터 전송(Submit) 이벤트 트리거됨", data);
                const gradeSelect = document.getElementById('assessment-editor-grade-select') || document.getElementById('editor-grade-select');
                const publicCheck = document.getElementById('assessment-editor-public-check') || document.getElementById('editor-public-check');
                
                const selectedGrade = gradeSelect ? gradeSelect.value : "1";
                const isPublicChecked = publicCheck ? publicCheck.checked : true;

                try {
                    const batch = writeBatch(db);

                    if (editingId) {
                        // [수정 모드] 고유 데이터 참조 ID를 기반으로 공통 알맹이 데이터와 연동 항목 일괄 수정
                        const currentMeta = subjects.find(sub => sub.id === editingId);
                        const sharedContentId = currentMeta.contentId;

                        // 1. 알맹이(본문 및 첨부파일) 데이터 업데이트
                        batch.update(doc(db, 'assessment_contents', sharedContentId), {
                            content: data.bodyHtml,
                            files: data.files || []
                        });

                        // 2. 이 본문을 공유(링크)하고 있는 메타데이터 일괄 동기화 업데이트 (단일 진실 원칙)
                        const relatedMetas = subjects.filter(sub => sub.contentId === sharedContentId);
                        relatedMetas.forEach(meta => {
                            batch.update(doc(db, 'assessments', meta.id), {
                                title: data.title,
                                grade: meta.id === editingId ? selectedGrade : meta.grade, // 현재 가리키는 학년 변경 대응
                                isPublic: isPublicChecked,
                                updatedAt: serverTimestamp()
                            });
                        });

                        await batch.commit();
                        console.log(`📝 기존 문서 및 연동 본문 수정 완료 ID: ${editingId}`);
                    } else {
                        // [신규 등록 모드] 공통으로 사용할 무거운 데이터 본문 ID 선발급 후 링크 연결식 저장
                        const contentDocRef = doc(collection(db, 'assessment_contents'));
                        const sharedContentId = contentDocRef.id;

                        // 1. 본문 데이터 전용 컬렉션에 무거운 알맹이 1회만 격리 저장
                        batch.set(contentDocRef, {
                            content: data.bodyHtml,
                            files: data.files || []
                        });

                        // 2. 참조형 링크 정보를 담은 가벼운 메타데이터 문서 저장
                        const metaDocRef = doc(collection(db, 'assessments'));
                        const payload = {
                            id: metaDocRef.id,
                            grade: selectedGrade,
                            title: data.title,
                            contentId: sharedContentId, // 고유 데이터 아이디 연결 고리
                            isPublic: isPublicChecked,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        };
                        batch.set(metaDocRef, payload);
                        console.log(`✨ 신규 문서 추가 완료 생성된 ID: ${payload.id}`);

                        await batch.commit();
                    }
                    editingId = null;
                    if (editorInstance && typeof editorInstance.reset === 'function') editorInstance.reset();
                    switchToListView();
                    alert(`✅ 성공적으로 저장되어 ${selectedGrade}학년 계획에 등록되었습니다.`);
                } catch (err) {
                    console.error("🚨 Firestore 저장 도중 에러 발생:", err);
                    alert("❌ 저장 도중 문제가 발생했습니다.");
                }
            },
            onCancel: () => {
                console.log("❌ 에디터 작성 취소됨");
                editingId = null;
                if (editorInstance && typeof editorInstance.reset === 'function') editorInstance.reset();
                switchToListView();
            }
        });
        console.log("✅ 리치 에디터 인스턴스 연결 성공!");

        // 🚪 [에디터 내부 나가기 버튼 동적 생성 주입]
        const editorView = document.getElementById('assessment-tab-editor-view') || document.getElementById('tab-editor-view');
        if (editorView && !document.getElementById('assessment-custom-exit-btn')) {
            const exitBtn = document.createElement('button');
            exitBtn.id = 'assessment-custom-exit-btn';
            exitBtn.type = 'button';
            exitBtn.innerText = '나가기';
            exitBtn.style.cssText = 'padding: 6px 14px; font-size: 13px; background: #718096; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 10px; vertical-align: middle; transition: background 0.2s;';
            
            exitBtn.addEventListener('mouseover', () => exitBtn.style.background = '#4a5568');
            exitBtn.addEventListener('mouseout', () => exitBtn.style.background = '#718096');
            exitBtn.addEventListener('click', () => {
                if (confirm("작성 중인 내용을 저장하지 않고 에디터에서 나가시겠습니까?")) {
                    editingId = null;
                    if (editorInstance && typeof editorInstance.reset === 'function') editorInstance.reset();
                    switchToListView();
                }
            });

            const gradeSelect = document.getElementById('assessment-editor-grade-select') || document.getElementById('editor-grade-select');
            if (gradeSelect && gradeSelect.parentNode) {
                gradeSelect.parentNode.appendChild(exitBtn);
                console.log("🎯 학년 선택 제어판 영역 옆에 [나가기] 버튼 결합 성공");
            } else {
                const container = document.getElementById(containerId);
                if (container && container.parentNode) {
                    container.parentNode.insertBefore(exitBtn, container);
                    console.log("🎯 에디터 상단에 [나가기] 버튼 삽입 성공");
                }
            }
        }

    } catch (e) {
        console.error("🚨 NoticeEditor 인스턴스 생성 중 크리티컬 에러 발생:", e);
    }
}

function switchToListView() {
    console.log("🔄 [화면 전환] 리스트 뷰 활성화 요청");
    const listView = document.getElementById('tab-list-view');
    const editorView = document.getElementById('assessment-tab-editor-view') || document.getElementById('tab-editor-view');
    
    if (listView) listView.style.display = 'block';
    if (editorView) editorView.style.display = 'none';
}

function switchToEditorView() {
    console.log("🔄 [화면 전환] 에디터 작성 폼 뷰 활성화 요청");
    const listView = document.getElementById('tab-list-view');
    const editorView = document.getElementById('assessment-tab-editor-view') || document.getElementById('tab-editor-view');
    
    if (listView) {
        listView.style.display = 'none';
        console.log("🙈 리스트 뷰 숨김 완료 (display = none)");
    }
    if (editorView) {
        editorView.style.display = 'block';
        console.log("👀 에디터 뷰 노출 완료 (display = block)");
    } else {
        console.error("🚨 에디터 뷰 엘리먼트가 존재하지 않아 노출 처리에 실패했습니다!");
    }
}

// 📡 실시간 메타 동기화 (가벼운 참조 정보만 구독하여 트래픽 대폭 최소화)
function startSnapshotSync() {
    console.log("📡 [Assessment Debug] Firestore 실시간 동기화 스냅샷 시작");
    if (unsubscribeAssessments) unsubscribeAssessments();
    
    unsubscribeAssessments = onSnapshot(collection(db, 'assessments'), (snapshot) => {
        console.log(`📥 Firestore에서 ${snapshot.size}개의 문서 수신함`);
        
        // 스냅샷 갱신 시 이미 열어서 확보해 둔 본문 정보 상태의 누수를 전면 차단하기 위해 이전 버퍼 추적 결합
        const oldSubjects = [...subjects];
        subjects = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const preLoadedItem = oldSubjects.find(s => s.id === doc.id);
            
            if (preLoadedItem && preLoadedItem.isContentLoaded) {
                // 이미 화면상에서 가져와 로딩된 내역이 존재한다면 캐싱 데이터 보존 연동
                subjects.push({
                    id: doc.id,
                    ...data,
                    isContentLoaded: true,
                    content: preLoadedItem.content,
                    files: preLoadedItem.files
                });
            } else {
                // 최초 데이터 진입 시에는 무거운 본문을 빈 공간으로 마킹
                subjects.push({ 
                    id: doc.id, 
                    ...data,
                    isContentLoaded: false,
                    content: '',
                    files: []
                });
            }
        });
        
        subjects.forEach(sub => {
            if (!userSettings.some(s => s.id === sub.id)) {
                userSettings.push({ id: sub.id, visible: true, priority: 1 });
            }
        });
        renderList();
    }, (error) => {
        console.error("🚨 스냅샷 수신 중 Firestore 보안 규칙 오류 또는 끊김 발생:", error);
    });
}

function loadConfigFromStorage() {
    const rawG = localStorage.getItem('sasa_assessment_grade_settings');
    if (rawG) { try { gradeSettings = { ...gradeSettings, ...JSON.parse(rawG) }; } catch (e) {} }
    const rawU = localStorage.getItem('sasa_assessment_user_settings');
    if (rawU) { try { userSettings = JSON.parse(rawU); } catch (e) {} }
    console.log("⚙️ 로컬 스토리지 설정값 로드 성공");
}

function flushConfigToStorage() {
    localStorage.setItem('sasa_assessment_grade_settings', JSON.stringify(gradeSettings));
    localStorage.setItem('sasa_assessment_user_settings', JSON.stringify(userSettings));
}

function renderList() {
    const mainViewTarget = document.getElementById('evaluation-list');
    if (!mainViewTarget) {
        console.error("🚨 'evaluation-list' 결과 컨테이너 영역이 HTML에 없습니다. 목록을 그릴 수 없습니다.");
        return;
    }

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
                        
                        let filesHtml = '';
                        if (sub.isContentLoaded && sub.files && sub.files.length > 0) {
                            filesHtml = `<div style="margin-top:14px; padding:10px; background:#f0f4f9; border-radius:6px;"><span style="font-size:12px; font-weight:bold; color:#1a73e8;">📎 첨부파일</span><ul style="margin:5px 0 0 0; padding-left:15px; list-style-type:none;">`;
                            sub.files.forEach(f => { filesHtml += `<li style="margin-bottom:2px;"><a href="${f.url}" target="_blank" style="font-size:13px; color:#1a73e8; text-decoration:none; font-weight:500;">${f.name}</a></li>`; });
                            filesHtml += `</ul></div>`;
                        }

                        return `
                            <div class="assessment-item" id="item-${sub.id}">
                                <div class="assessment-header-row" onclick="window.toggleItemAccordion('${sub.id}')">
                                    <h4 class="assessment-item-title">📘 ${sub.title} ${internalSecretTag}</h4>
                                    <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                                        ${isCurrentUserAdmin ? `
                                            <button onclick="window.editAssessmentItem('${sub.id}')" style="padding:3px 8px; font-size:11px; background:#ecc94b; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">수정</button>
                                            <button onclick="window.deleteAssessmentItem('${sub.id}')" style="padding:3px 8px; font-size:11px; background:#e53e3e; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">삭제</button>
                                        ` : ''}
                                        <span class="item-arrow-${sub.id}" style="font-size:11px; color:#cbd5e0; margin-left:4px;">▶</span>
                                    </div>
                                </div>
                                <div class="assessment-item-body item-body-${sub.id} ql-editor">
                                    <div>${sub.isContentLoaded ? (sub.content || '본문 기재 내용이 없습니다.') : ''}</div>
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

// 👑 [핵심 지연 로드 토글 구현] 사용자가 개별 항목 아코디언을 딱 열 때만 ID 기반 온디맨드 데이터 획득
window.toggleItemAccordion = async function(docId) {
    const bodyTarget = document.querySelector(`.item-body-${docId}`);
    const arrowTarget = document.querySelector(`.item-arrow-${docId}`);
    if (!bodyTarget) return;

    const isCurrentActive = bodyTarget.classList.toggle('active');
    if (arrowTarget) arrowTarget.innerText = isCurrentActive ? '▼' : '▶';

    // 토글을 열었을 때이며 + 아직 해당 원본 데이터를 서버에서 땡겨온 적이 없는 최초 1회만 처리
    if (isCurrentActive) {
        const metaObj = subjects.find(sub => sub.id === docId);
        if (metaObj && !metaObj.isContentLoaded) {
            bodyTarget.innerHTML = `<div style="text-align: center; padding: 10px; color: #a0aec0; font-size:13px;">⏳ 내용을 안전하게 불러오는 중...</div>`;
            
            try {
                // 가벼운 링크 문서에 각인되어 있는 고유 contentId 기반 알맹이 콕 집어 단독 조회
                const contentDoc = await getDoc(doc(db, 'assessment_contents', metaObj.contentId));
                
                if (contentDoc.exists()) {
                    const cData = contentDoc.data();
                    metaObj.content = cData.content || '';
                    metaObj.files = cData.files || [];
                    metaObj.isContentLoaded = true; // 로드 완료 フラ그 마킹하여 연속 호출 제거

                    // 레이아웃 전체 리빌드를 막고 해당 타겟 DOM 내부에만 내용과 첨부파일 실시간 안착
                    let filesHtml = '';
                    if (metaObj.files && metaObj.files.length > 0) {
                        filesHtml = `<div style="margin-top:14px; padding:10px; background:#f0f4f9; border-radius:6px;"><span style="font-size:12px; font-weight:bold; color:#1a73e8;">📎 첨부파일</span><ul style="margin:5px 0 0 0; padding-left:15px; list-style-type:none;">`;
                        metaObj.files.forEach(f => { filesHtml += `<li style="margin-bottom:2px;"><a href="${f.url}" target="_blank" style="font-size:13px; color:#1a73e8; text-decoration:none; font-weight:500;">${f.name}</a></li>`; });
                        filesHtml += `</ul></div>`;
                    }
                    bodyTarget.innerHTML = `<div>${metaObj.content || '본문 기재 내용이 없습니다.'}</div>${filesHtml}`;
                } else {
                    bodyTarget.innerHTML = `<div style="color:#e53e3e;">⚠️ 원본 데이터 내용을 찾을 수 없습니다.</div>`;
                }
            } catch (err) {
                console.error("항목 본문 로드 실패:", err);
                bodyTarget.innerHTML = `<div style="color:#e53e3e;">❌ 데이터를 불러오지 못했습니다.</div>`;
            }
        }
    }
};

// 📝 수정 요청 시에도 미로드 항목인 경우 원본 본문을 선제 확보하여 에디터에 안전하게 안착
window.editAssessmentItem = async function(docId) {
    console.log(`📝 [Assessment Debug] 항목 수정 요청됨 ID: ${docId}`);
    const object = subjects.find(sub => sub.id === docId);
    if (!object) return;

    editingId = docId;
    let targetContent = object.content;
    let targetFiles = object.files;

    // 만약 한 번도 아코디언을 열어보지 않고 곧바로 수정을 눌렀다면, 데이터 참조 ID 기반 본문 즉시 소싱
    if (!object.isContentLoaded) {
        try {
            const contentDoc = await getDoc(doc(db, 'assessment_contents', object.contentId));
            if (contentDoc.exists()) {
                targetContent = contentDoc.data().content || '';
                targetFiles = contentDoc.data().files || [];
            }
        } catch (e) {
            console.error("🚨 수정 대상 본문 사전 로드 실패:", e);
        }
    }
    
    const gradeSelect = document.getElementById('assessment-editor-grade-select') || document.getElementById('editor-grade-select');
    const publicCheck = document.getElementById('assessment-editor-public-check') || document.getElementById('editor-public-check');
    if (gradeSelect) gradeSelect.value = object.grade || '1';
    if (publicCheck) publicCheck.checked = object.isPublic !== false;

    if (editorInstance && typeof editorInstance.setData === 'function') {
        editorInstance.setData(object.title || '', targetContent || '', targetFiles || []);
    }

    switchToEditorView(); 
};

// 🗑️ 연동 일괄 제거 원칙 반영: 동일 고유 참조를 사용하는 항목 링크 및 본문 일괄 통합 원자적 파괴
window.deleteAssessmentItem = async function(docId) {
    const object = subjects.find(sub => sub.id === docId);
    if (!object) return;

    if (!confirm("해당 교과 평가 계획을 영구히 삭제하시겠습니까?\n(이 항목과 연동된 모든 학년의 계획 링크가 일괄 삭제됩니다.)")) return;
    try {
        const batch = writeBatch(db);
        const sharedContentId = object.contentId;

        // 1. 공통 무거운 본문 데이터 컬렉션 원본 제거
        if (sharedContentId) {
            batch.delete(doc(db, 'assessment_contents', sharedContentId));
        }

        // 2. 이 데이터 아이디(contentId) 링크를 공유하던 모든 학년별 참조 메타데이터 동시 일괄 파괴
        const relatedMetas = subjects.filter(sub => sub.contentId === sharedContentId);
        relatedMetas.forEach(meta => {
            batch.delete(doc(db, 'assessments', meta.id));
        });

        await batch.commit();
        console.log(`🗑️ 원본 ID ${sharedContentId} 및 연동 메타데이터 일괄 제거 완료`);
    } catch (err) {
        console.error("Firestore 일괄 삭제 실패:", err);
    }
};

// ⚡ DOM 상태에 관계없이 안전하게 실행 보장 유도
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAssessmentModule);
} else {
    initializeAssessmentModule();
}
