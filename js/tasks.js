import { db } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { openTaskDetail } from './calendar.js';

let currentUid = null;
let unsubscribeTasks = null;

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            subscribeTasks();
        } else {
            currentUid = null;
            if (unsubscribeTasks) unsubscribeTasks();
        }
    });

    // 수동 추가 버튼 이벤트
    document.getElementById('btn-add-task-manual').onclick = () => {
        document.getElementById('add-task-modal').style.display = 'flex';
    };

    document.getElementById('btn-create-task').onclick = handleCreateTask;
});

async function handleCreateTask() {
    const course = document.getElementById('add-task-course').value.trim();
    const title = document.getElementById('add-task-title').value.trim();
    const due = document.getElementById('add-task-due').value;
    const memo = document.getElementById('add-task-memo').value.trim();

    if (!course || !title) return alert("과목명과 제목은 필수입니다.");

    try {
        const tasksRef = collection(db, `users/${currentUid}/tasks`);
        await addDoc(tasksRef, {
            courseName: course,
            title: title,
            dueDate: due || '기한 없음',
            memo: memo,
            link: '#', // 수동 추가는 링크 없음
            createdAt: serverTimestamp()
        });

        alert("과제가 추가되었습니다.");
        document.getElementById('add-task-modal').style.display = 'none';
        // 필드 초기화
        ['add-task-course', 'add-task-title', 'add-task-due', 'add-task-memo'].forEach(id => document.getElementById(id).value = '');
    } catch (e) {
        console.error(e);
        alert("추가 중 오류가 발생했습니다.");
    }
}

function subscribeTasks() {
    if (!currentUid) return;
    const tasksRef = collection(db, `users/${currentUid}/tasks`);
    const q = query(tasksRef, orderBy("createdAt", "desc"));

    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        const listContainer = document.getElementById('tasks-list');
        if (!listContainer) return;

        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">저장된 과제가 없습니다.</p>';
            return;
        }

        const groups = {};
        snapshot.forEach(docSnap => {
            const task = { id: docSnap.id, ...docSnap.data() };
            const course = task.courseName || "기타";
            if (!groups[course]) groups[course] = [];
            groups[course].push(task);
        });

        listContainer.innerHTML = '';
        Object.keys(groups).sort().forEach(courseName => {
            const groupSection = document.createElement('div');
            groupSection.className = 'cl-course-group';
            groupSection.innerHTML = `
                <div class="cl-course-header">${courseName}</div>
                <div class="cl-list"></div>
            `;
            const subList = groupSection.querySelector('.cl-list');

            groups[courseName].sort((a, b) => b.createdAt - a.createdAt).forEach(task => {
                const item = document.createElement('div');
                item.className = 'cl-list-item';
                item.innerHTML = `
                    <div class="cl-work-info" style="flex:1; cursor:pointer;">
                        <span class="cl-work-title">${task.title} ${task.memo ? '<small title="메모 있음">📝</small>' : ''}</span>
                        <span class="cl-work-due">📅 마감: ${task.dueDate}</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        ${task.link && task.link !== '#' ? `<a href="${task.link}" target="_blank" class="cl-btn-primary" style="font-size:12px; padding:6px 12px;">클래스룸</a>` : ''}
                        <button class="btn-del" style="background:none; border:none; cursor:pointer;">🗑️</button>
                    </div>
                `;
                
                // 제목 클릭 시 상세 모달 열기
                item.querySelector('.cl-work-info').onclick = () => openTaskDetail(task);
                
                // 삭제 버튼
                item.querySelector('.btn-del').onclick = async (e) => {
                    e.stopPropagation();
                    if(confirm("이 과제를 삭제하시겠습니까?")) {
                        await deleteDoc(doc(db, `users/${currentUid}/tasks/${task.id}`));
                    }
                };
                subList.appendChild(item);
            });
            listContainer.appendChild(groupSection);
        });
    });
}