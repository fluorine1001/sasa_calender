import { db } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, deleteDoc, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { openTaskDetail } from './calendar.js';
import { checkAndSendMailReminders } from './sendemail.js';

let currentUid = null;
let unsubscribeTasks = null;

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            subscribeTasks();
            
            // 로그인 시 미발송된 알림 확인
            checkAndSendMailReminders(currentUid);
            // 1분마다 자동으로 미발송 알림이 있는지 체크
            setInterval(() => checkAndSendMailReminders(currentUid), 60000);
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

    // 마감 기한 선택 시 알림 날짜 자동 계산 (하루 전 09:00)
    document.getElementById('add-task-due').addEventListener('change', (e) => {
        if (e.target.value) {
            const dueDate = new Date(e.target.value);
            dueDate.setDate(dueDate.getDate() - 1);
            const year = dueDate.getFullYear();
            const month = String(dueDate.getMonth() + 1).padStart(2, '0');
            const day = String(dueDate.getDate()).padStart(2, '0');
            document.getElementById('add-task-reminder').value = `${year}-${month}-${day}T09:00`;
        }
    });
});

async function handleCreateTask() {
    const course = document.getElementById('add-task-course').value.trim();
    const title = document.getElementById('add-task-title').value.trim();
    const due = document.getElementById('add-task-due').value;
    const reminder = document.getElementById('add-task-reminder').value;
    const memo = document.getElementById('add-task-memo').value.trim();

    if (!course || !title) return alert("과목명과 제목은 필수입니다.");

    try {
        const tasksRef = collection(db, `users/${currentUid}/tasks`);
        await addDoc(tasksRef, {
            courseName: course,
            title: title,
            dueDate: due || '기한 없음',
            reminderDate: reminder || null,
            isNotified: false,
            memo: memo,
            link: '#', // 수동 추가는 링크 없음
            createdAt: serverTimestamp()
        });

        alert("과제가 추가되었습니다.");
        document.getElementById('add-task-modal').style.display = 'none';
        // 필드 초기화
        ['add-task-course', 'add-task-title', 'add-task-due', 'add-task-reminder', 'add-task-memo'].forEach(id => document.getElementById(id).value = '');
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
            // data 내부의 id가 문서 id(google_...)를 덮어쓰지 않도록 순서 변경
            const task = { ...docSnap.data(), id: docSnap.id };
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

            // Timestamp 객체 정렬 보정
            groups[courseName].sort((a, b) => {
                const timeA = a.createdAt?.toMillis?.() || 0;
                const timeB = b.createdAt?.toMillis?.() || 0;
                return timeB - timeA;
            }).forEach(task => {
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