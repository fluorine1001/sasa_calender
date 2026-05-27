import { db } from './firebase-init.js';
import { collection, onSnapshot, query, where, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let unsubscribeTimePlan = null;
let selectedDate = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('tp-current-date');
    dateInput.value = selectedDate;

    dateInput.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        initTimePlan();
    });

    document.getElementById('tp-prev-day').onclick = () => moveDate(-1);
    document.getElementById('tp-next-day').onclick = () => moveDate(1);
    document.getElementById('tp-reset-day').onclick = resetDayPlan;

    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            initTimePlan();
        } else {
            currentUid = null;
            if (unsubscribeTimePlan) unsubscribeTimePlan();
        }
    });
});

function moveDate(days) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    selectedDate = d.toISOString().split('T')[0];
    document.getElementById('tp-current-date').value = selectedDate;
    initTimePlan();
}

function initTimePlan() {
    if (!currentUid) return;
    if (unsubscribeTimePlan) unsubscribeTimePlan();

    const tasksRef = collection(db, `users/${currentUid}/tasks`);

    // 모든 과제를 실시간 감시하여 UI 분배
    unsubscribeTimePlan = onSnapshot(tasksRef, (snapshot) => {
        const candidateList = document.getElementById('tp-candidate-list');
        const plannedList = document.getElementById('tp-planned-list');
        candidateList.innerHTML = '';
        plannedList.innerHTML = '';

        snapshot.forEach((docSnap) => {
            // 🔥 중요: data 내부의 id가 문서 ID를 덮어쓰지 않도록 순서 변경
            const task = { ...docSnap.data(), id: docSnap.id };
            
            if (task.plannedDate === selectedDate) {
                renderTaskItem(task, plannedList, true);
            } else if (!task.plannedDate && task.status !== 'done' && (!task.dueDate || task.dueDate >= selectedDate)) {
                // plannedDate가 없는(어떤 날짜에도 아직 할당되지 않은) 과제만 후보군으로 표시합니다.
                // 이를 통해 하나의 과제가 여러 날짜에 중복으로 계획되는 혼란을 방지합니다.
                renderTaskItem(task, candidateList, false);
            }
        });
    });
}

async function resetDayPlan() {
    if (!currentUid) return;
    // 특정 날짜가 아닌 모든 날짜의 미완료 계획을 대상으로 함을 안내
    if (!confirm(`날짜와 관계없이 완료되지 않은 모든 계획을 취소하시겠습니까?`)) return;

    try {
        const tasksRef = collection(db, `users/${currentUid}/tasks`);
        // 특정 날짜 필터링을 제거하고 유저의 모든 과제를 가져옴
        const querySnapshot = await getDocs(tasksRef);
        
        const promises = [];
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            // 1. 어떤 날짜에든 계획이 잡혀있고(plannedDate 존재)
            // 2. 아직 완료되지 않은(status != 'done') 과제만 초기화 대상으로 선정
            if (data.plannedDate && data.status !== 'done') {
                promises.push(updateDoc(doc(db, `users/${currentUid}/tasks/${docSnap.id}`), { plannedDate: null }));
            }
        });

        if (promises.length === 0) {
            alert("취소할 미완료 계획이 없습니다.");
            return;
        }

        await Promise.all(promises);
        alert(`총 ${promises.length}개의 미완료 계획이 초기화되어 후보군으로 이동되었습니다.`);
    } catch (e) {
        console.error("초기화 중 오류:", e);
        alert("초기화에 실패했습니다.");
    }
}

function renderTaskItem(task, container, isPlanned) {
    const item = document.createElement('div');
    item.className = `tp-item ${task.status === 'done' ? 'done' : ''}`;
    
    const priorityLabels = { 1: '상', 2: '중', 3: '하' };
    const priorityClass = { 1: 'p-high', 2: 'p-mid', 3: 'p-low' };
    const pVal = task.priority || 2;

    item.innerHTML = `
        ${isPlanned ? `<input type="checkbox" ${task.status === 'done' ? 'checked' : ''} class="tp-toggle">` : ''}
        <span class="tp-priority ${priorityClass[pVal]}" data-id="${task.id}" data-val="${pVal}">${priorityLabels[pVal]}</span>
        <div class="tp-info">
            <div class="tp-title">${task.title}</div>
            <div style="font-size:11px; color:#888;">${task.courseName} | 마감: ${task.dueDate}</div>
        </div>
        <div style="display:flex; gap:5px; margin-left:auto;">
            ${!isPlanned ? `<button class="tp-btn-done-trigger" style="border:none; background:none; cursor:pointer; font-size:16px;" title="완료 처리">✔️</button>` : ''}
            <button class="tp-btn-move">${isPlanned ? '❌' : '➕'}</button>
        </div>
    `;

    // 체크박스: 완료 상태 토글
    const toggle = item.querySelector('.tp-toggle');
    if (toggle) {
        toggle.onchange = async () => {
            await updateDoc(doc(db, `users/${currentUid}/tasks/${task.id}`), {
                status: toggle.checked ? 'done' : 'todo'
            });
        };
    }

    // 우선순위 클릭: 1 -> 2 -> 3 순환
    item.querySelector('.tp-priority').onclick = async (e) => {
        const nextVal = (parseInt(e.target.dataset.val) % 3) + 1;
        await updateDoc(doc(db, `users/${currentUid}/tasks/${task.id}`), { priority: nextVal });
    };

    // 이동 버튼: 계획 추가/삭제
    item.querySelector('.tp-btn-move').onclick = async () => {
        await updateDoc(doc(db, `users/${currentUid}/tasks/${task.id}`), {
            plannedDate: isPlanned ? null : selectedDate
        });
    };

    // 후보군 전용 완료 버튼 핸들러
    const doneBtn = item.querySelector('.tp-btn-done-trigger');
    if (doneBtn) {
        doneBtn.onclick = async () => {
            if (!confirm(`'${task.title}' 과제를 완료 처리하시겠습니까?\n완료된 과제는 후보군에서 제외됩니다.`)) return;
            await updateDoc(doc(db, `users/${currentUid}/tasks/${task.id}`), { status: 'done' });
        };
    }

    container.appendChild(item);
}