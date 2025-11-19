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

// ==== Init Firebase ====
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ==== DOM elements ====
const messagesDiv = document.getElementById("messages");
const typingIndicator = document.getElementById("typingIndicator");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");

const userInfo = document.getElementById("userInfo");
const authButton = document.getElementById("authButton");

const roomsRow = document.getElementById("roomsRow");
const newRoomInput = document.getElementById("newRoomInput");
const createRoomButton = document.getElementById("createRoomButton");

// ==== Client identity & state ====
const myClientId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

let currentUser = null;
let isAdmin = false;

// TODO: put your real admin emails here
const adminEmails = [
  "youremail@example.com",
  // "another-admin@example.com"
];

const roomsRef = db.ref("rooms");
const bansRef = db.ref("bans");

let bannedClientIds = new Set();

let currentRoomId = null;
let messagesRef = null;
let typingRef = null;
let messagesListenerAttached = false;
let typingListener = null;

const TYPING_TIMEOUT_MS = 3000;
let typingTimeoutHandle = null;

// ==== Auth state ====
auth.onAuthStateChanged(user => {
  currentUser = user || null;
  isAdmin = !!(user && adminEmails.includes(user.email));

  updateAuthUI();
  checkBanState();
});

// Update UI for auth state
function updateAuthUI() {
  const sendBtn = chatForm.querySelector('button[type="submit"]');

  if (currentUser) {
    userInfo.textContent = `${currentUser.displayName || "User"} (${currentUser.email})`;
    authButton.textContent = "Sign out";
    messageInput.disabled = false;
    messageInput.placeholder = "Type a message…";
    if (sendBtn) sendBtn.disabled = false;
  } else {
    userInfo.textContent = "Not signed in";
    authButton.textContent = "Sign in with Google";
    messageInput.disabled = true;
    messageInput.placeholder = "Sign in to chat…";
    if (sendBtn) sendBtn.disabled = true;
  }
}

// Auth button handler
authButton.addEventListener("click", () => {
  if (!currentUser) {
    auth.signInWithPopup(googleProvider).catch(err => {
      console.error("Sign-in failed:", err);
      alert("Google sign-in failed. Check console.");
    });
  } else {
    auth.signOut().catch(err => {
      console.error("Sign-out failed:", err);
    });
  }
});

// Name comes from Google – no manual name, no impersonating others
function getCurrentName() {
  if (currentUser && currentUser.displayName) return currentUser.displayName;
  if (currentUser && currentUser.email) return currentUser.email.split("@")[0];
  return "Guest";
}

// ==== Bans (clientId-based) ====
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
  } else if (currentUser) {
    messageInput.disabled = false;
    messageInput.placeholder = "Type a message…";
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ==== Rooms: dynamic (custom) ====

function initRooms() {
  // Seed defaults if none exist
  roomsRef.once("value").then(snap => {
    if (!snap.exists()) {
      const defaults = {
        general: { name: "#general", createdAt: Date.now() },
        gaming: { name: "#gaming", createdAt: Date.now() },
        random: { name: "#random", createdAt: Date.now() }
      };
      roomsRef.update(defaults);
    }
  });

  roomsRef.on("child_added", snap => {
    const roomId = snap.key;
    const data = snap.val() || {};
    addRoomButton(roomId, data);
    // if no room selected yet, go to first added
    if (!currentRoomId) {
      switchRoom(roomId);
    }
  });

  roomsRef.on("child_removed", snap => {
    const roomId = snap.key;
    removeRoomButton(roomId);
    if (currentRoomId === roomId) {
      currentRoomId = null;
      // try to switch to another room if available
      const firstBtn = roomsRow.querySelector(".room-btn");
      if (firstBtn) {
        switchRoom(firstBtn.dataset.roomId);
      } else {
        messagesDiv.innerHTML = "";
        typingIndicator.textContent = "";
      }
    }
  });
}

function addRoomButton(roomId, data) {
  if (roomsRow.querySelector(`.room-btn[data-room-id="${roomId}"]`)) return;

  const btn = document.createElement("button");
  btn.classList.add("room-btn");
  btn.dataset.roomId = roomId;
  btn.textContent = data.name || roomId;

  btn.addEventListener("click", () => {
    if (roomId === currentRoomId) return;
    switchRoom(roomId);
  });

  roomsRow.appendChild(btn);
}

function removeRoomButton(roomId) {
  const btn = roomsRow.querySelector(`.room-btn[data-room-id="${roomId}"]`);
  if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
}

// Slug for room id from a name
function slugifyRoomName(name) {
  const base = name.toLowerCase().trim();
  let slug = base.replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
  if (!slug) slug = "room-" + Date.now();
  return slug;
}

// Create room
function createRoom() {
  const name = newRoomInput.value.trim();
  if (!name) return;

  const id = slugifyRoomName(name);

  roomsRef.child(id).once("value").then(snap => {
    if (snap.exists()) {
      alert("A room with that id already exists.");
      return;
    }

    return roomsRef.child(id).set({
      name,
      createdAt: Date.now(),
      createdBy: currentUser ? currentUser.uid : null
    }).then(() => {
      newRoomInput.value = "";
      switchRoom(id);
    });
  }).catch(err => {
    console.error("Failed to create room:", err);
    alert("Error creating room. Check console.");
  });
}

createRoomButton.addEventListener("click", createRoom);

newRoomInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    createRoom();
  }
});

// Switch room
function switchRoom(roomId) {
  currentRoomId = roomId;

  // deactivate old listeners
  if (messagesRef && messagesListenerAttached) {
    messagesRef.off();
    messagesListenerAttached = false;
  }
  if (typingRef && typingListener) {
    typingRef.off("value", typingListener);
    typingListener = null;
  }

  // UI active state
  roomsRow.querySelectorAll(".room-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.roomId === roomId);
  });

  // clear message UI
  messagesDiv.innerHTML = "";
  typingIndicator.textContent = "";

  // new refs
  messagesRef = db.ref(`rooms/${roomId}/messages`);
  typingRef = db.ref(`rooms/${roomId}/typing`);

  // Listen to messages
  messagesRef.limitToLast(100).on("child_added", snap => {
    const id = snap.key;
    const data = snap.val();
    if (!data) return;
    addMessageToUI(id, data);
    scrollToBottom();
  });

  messagesRef.on("child_changed", snap => {
    const id = snap.key;
    const data = snap.val();
    if (!data) return;
    updateMessageInUI(id, data);
  });

  messagesRef.on("child_removed", snap => {
    const id = snap.key;
    removeMessageFromUI(id);
  });

  messagesListenerAttached = true;

  // Typing indicator
  typingListener = snap => {
    updateTypingIndicator(snap.val());
  };
  typingRef.on("value", typingListener);
}

// ==== Typing indicator ====
messageInput.addEventListener("input", () => {
  if (!currentUser || !typingRef) return;
  notifyTyping();
});

function notifyTyping() {
  if (!typingRef) return;

  const entry = {
    name: getCurrentName(),
    ts: Date.now()
  };

  typingRef.child(myClientId).set(entry);

  if (typingTimeoutHandle) clearTimeout(typingTimeoutHandle);

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
      const n = (entry.name || "Guest").trim();
      if (n) names.push(n);
    }
  });

  const uniqueNames = [...new Set(names)];
  if (!uniqueNames.length) {
    typingIndicator.textContent = "";
    return;
  }

  const label = uniqueNames.length === 1
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

function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

function replaceEmojiShortcodes(text) {
  const map = { ":)": "😊", ":(": "☹️", ":D": "😄", "<3": "❤️" };
  return map[text] || text;
}

function buildRichTextNodes(text) {
  const frag = document.createDocumentFragment();
  const tokens = text.split(/(\s+)/);

  tokens.forEach(token => {
    if (/^\s+$/.test(token)) {
      frag.appendChild(document.createTextNode(token));
      return;
    }

    if (token.startsWith("http://") || token.startsWith("https://")) {
      const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(token);
      if (isImage) {
        const img = document.createElement("img");
        img.src = token;
        img.alt = "image";
        img.style.maxWidth = "260px";
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

function buildMessageElement(id, data) {
  const { name, text, timestamp, clientId, edited } = data;

  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  if (clientId === myClientId) wrapper.classList.add("me");
  wrapper.dataset.id = id;

  const displayName = (name || "Guest").trim() || "Guest";

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.textContent = displayName[0].toUpperCase();
  avatar.style.background = colorFromName(displayName);

  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");

  const header = document.createElement("div");
  header.classList.add("message-header");

  const nameEl = document.createElement("span");
  nameEl.classList.add("message-name");
  nameEl.textContent = displayName + (isAdmin && currentUser && data.clientId === myClientId ? " (admin)" : "");

  const timeEl = document.createElement("span");
  timeEl.classList.add("message-time");
  timeEl.textContent = formatTime(timestamp);

  header.appendChild(nameEl);
  header.appendChild(timeEl);

  const textEl = document.createElement("div");
  textEl.classList.add("message-text");
  textEl.appendChild(buildRichTextNodes(text || ""));

  const meta = document.createElement("div");
  meta.classList.add("message-meta");

  const editedEl = document.createElement("span");
  editedEl.classList.add("message-edited");
  editedEl.textContent = edited ? "(edited)" : "";
  meta.appendChild(editedEl);

  const actions = document.createElement("div");
  actions.classList.add("message-actions");

  const isMine = clientId === myClientId;

  // edit/delete own messages
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

  // admin can ban others
  if (isAdmin && clientId && clientId !== myClientId) {
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

function addMessageToUI(id, data) {
  const el = buildMessageElement(id, data);
  messagesDiv.appendChild(el);
}

function updateMessageInUI(id, data) {
  const existing = messagesDiv.querySelector(`.message[data-id="${id}"]`);
  const newEl = buildMessageElement(id, data);
  if (existing) {
    messagesDiv.replaceChild(newEl, existing);
  } else {
    messagesDiv.appendChild(newEl);
  }
}

function removeMessageFromUI(id) {
  const existing = messagesDiv.querySelector(`.message[data-id="${id}"]`);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==== Edit / Delete / Ban ====
function handleEditMessage(id, data) {
  const currentText = data.text || "";
  const newText = prompt("Edit message:", currentText);
  if (newText === null) return;
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
  if (!isAdmin) return;
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

  if (!currentUser) {
    alert("Sign in with Google first.");
    return;
  }

  if (bannedClientIds.has(myClientId)) {
    alert("You are banned from chatting.");
    return;
  }

  if (!messagesRef) {
    alert("No room selected.");
    return;
  }

  const text = messageInput.value.trim();
  if (!text) return;

  const msg = {
    name: getCurrentName(),
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

// ==== Boot ====
initRooms();
checkBanState();
