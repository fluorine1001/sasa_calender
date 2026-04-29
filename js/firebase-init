// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBNJH3aWqtUruoL_94aVbLb63cQFiXiIvE",
  authDomain: "sasa-calender-92488.firebaseapp.com",
  projectId: "sasa-calender-92488",
  storageBucket: "sasa-calender-92488.firebasestorage.app",
  messagingSenderId: "70626194823",
  appId: "1:70626194823:web:3313491ad7eab5ed1a0f22",
  measurementId: "G-M5B06T6MQM"
};

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 다른 파일에서 쓸 수 있게 내보내기
export { auth, db };
