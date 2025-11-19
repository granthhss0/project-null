// ==== Firebase config (yours) ====
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==== DOM elements ====
const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const messagesDiv = document.getElementById("messages");
const typingIndicator = document.getElementById("typingIndicator");
const roomButtons = document.querySelectorAll(".room-btn");

// ==== Client identity & state ====
const myClientId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
const LS_NAME_KEY = "darkchat_name";

let currentRoom = "general";
let messagesRef = null;
let messagesListenerAdded = false;
let typingRef = null;
let typingListener = null;

const bansRef = db.ref("bans");
const bannedClientIds = new Set();

const TYPING_TIMEOUT_MS = 3000;
let typingTimeoutHandle = null;

// ==== Load saved name (permanent username) ====
const savedName = localStorage.getItem(LS_NAME_KEY);
if (savedName) {
  nameInput.value = savedName;
}

// Helper: get current name (fallback to Anon)
function getCurrentName() {
  const n = nameInput.value.trim();
  return n || "Anon";
}

// Save name when user changes it
nameInput.addEventListener("change", () => {
  localStorage.setItem(LS_NAME_KEY, getCurrentName());
});

// ==== Bans (device-level via clientId) ====
// This is not true IP banning. It's a simple global "this clientId is banned" list.
// Anyone who can pretend to be "admin" in the UI could abuse it. You're using this for fun,
// not security.
bansRef.on("child_added", snap => {
  bannedClientIds.add(snap.key);
  checkBanState();
});

bansRef.on("child_removed", snap => {
  bannedClientIds.delete(snap.key);
  checkBanState();
});

function checkBanState() {
  const isBanned = bannedClientIds.has(myClientId);
  const sendBtn = chatForm.querySelector('button[type="submit"]');
  if (isBanned) {
    messageInput.disabled = true;
    messageInput.placeholder = "You are banned.";
    if (sendBtn) sendBtn.disabled = true;
  } else {
    messageInput.disabled = false;
    messageInput.placeholder = "Type a message…";
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ==== Room switching ====
roomButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const room = btn.getAttribute("data-room");
    if (!room || room === currentRoom) return;
    roomButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    switchRoom(room);
  });
});

function switchRoom(room) {
  currentRoom = room;

  // Detach old listeners
  if (messagesRef && messagesListenerAdded) {
    messagesRef.off(); // remove all listeners on that ref
    messagesListenerAdded = false;
  }
  if (typingRef && typingListener) {
    typingRef.off("value", typingListener);
    typingListener = null;
  }

  // Clear UI
  messagesDiv.innerHTML = "";
  typingIndicator.textContent = "";

  // New refs for this room
  messagesRef = db.ref(`rooms/${room}/messages`);
  typingRef = db.ref(`rooms/${room}/typing`);

  // Listen for new / changed messages
  messagesRef.limitToLast(50).on("child_added", snapshot => {
    const data = snapshot.val();
    if (!data) return;
    const id = snapshot.key;
    addMessageToUI(id, data);
    scrollToBottom();
  });

  messagesRef.on("child_changed", snapshot => {
    const data = snapshot.val();
    if (!data) return;
    const id = snapshot.key;
    updateMessageInUI(id, data);
  });

  messagesRef.on("child_removed", snapshot => {
    const id = snapshot.key;
    removeMessageFromUI(id);
  });

  messagesListenerAdded = true;

  // Typing indicator listener
  typingListener = snapshot => {
    const val = snapshot.val();
    updateTypingIndicator(val);
  };
  typingRef.on("value", typingListener);
}

// Initial room
switchRoom(currentRoom);

// ==== Typing indicator ====
messageInput.addEventListener("input", () => {
  notifyTyping();
});

function notifyTyping() {
  if (!typingRef) return;

  const entry = {
    name: getCurrentName(),
    ts: Date.now()
  };

  typingRef.child(myClientId).set(entry);

  if (typingTimeoutHandle) {
    clearTimeout(typingTimeoutHandle);
  }

  typingTimeoutHandle = setTimeout(() => {
    typingRef.child(myClientId).remove();
  }, TYPING_TIMEOUT_MS);
}

function updateTypingIndicator(data) {
  if (!data) {
    typingIndicator.textContent = "";
    return;
  }

  const now = Date.now();
  const names = [];

  Object.values(data).forEach(entry => {
    if (!entry || !entry.ts) return;
    if (now - entry.ts <= TYPING_TIMEOUT_MS) {
      const n = (entry.name || "Anon").trim();
      if (n) names.push(n);
    }
  });

  const uniqueNames = [...new Set(names)];

  if (uniqueNames.length === 0) {
    typingIndicator.textContent = "";
    return;
  }

  const label =
    uniqueNames.length === 1
      ? `${uniqueNames[0]} is typing…`
      : `${uniqueNames.join(", ")} are typing…`;

  typingIndicator.textContent = label;
}

// ==== Message helpers ====

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Avatar color based on name
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

// Simple emoji replacement for common faces
function replaceEmojiShortcodes(text) {
  const map = {
    ":)": "😊",
    ":(": "☹️",
    ":D": "😄",
    "<3": "❤️"
  };
  return map[text] || text;
}

// Convert URLs in text to links / image embeds
function buildRichTextNodes(text) {
  const frag = document.createDocumentFragment();
  const tokens = text.split(/(\s+)/); // keep spaces

  tokens.forEach(token => {
    if (token.match(/^\s+$/)) {
      frag.appendChild(document.createTextNode(token));
      return;
    }

    if (token.startsWith("http://") || token.startsWith("https://")) {
      const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(token);
      if (isImage) {
        const img = document.createElement("img");
        img.src = token;
        img.alt = "image";
        img.style.maxWidth = "180px";
        img.style.borderRadius = "8px";
        img.style.display = "block";
        img.style.marginTop = "4px";
        frag.appendChild(img);
      } else {
        const a = document.createElement("a");
        a.href = token;
        a.textContent = token;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.color = "#60a5fa";
        frag.appendChild(a);
      }
    } else {
      const maybeEmoji = replaceEmojiShortcodes(token);
      frag.appendChild(document.createTextNode(maybeEmoji));
    }
  });

  return frag;
}

// Build DOM element for a message
function buildMessageElement(id, data) {
  const { name, text, timestamp, clientId, edited } = data;

  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  if (clientId === myClientId) wrapper.classList.add("me");
  wrapper.dataset.id = id || "";

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  const displayName = (name || "Anon").trim() || "Anon";
  avatar.textContent = displayName[0].toUpperCase();
  avatar.style.background = colorFromName(displayName);

  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");

  const header = document.createElement("div");
  header.classList.add("message-header");

  const nameEl = document.createElement("span");
  nameEl.classList.add("message-name");
  nameEl.textContent = displayName;

  const timeEl = document.createElement("span");
  timeEl.classList.add("message-time");
  timeEl.textContent = formatTime(timestamp);

  header.appendChild(nameEl);
  header.appendChild(timeEl);

  const textEl = document.createElement("div");
  textEl.classList.add("message-text");
  textEl.textContent = "";
  textEl.appendChild(buildRichTextNodes(text || ""));

  const meta = document.createElement("div");
  meta.classList.add("message-meta");

  const editedEl = document.createElement("span");
  editedEl.classList.add("message-edited");
  editedEl.textContent = edited ? "(edited)" : "";
  meta.appendChild(editedEl);

  const actions = document.createElement("div");
  actions.classList.add("message-actions");

  // Only allow edit/delete for own messages
  const isMine = clientId === myClientId;

  if (isMine) {
    const editBtn = document.createElement("button");
    editBtn.classList.add("msg-btn", "edit");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => handleEditMessage(id, data));
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.classList.add("msg-btn", "delete");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => handleDeleteMessage(id));
    actions.appendChild(delBtn);
  }

  // Basic "admin" ban: if your current name is literally "admin",
  // you see a Ban button to ban that clientId.
  if (getCurrentName().toLowerCase() === "admin" && clientId && clientId !== myClientId) {
    const banBtn = document.createElement("button");
    banBtn.classList.add("msg-btn", "ban");
    banBtn.textContent = "Ban";
    banBtn.addEventListener("click", () => handleBanClient(clientId));
    actions.appendChild(banBtn);
  }

  meta.appendChild(actions);

  bubble.appendChild(header);
  bubble.appendChild(textEl);
  bubble.appendChild(meta);

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);

  return wrapper;
}

// Add message (new)
function addMessageToUI(id, data) {
  const el = buildMessageElement(id, data);
  messagesDiv.appendChild(el);
}

// Update message (edited)
function updateMessageInUI(id, data) {
  const existing = messagesDiv.querySelector(`.message[data-id="${id}"]`);
  if (!existing) {
    // If it's not there, just add it
    addMessageToUI(id, data);
    return;
  }
  const newEl = buildMessageElement(id, data);
  messagesDiv.replaceChild(newEl, existing);
}

// Remove message (deleted)
function removeMessageFromUI(id) {
  const existing = messagesDiv.querySelector(`.message[data-id="${id}"]`);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==== Edit / Delete / Ban handlers ====

function handleEditMessage(id, data) {
  const currentText = data.text || "";
  const newText = prompt("Edit message:", currentText);
  if (newText === null) return; // cancelled
  const trimmed = newText.trim();
  if (!trimmed) return;

  messagesRef.child(id).update({
    text: trimmed,
    edited: true,
    editedAt: Date.now()
  }).catch(err => {
    console.error("Failed to edit message:", err);
    alert("Error editing message. Check console.");
  });
}

function handleDeleteMessage(id) {
  if (!confirm("Delete this message?")) return;
  messagesRef.child(id).remove().catch(err => {
    console.error("Failed to delete message:", err);
    alert("Error deleting message. Check console.");
  });
}

function handleBanClient(clientId) {
  if (!confirm("Ban this device from chatting?")) return;
  bansRef.child(clientId).set({
    banned: true,
    by: getCurrentName(),
    ts: Date.now()
  }).catch(err => {
    console.error("Failed to ban client:", err);
    alert("Error banning client. Check console.");
  });
}

// ==== Sending messages ====

chatForm.addEventListener("submit", e => {
  e.preventDefault();

  if (bannedClientIds.has(myClientId)) {
    alert("You are banned from chatting.");
    return;
  }

  const name = getCurrentName();
  const text = messageInput.value.trim();
  if (!text.length) return;

  // Save name persistently
  localStorage.setItem(LS_NAME_KEY, name);

  const msg = {
    name,
    text,
    timestamp: Date.now(),
    clientId: myClientId
  };

  messagesRef.push(msg).catch(err => {
    console.error("Failed to send message:", err);
    alert("Error sending message. Check console.");
  });

  messageInput.value = "";
});
