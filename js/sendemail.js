import { db } from './firebase-init.js';
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

/**
 * 미발송 알림 확인 및 이메일 전송 로직
 * @param {string} currentUid 현재 사용자의 UID
 */
export async function checkAndSendMailReminders(currentUid) {
    if (!currentUid) return;
    
    const auth = getAuth();
    const userEmail = auth.currentUser?.email;
    if (!userEmail) return;

    // 현재 로컬 시간을 YYYY-MM-DDTHH:mm 형식으로 변환
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now - offset).toISOString().slice(0, 16);

    console.log(`[EmailCheck] 알림 체크 시작 (현재 로컬 시간: ${localISOTime})`);

    const tasksRef = collection(db, `users/${currentUid}/tasks`);
    
    // 알림 설정이 있고, 아직 발송되지 않은 과제들만 필터링
    const q = query(tasksRef, where("isNotified", "==", false));
    
    try {
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(async (docSnap) => {
            const task = docSnap.data();
            
            // 설정된 알림 시간이 현재 로컬 시간보다 과거인 경우 발송
            if (task.reminderDate && task.reminderDate <= localISOTime) {
                console.log(`[Email] 발송 조건 충족: ${task.title} (알림예정: ${task.reminderDate})`);
                await sendEmail(userEmail, task.courseName, task.title, task.dueDate, task.memo);
                
                // 발송 완료 상태로 업데이트
                await updateDoc(doc(db, `users/${currentUid}/tasks/${docSnap.id}`), {
                    isNotified: true
                });
            }
        });
    } catch (error) {
        console.error("알림 확인 중 에러:", error);
    }
}

/**
 * EmailJS를 이용한 실제 메일 전송
 */
async function sendEmail(toEmail, course, title, due, memo) {
    const memoText = memo ? `\n\n[메모 내용]\n${memo}` : '';
    const templateParams = {
        email: toEmail,
        task_title: title,
        course_name: course,
        message: `[${course}] ${title} 과제의 마감이 임박했습니다. (마감: ${due})${memoText}`
    };

    try {
        await emailjs.send("service_ivozeyc", "template_705rd8n", templateParams);
        console.log("알림 메일 전송 성공:", title);
    } catch (error) {
        console.error("메일 발송 실패:", error);
    }
}