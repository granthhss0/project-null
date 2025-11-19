// Your Firebase config (from your Firebase console)
const firebaseConfig = {
  apiKey: "AIzaSyDMRoYJFzkvdJR27ehrOL2F0Log-9fWiOw",
  authDomain: "project-null00.firebaseapp.com",
  databaseURL: "https://project-null00-default-rtdb.firebaseio.com",
  projectId: "project-null00",
  storageBucket: "project-null00.firebasestorage.app",
  messagingSenderId: "905344630350",
  appId: "1:905344630350:web:55eb1e4f4cc9bac36e4d1f",
  measurementId: "G-M64ZC4SXJ2"
};

// Initialize Firebase using the CDN scripts loaded in index.html
firebase.initializeApp(firebaseConfig);

// Realtime Database reference
const db = firebase.database();
const messagesRef = db.ref("messages");

// Elements
const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const messagesDiv = document.getElementById("messages");

// Identify this device
const myClientId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

// Listen for new messages
messagesRef.limitToLast(50).on("child_added", snapshot => {
  const data = snapshot.val();
  if (!data) return;
  addMessageToUI(data);
  scrollToBottom();
});

// Add message bubble to UI
function addMessageToUI({ name, text, timestamp, clientId }) {
  const msgEl = document.createElement("div");
  msgEl.classList.add("message");
  if (clientId === myClientId) msgEl.classList.add("me");

  const header = document.createElement("div");
  header.classList.add("message-header");

  const nameEl = document.createElement("span");
  nameEl.classList.add("message-name");
  nameEl.textContent = name || "Anon";

  const timeEl = document.createElement("span");
  timeEl.classList.add("message-time");
  timeEl.textContent = formatTime(timestamp);

  const textEl = document.createElement("div");
  textEl.classList.add("message-text");
  textEl.textContent = text;

  header.appendChild(nameEl);
  header.appendChild(timeEl);
  msgEl.appendChild(header);
  msgEl.appendChild(textEl);

  messagesDiv.appendChild(msgEl);
}

// Format time
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Auto-scroll
function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Handle sending messages
chatForm.addEventListener("submit", e => {
  e.preventDefault();

  const name = nameInput.value.trim() || "Anon";
  const text = messageInput.value.trim();

  if (!text.length) return;

  const msg = {
    name,
    text,
    timestamp: Date.now(),
    clientId: myClientId
  };

  // Send to Firebase
  messagesRef.push(msg).catch(err => {
    console.error("Failed to send message:", err);
    alert("Error sending message. Check console.");
  });

  messageInput.value = "";
});
