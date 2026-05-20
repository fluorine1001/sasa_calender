import { db } from './firebase-init.js';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

let currentUid = null;
let currentDisplayDate = new Date(); // Tracks the currently displayed month/week/day
let selectedDateStr = formatDate(new Date()); // 기본값 오늘
let currentView = 'month'; // 'month', 'week', 'day'

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            initCalendar();
        } else {
            // 로그아웃 시 캘린더 UI 초기화 또는 비활성화
            const calendarGridContainer = document.getElementById('calendar-grid-container');
            const todayEventsList = document.getElementById('selected-day-events');
            if (calendarGridContainer) calendarGridContainer.innerHTML = '<p style="text-align:center; padding:20px;">로그인이 필요합니다.</p>';
            if (todayEventsList) todayEventsList.innerHTML = '';
        }
    });
});

function initCalendar() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const viewMonthBtn = document.getElementById('view-month-btn');
    const viewWeekBtn = document.getElementById('view-week-btn');
    const viewDayBtn = document.getElementById('view-day-btn');

    if (prevBtn) prevBtn.addEventListener('click', () => navigateCalendar(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateCalendar(1));
    if (viewMonthBtn) viewMonthBtn.addEventListener('click', () => setView('month'));
    if (viewWeekBtn) viewWeekBtn.addEventListener('click', () => setView('week'));
    if (viewDayBtn) viewDayBtn.addEventListener('click', () => setView('day'));

    // 수정/삭제 버튼 이벤트
    const saveBtn = document.getElementById('btn-save-task');
    const deleteBtn = document.getElementById('btn-delete-task');
    if (saveBtn) saveBtn.onclick = handleUpdateTask;
    if (deleteBtn) deleteBtn.onclick = handleDeleteTask;

    renderCalendar();
}

function navigateCalendar(direction) {
    if (currentView === 'month') {
        currentDisplayDate.setMonth(currentDisplayDate.getMonth() + direction);
    } else if (currentView === 'week') {
        currentDisplayDate.setDate(currentDisplayDate.getDate() + (direction * 7));
    } else if (currentView === 'day') {
        currentDisplayDate.setDate(currentDisplayDate.getDate() + direction);
    }
    renderCalendar();
}

function setView(view) {
    currentView = view;
    // Update active class on view buttons
    document.querySelectorAll('.calendar-view-toggle button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`view-${view}-btn`).classList.add('active');
    renderCalendar();
}

async function renderCalendar() {
    const currentMonthYearDisplay = document.getElementById('current-month-year');
    const calendarGridContainer = document.getElementById('calendar-grid-container');
    const selectedDayEventsList = document.getElementById('selected-day-events');

    if (!currentMonthYearDisplay || !calendarGridContainer || !selectedDayEventsList) return;

    // 현재 날짜 표시 업데이트
    if (currentView === 'month') {
        currentMonthYearDisplay.textContent = currentDisplayDate.toLocaleString('ko-KR', { year: 'numeric', month: 'long' });
    } else if (currentView === 'week') {
        const startOfWeek = new Date(currentDisplayDate);
        startOfWeek.setDate(currentDisplayDate.getDate() - currentDisplayDate.getDay()); // 일요일로 설정
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        currentMonthYearDisplay.textContent = `${startOfWeek.toLocaleString('ko-KR', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleString('ko-KR', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (currentView === 'day') {
        currentMonthYearDisplay.textContent = currentDisplayDate.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }

    document.getElementById('selected-day-title').textContent = `${selectedDateStr} 일정`;
    calendarGridContainer.innerHTML = ''; // Clear previous grid
    selectedDayEventsList.innerHTML = ''; // Clear previous events

    if (currentView === 'month') {
        renderMonthView(calendarGridContainer, selectedDayEventsList);
    } else if (currentView === 'week') {
        renderWeekView(calendarGridContainer, selectedDayEventsList);
    } else if (currentView === 'day') {
        renderDayView(calendarGridContainer, selectedDayEventsList);
    }
}

async function renderMonthView(calendarGridContainer, todayEventsList) {
    const year = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth(); // 0-indexed

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 1 for Monday

    // Create calendar header (days of the week)
    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    const headerRow = document.createElement('div');
    headerRow.className = 'calendar-week-header';
    daysOfWeek.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.textContent = day;
        headerRow.appendChild(dayHeader);
    });
    calendarGridContainer.appendChild(headerRow);

    const calendarGrid = document.createElement('div');
    calendarGrid.className = 'calendar-grid';

    // Fill leading empty days
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyCell);
    }

    // Fetch all tasks for the current month range
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;
    const tasks = await fetchTasksInRange(startDate, endDate);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Fill days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        dayCell.textContent = day;
        dayCell.style.cursor = 'pointer';
        dayCell.onclick = () => selectDay(dateStr);

        if (dateStr === todayStr) {
            dayCell.classList.add('today');
        }

        if (dateStr === selectedDateStr) {
            dayCell.classList.add('selected');
        }

        const tasksForDay = tasks.filter(task => task.dueDate === dateStr);
        if (tasksForDay.length > 0) {
            const eventCount = document.createElement('span');
            eventCount.className = 'event-count';
            eventCount.textContent = tasksForDay.length;
            dayCell.appendChild(eventCount);
            dayCell.classList.add('has-events');
        }

        if (dateStr === selectedDateStr) {
            renderEventsList(tasksForDay, todayEventsList);
        }

        calendarGrid.appendChild(dayCell);
    }
    calendarGridContainer.appendChild(calendarGrid);
}

async function renderWeekView(calendarGridContainer, selectedDayEventsList) {
    const startOfWeek = new Date(currentDisplayDate);
    startOfWeek.setDate(currentDisplayDate.getDate() - currentDisplayDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const tasks = await fetchTasksInRange(formatDate(startOfWeek), formatDate(endOfWeek));

    calendarGridContainer.innerHTML = '';
    const weekGrid = document.createElement('div');
    weekGrid.className = 'calendar-week-grid';

    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    const todayStr = formatDate(new Date());

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = formatDate(date);

        const dayCol = document.createElement('div');
        dayCol.className = 'calendar-week-day' + (dateStr === todayStr ? ' today' : '') + (dateStr === selectedDateStr ? ' selected' : '');
        dayCol.style.cursor = 'pointer';
        dayCol.onclick = () => selectDay(dateStr);

        dayCol.innerHTML = `
            <div style="text-align:center; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">
                <div style="font-weight:bold; color:#7f8c8d; font-size:12px;">${daysOfWeek[i]}</div>
                <div style="font-size:18px;">${date.getDate()}</div>
            </div>
            <div class="week-events-container"></div>
        `;

        const eventsContainer = dayCol.querySelector('.week-events-container');
        const tasksForDay = tasks.filter(t => t.dueDate === dateStr);
        
        tasksForDay.forEach(task => {
            const div = document.createElement('div');
            div.className = 'day-event-item';
            div.innerHTML = `<span class="day-event-course">[${task.courseName}]</span><br>${task.title}`;
            div.onclick = (e) => {
                e.stopPropagation();
                openTaskDetail(task);
            };
            eventsContainer.appendChild(div);
        });

        if (dateStr === selectedDateStr) {
            renderEventsList(tasksForDay, selectedDayEventsList);
        }

        weekGrid.appendChild(dayCol);
    }
    calendarGridContainer.appendChild(weekGrid);
}

async function renderDayView(calendarGridContainer, selectedDayEventsList) {
    const dateStr = formatDate(currentDisplayDate);
    const tasks = await fetchTasksInRange(dateStr, dateStr);

    calendarGridContainer.innerHTML = `
        <div class="calendar-day-detail">
            <h4 style="margin-top:0;">${currentDisplayDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 일정</h4>
            <div id="day-tasks-container"></div>
        </div>
    `;

    const container = document.getElementById('day-tasks-container');
    if (tasks.length === 0) {
        container.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">등록된 일정이 없습니다.</p>';
    } else {
        tasks.forEach(task => {
            const div = document.createElement('div');
            div.className = 'day-event-item';
            div.style.padding = '15px';
            div.style.cursor = 'pointer';
            div.innerHTML = `
                <span class="day-event-course" style="font-size:16px;">[${task.courseName}]</span>
                <span style="font-size:16px;">${task.title}</span>
                <div style="font-size:12px; color:#888; margin-top:5px;">${task.link}</div>
            `;
            div.onclick = () => openTaskDetail(task);
            container.appendChild(div);
        });
    }

    selectedDateStr = dateStr;
    renderEventsList(tasks, selectedDayEventsList);
}

function selectDay(dateStr) {
    selectedDateStr = dateStr;
    renderCalendar();
}

function renderEventsList(tasks, container) {
    container.innerHTML = '';
    if (tasks.length === 0) {
        container.innerHTML = '<li style="padding: 10px; color: #888;">일정이 없습니다.</li>';
        return;
    }
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'cl-list-item';
        li.style.marginBottom = '8px';
        li.innerHTML = `
            <div class="cl-work-info">
                <span class="cl-work-title"><strong>[${task.courseName}]</strong> ${task.title}</span>
                <span class="cl-work-due">마감: ${task.dueDate}</span>
            </div>
            <span class="cl-arrow">❯</span>
        `;
        li.onclick = () => openTaskDetail(task);
        container.appendChild(li);
    });
}

function openTaskDetail(task) {
    document.getElementById('edit-task-id').value = task.id; // google_... 형태의 문서 ID
    document.getElementById('edit-task-course').value = task.courseName;
    document.getElementById('edit-task-title').value = task.title;
    document.getElementById('edit-task-due').value = task.dueDate === '기한 없음' ? '' : task.dueDate;
    document.getElementById('edit-task-link').href = task.link;
    
    document.getElementById('task-detail-modal').style.display = 'flex';
}

async function handleUpdateTask() {
    const taskId = document.getElementById('edit-task-id').value;
    const newTitle = document.getElementById('edit-task-title').value;
    const newDue = document.getElementById('edit-task-due').value;

    if (!newTitle) return alert("제목을 입력해주세요.");

    try {
        const taskRef = doc(db, `users/${currentUid}/tasks/${taskId}`);
        await updateDoc(taskRef, {
            title: newTitle,
            dueDate: newDue || '기한 없음'
        });
        alert("수정되었습니다.");
        document.getElementById('task-detail-modal').style.display = 'none';
        renderCalendar();
    } catch (error) {
        console.error("수정 실패:", error);
        alert("수정 중 오류가 발생했습니다.");
    }
}

async function handleDeleteTask() {
    const taskId = document.getElementById('edit-task-id').value;
    if (!confirm("정말 이 과제를 삭제하시겠습니까?")) return;

    try {
        const taskRef = doc(db, `users/${currentUid}/tasks/${taskId}`);
        await deleteDoc(taskRef);
        alert("삭제되었습니다.");
        document.getElementById('task-detail-modal').style.display = 'none';
        renderCalendar();
    } catch (error) {
        console.error("삭제 실패:", error);
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function fetchTasksInRange(startDate, endDate) {
    if (!currentUid) return [];
    const tasksRef = collection(db, `users/${currentUid}/tasks`);
    const q = query(
        tasksRef,
        where('dueDate', '>=', startDate),
        where('dueDate', '<=', endDate)
    );
    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch (error) {
        return [];
    }
}