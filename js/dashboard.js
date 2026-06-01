// js/dashboard.js
import { db } from './firebase-init.js';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { NoticeEditor } from './rich-editor.js';

let currentUid = null;
let isCurrentUserAdmin = false;
let unsubscribeGlobals = null;
let editorInstance = null;
let editingNoticeIndex = null;
let currentNotices = [];

const defaultLatexGuide = [
    { category: "1. 구별 기호 및 그리스 문자", inputs: [{ syntax: "\\dot{a}, \\ddot{a}", desc: "문자 위 점 기호", example: "$\\dot{a}, \\ddot{a}$" }] }
];

window.triggerDashboardLoad = () => {
    console.log("📊 [대시보드] 데이터 로딩엔진 가동...");
};

const auth = getAuth();
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        try {
            const userDoc = await getDoc(doc(db, `users/${currentUid}`));
            isCurrentUserAdmin = (userDoc.exists() && userDoc.data().isAdmin === true);
        } catch (e) { isCurrentUserAdmin = false; }
        
        loadGlobalNotices();
    } else {
        if (unsubscribeGlobals) unsubscribeGlobals();
        const formContainer = document.getElementById('admin-notice-form-container');
        if(formContainer) formContainer.remove();
    }
});

function loadGlobalNotices() {
    if (unsubscribeGlobals) unsubscribeGlobals();
    const settingsRef = doc(db, 'system', 'globals');

    unsubscribeGlobals = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentNotices = data.notices || [];
            renderAdminNoticeForm(data.latexGuide || defaultLatexGuide);
            renderDashboardNotices(currentNotices);
        }
    });
}

function renderAdminNoticeForm(latexGuide) {
    if (!isCurrentUserAdmin) return;
    const listEl = document.getElementById('notice-list-container');
    if (!listEl || document.getElementById('admin-notice-form-container')) return;

    const formContainer = document.createElement('div');
    formContainer.id = 'admin-notice-form-container';
    listEl.parentNode.insertBefore(formContainer, listEl);

    editorInstance = new NoticeEditor('admin-notice-form-container', latexGuide, {
        onSubmit: async (data) => {
            const settingsRef = doc(db, 'system', 'globals');
            const newNoticeObj = {
                title: data.title,
                body: data.bodyHtml,
                files: data.files,
                createdAt: new Date().toISOString()
            };

            if (editingNoticeIndex !== null) {
                currentNotices[editingNoticeIndex] = newNoticeObj;
            } else {
                currentNotices.push(newNoticeObj);
            }
            await updateDoc(settingsRef, { notices: currentNotices });
            editingNoticeIndex = null;
            editorInstance.reset();
        },
        onCancel: () => { editingNoticeIndex = null; }
    });
}

function renderDashboardNotices(notices) {
    const titleEl = document.getElementById('latest-notice-title');
    const listEl = document.getElementById('notice-list-container');
    if (!titleEl || !listEl) return;

    const latestNotice = notices.length > 0 ? notices[notices.length - 1] : null;
    titleEl.innerText = latestNotice ? latestNotice.title : "등록된 공지사항이 없습니다.";

    let html = '';
    if (notices.length === 0) {
        html = '<p style="padding:15px; color:#666;">등록된 학교 공지사항이 존재하지 않습니다.</p>';
    } else {
        notices.slice().reverse().forEach((n, reversedIndex) => {
            const originalIndex = notices.length - 1 - reversedIndex;
            let filesHtml = '';
            if (n.files && n.files.length > 0) {
                filesHtml = `<div style="margin-top:10px; padding:10px; background:#f0f4f9; border-radius:6px;"><span style="font-size:12px; font-weight:bold; color:#1a73e8;">📎 첨부파일</span><ul style="margin:5px 0 0 0; padding-left:15px;">`;
                n.files.forEach(f => { filesHtml += `<li><a href="${f.url}" target="_blank" style="font-size:13px; color:#1a73e8; text-decoration:none;">${f.name}</a></li>`; });
                filesHtml += `</ul></div>`;
            }

            html += `
                <div style="border-bottom:1px solid #f1f3f4; padding:12px 5px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="document.getElementById('dash-nb-${originalIndex}').style.display = document.getElementById('dash-nb-${originalIndex}').style.display === 'none' ? 'block' : 'none'">
                        <span style="font-size:14px; font-weight:600; color:#202124;">📢 ${n.title}</span>
                        ${isCurrentUserAdmin ? `
                            <div>
                                <button class="btn-dash-edit" data-index="${originalIndex}" style="background:none; border:none; cursor:pointer;">✏️</button>
                                <button class="btn-dash-delete" data-index="${originalIndex}" style="background:none; border:none; cursor:pointer;">🗑️</button>
                            </div>
                        ` : ''}
                    </div>
                    <div id="dash-nb-${originalIndex}" style="display:none; padding:12px; background:#f8f9fa; border-radius:6px; margin-top:8px;" class="ql-editor">
                        <div>${n.body || ''}</div>
                        ${filesHtml}
                    </div>
                </div>
            `;
        });
    }
    listEl.innerHTML = html;

    if (window.renderMathInElement) {
        renderMathInElement(listEl, { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}] });
    }
}

// 이벤트 핸들러 바인딩 (수정 및 삭제 제어)
document.addEventListener('click', async (e) => {
    const settingsRef = doc(db, 'system', 'globals');
    if (e.target.closest('.btn-dash-edit')) {
        editingNoticeIndex = parseInt(e.target.closest('.btn-dash-edit').dataset.index, 10);
        const notice = currentNotices[editingNoticeIndex];
        if (editorInstance) editorInstance.setData(notice.title, notice.body, notice.files || []);
    }
    if (e.target.closest('.btn-dash-delete')) {
        if (confirm("이 공지사항을 영구 삭제하시겠습니까?")) {
            const idx = parseInt(e.target.closest('.btn-dash-delete').dataset.index, 10);
            currentNotices.splice(idx, 1);
            await updateDoc(settingsRef, { notices: currentNotices });
        }
    }
});
