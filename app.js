// 1. Firebase config – REPLACE with your own
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME-default-rtdb.firebaseio.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const messagesRef = db.ref("messages");

const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const messagesDiv = document.getElementById("messages");

let myName = "";

// Keep a lightweight local id to mark "my" messages
const myClientId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

// Load previous messages and listen for new ones
messagesRef.limitToLast(50).on("child_added", snapshot => {
  const data = snapshot.val();
  if (!data) return;
  addMessageToUI(data);
  scrollToBottom();
});

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

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

chatForm.addEventListener("submit", e => {
  e.preventDefault();

  const name = nameInput.value.trim() || "Anon";
  const text = messageInput.value.trim();

  if (!text) return;

  myName = name;

  const msg = {
    name,
    text,
    timestamp: Date.now(),
    clientId: myClientId
  };

  // Push to Firebase
  messagesRef.push(msg).catch(err => {
    console.error("Failed to send message:", err);
    alert("Error sending message. Check console.");
  });

  messageInput.value = "";
});
