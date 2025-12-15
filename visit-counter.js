import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCeEo-XbOdIJSqYRTbA4re3Ot1xWeEjfW0",
  authDomain: "mysuneung.firebaseapp.com",
  databaseURL: "https://mysuneung-default-rtdb.firebaseio.com",
  projectId: "mysuneung",
  storageBucket: "mysuneung.appspot.com",
  messagingSenderId: "1047770825934",
  appId: "1:1047770825934:web:cf4afe0e4331422e043c9f",
  measurementId: "G-B7Q0KVYxx5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const VISIT_LOCAL_STORAGE_KEY = "visit-last-count-date";
const VISIT_MONTH_STORAGE_KEY = "visit-last-count-month";
const KST_OFFSET = 9 * 60 * 60 * 1000;

function getKstNow() {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcTime + KST_OFFSET);
}

function getDateKeys(now = getKstNow()) {
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { todayKey, monthKey };
}

function renderCounts(todayCount, monthCount, monthKey) {
  const todayEl = document.getElementById("visit-today");
  const monthEl = document.getElementById("visit-month");
  const monthLabelEl = document.getElementById("visit-month-label");

  if (todayEl) todayEl.textContent = todayCount;
  if (monthEl) monthEl.textContent = monthCount;
  if (monthLabelEl) monthLabelEl.textContent = `${monthKey} 누적 방문`;
}

async function updateVisitCounter() {
  const now = getKstNow();
  const { todayKey, monthKey } = getDateKeys(now);

  const visitsRef = ref(db, "visits");
  const snapshot = await get(visitsRef);
  const data = snapshot.exists()
    ? snapshot.val()
    : { today: 0, month: 0, lastUpdateDate: "", lastUpdateMonth: "" };

  const lastCountDate = localStorage.getItem(VISIT_LOCAL_STORAGE_KEY);
  const shouldCountToday = lastCountDate !== todayKey;

  const baseTodayCount = data.lastUpdateDate === todayKey ? data.today : 0;
  const baseMonthCount = data.lastUpdateMonth === monthKey ? data.month : 0;

  const todayCount = baseTodayCount + (shouldCountToday ? 1 : 0);
  const monthCount = baseMonthCount + (shouldCountToday ? 1 : 0);

  const shouldUpdate =
    todayCount !== data.today ||
    monthCount !== data.month ||
    data.lastUpdateDate !== todayKey ||
    data.lastUpdateMonth !== monthKey;

  if (shouldUpdate) {
    await update(visitsRef, {
      today: todayCount,
      month: monthCount,
      lastUpdateDate: todayKey,
      lastUpdateMonth: monthKey
    });
  }

  if (shouldCountToday) {
    localStorage.setItem(VISIT_LOCAL_STORAGE_KEY, todayKey);
    localStorage.setItem(VISIT_MONTH_STORAGE_KEY, monthKey);
  }

  renderCounts(todayCount, monthCount, monthKey);
}

function scheduleVisitRefresh() {
  const now = getKstNow();
  const remainingSeconds = ((24 - now.getHours()) * 3600) - (now.getMinutes() * 60) - now.getSeconds();
  const delay = (remainingSeconds * 1000) - now.getMilliseconds();

  setTimeout(() => {
    updateVisitCounter();
    scheduleVisitRefresh();
  }, Math.max(1000, delay));
}

updateVisitCounter().catch(console.error);
scheduleVisitRefresh();
