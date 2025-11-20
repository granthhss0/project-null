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

let currentAccount = null; // { username, name }
let isAdmin = false;

// Admins by username (exact display name, lowercase, filtered)
const adminUsernames = [
  "grant",
  "derrick"
];

// WORD FILTER: everything in here will get censored in messages + names (case-insensitive)
const bannedWords = [
  // "badword1",
  // "badword2"
];

const roomsRef = db.ref("rooms");
const bansRef = db.ref("bans");
const accountsRef = db.ref("accounts");

let bannedClientIds = new Set();

let currentRoomId = null;
let messagesRef = null;
let typingRef = null;
let messagesListenerAttached = false;
let typingListener = null;

const TYPING_TIMEOUT_MS = 3000;
let typingTimeoutHandle = null;

// default rooms that cannot be deleted
const DEFAULT_ROOMS = ["general", "gaming", "random"];

// track currently open message menu (dropdown)
let openMenuEl = null;

// ======== FILTER HELPERS =========

function filterString(str) {
  if (!str) return "";
  let out = String(str);
  bannedWords.forEach(w => {
    if (!w) return;
    const re = new RegExp(w, "gi");
    out = out.replace(re, "*".repeat(w.length));
  });
  return out;
}

function filterName(str) {
  return filterString(str);
}

// ======== ACCOUNT HELPERS =========

function slugUsername(name) {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

function setCurrentAccount(acc) {
  currentAccount = acc;
  isAdmin = !!(currentAccount && adminUsernames.includes(currentAccount.name));
  try {
    if (currentAccount) {
      localStorage.setItem("projectNullAccount", JSON.stringify(currentAccount));
    } else {
      localStorage.removeItem("projectNullAccount");
    }
  } catch (e) {
    console.warn("Failed to persist account in storage", e);
  }
  updateAuthUI();
  checkBanState();
}

function loadAccountFromStorage() {
  try {
    const raw = localStorage.getItem("projectNullAccount");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.username && parsed.name) {
      currentAccount = parsed;
      isAdmin = !!adminUsernames.includes(parsed.name);
    }
  } catch (e) {
    console.error("Failed to load account from storage", e);
  }
}

// username + PIN flow
async function promptForAccount() {
  const rawName = prompt("Enter a chat name (example: john d):");
  if (!rawName) return;

  const cleaned = rawName.trim().toLowerCase();
  if (!cleaned) {
    alert("Name cannot be empty.");
    return;
  }

  const filteredName = filterName(cleaned);
  if (!filteredName.replace(/\*/g, "").trim()) {
    alert("That name is not allowed.");
    return;
  }

  const usernameSlug = slugUsername(filteredName);
  if (!usernameSlug) {
    alert("Invalid name.");
    return;
  }

  const pin = prompt("Set / enter a 4-digit PIN for this name:");
  if (!pin || pin.length < 4) {
    alert("PIN must be at least 4 digits.");
    return;
  }

  try {
    const snap = await accountsRef.child(usernameSlug).once("value");
    if (!snap.exists()) {
      // create new account
      await accountsRef.child(usernameSlug).set({
        name: filteredName,
        pin,
        createdAt: Date.now()
      });
      setCurrentAccount({ username: usernameSlug, name: filteredName });
      alert("Account created. You're logged in as " + filteredName);
    } else {
      // login
      const data = snap.val();
      if (data.pin !== pin) {
        alert("Wrong PIN for that name.");
        return;
      }
      setCurrentAccount({ username: usernameSlug, name: data.name });
      alert("Logged in as " + data.name);
    }
  } catch (err) {
    console.error("Account sign-in error:", err);
    alert("Account error. Check console.");
  }
}

// ======== MENU / GLOBAL CLICK HANDLING =========

function closeOpenMenu() {
  if (openMenuEl) {
    openMenuEl.classList.remove("open");
    openMenuEl = null;
  }
}

document.addEventListener("click", e => {
  const menuWrapper = e.target.closest(".message-menu-wrapper");
  if (!menuWrapper) {
    closeOpenMenu();
  }
});

// ==== Name helpers ====

function getCurrentName() {
  if (!currentAccount) return "guest";
  return currentAccount.name; // already lowercase + filtered
}

// ==== UI state based on account ====

function updateAuthUI() {
  const sendBtn = chatForm.querySelector('button[type="submit"]');

  if (currentAccount) {
    userInfo.textContent = currentAccount.name + (isAdmin ? " (admin)" : "");
    authButton.textContent = "name locked";
    authButton.disabled = true; // cannot change / log out

    messageInput.disabled = false;
    messageInput.placeholder = "Type a message…";
    if (sendBtn) sendBtn.disabled = false;

    newRoomInput.disabled = false;
    createRoomButton.disabled = false;
  } else {
    userInfo.textContent = "name not set";
    authButton.textContent = "set name";
    authButton.disabled = false;

    messageInput.disabled = true;
    messageInput.placeholder = "Set a name to chat…";
    if (sendBtn) sendBtn.disabled = true;

    newRoomInput.disabled = true;
    createRoomButton.disabled = true;
  }
}

// header button: only works if no account yet
authButton.addEventListener("click", () => {
  if (currentAccount) return; // name locked
  promptForAccount();
});

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
  const banned = bannedClientIds.has(myClientId);
  const sendBtn = chatForm.querySelector('button[type="submit"]');

  if (banned) {
    messageInput.disabled = true;
    messageInput.placeholder = "You are banned.";
    if (sendBtn) sendBtn.disabled = true;
  } else if (currentAccount) {
    messageInput.disabled = false;
    messageInput.placeholder = "Type a message…";
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ==== Rooms: dynamic (custom) ====

function initRooms() {
  roomsRef.once("value").then(snap => {
    if (!snap.exists()) {
      const now = Date.now();
      const defaults = {
        general: { name: "#general", createdAt: now },
        gaming: { name: "#gaming", createdAt: now },
        random: { name: "#random", createdAt: now }
      };
      roomsRef.update(defaults);
    }
  });

  roomsRef.on("child_added", snap => {
    const roomId = snap.key;
    const data = snap.val() || {};
    addRoomButton(roomId, data);
    if (!currentRoomId) {
      switchRoom(roomId);
    }
  });

  roomsRef.on("child_removed", snap => {
    const roomId = snap.key;
    removeRoomButton(roomId);
    if (currentRoomId === roomId) {
      currentRoomId = null;
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

  if (!DEFAULT_ROOMS.includes(roomId)) {
    const delSpan = document.createElement("span");
    delSpan.textContent = " ✕";
    delSpan.style.fontSize = "11px";
    delSpan.style.marginLeft = "4px";

    delSpan.addEventListener("click", e => {
      e.stopPropagation();
      deleteRoom(roomId);
    });

    btn.appendChild(delSpan);
  }

  roomsRow.appendChild(btn);
}

function removeRoomButton(roomId) {
  const btn = roomsRow.querySelector(`.room-btn[data-room-id="${roomId}"]`);
  if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
}

function slugifyRoomName(name) {
  const base = name.toLowerCase().trim();
  let slug = base.replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
  if (!slug) slug = "room-" + Date.now();
  return slug;
}

function createRoom() {
  if (!currentAccount) {
    alert("Set a name to create rooms.");
    return;
  }

  const rawName = newRoomInput.value.trim();
  if (!rawName) return;

  const filtered = filterName(rawName.toLowerCase());
  if (!filtered.replace(/\*/g, "").trim()) {
    alert("Room name blocked by filter.");
    return;
  }

  const id = slugifyRoomName(filtered);

  roomsRef.child(id).once("value").then(snap => {
    if (snap.exists()) {
      alert("A room with that id already exists.");
      return;
    }

    return roomsRef.child(id).set({
      name: filtered,
      createdAt: Date.now(),
      createdBy: currentAccount ? currentAccount.username : null
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

function deleteRoom(roomId) {
  if (!isAdmin) {
    alert("Only admins can delete rooms.");
    return;
  }
  if (DEFAULT_ROOMS.includes(roomId)) {
    alert("Default rooms can’t be deleted.");
    return;
  }
  if (!confirm("Delete this room and all its messages?")) return;

  roomsRef.child(roomId).remove().catch(err => {
    console.error("Failed to delete room:", err);
    alert("Error deleting room. Check console.");
  });
}

function switchRoom(roomId) {
  currentRoomId = roomId;

  if (messagesRef && messagesListenerAttached) {
    messagesRef.off();
    messagesListenerAttached = false;
  }
  if (typingRef && typingListener) {
    typingRef.off("value", typingListener);
    typingListener = null;
  }

  roomsRow.querySelectorAll(".room-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.roomId === roomId);
  });

  messagesDiv.innerHTML = "";
  typingIndicator.textContent = "";

  messagesRef = db.ref(`rooms/${roomId}/messages`);
  typingRef = db.ref(`rooms/${roomId}/typing`);

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

  typingListener = snap => {
    updateTypingIndicator(snap.val());
  };
  typingRef.on("value", typingListener);
}

// ==== Typing indicator ====
messageInput.addEventListener("input", () => {
  if (!currentAccount || !typingRef) return;
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
      const n = (entry.name || "guest").trim();
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

function createMenuItem(label, handler, isDanger = false) {
  const item = document.createElement("button");
  item.type = "button";
  item.classList.add("message-menu-item");
  if (isDanger) item.classList.add("danger");
  item.textContent = label;
  item.addEventListener("click", e => {
    e.stopPropagation();
    closeOpenMenu();
    handler();
  });
  return item;
}

function buildMessageElement(id, data) {
  const { name, text, timestamp, clientId, edited } = data;

  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  if (clientId === myClientId) wrapper.classList.add("me");
  wrapper.dataset.id = id;

  const displayName = (name || "guest").trim() || "guest";
  const senderIsAdmin = adminUsernames.includes(displayName);

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
  nameEl.textContent = displayName + (senderIsAdmin ? " (admin)" : "");

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
  const canEdit = isMine;
  const canDelete = isMine || isAdmin;
  const canBan = isAdmin && clientId && clientId !== myClientId;
  const hasActions = canEdit || canDelete || canBan;

  if (hasActions) {
    const menuWrapper = document.createElement("div");
    menuWrapper.classList.add("message-menu-wrapper");

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.classList.add("message-menu-btn");
    menuBtn.textContent = "⋮";

    const menu = document.createElement("div");
    menu.classList.add("message-menu");

    if (canEdit) {
      menu.appendChild(
        createMenuItem("Edit message", () => handleEditMessage(id, data))
      );
    }
    if (canDelete) {
      menu.appendChild(
        createMenuItem("Delete message", () => handleDeleteMessage(id), true)
      );
    }
    if (canBan) {
      menu.appendChild(
        createMenuItem("Ban user", () => handleBanClient(clientId), true)
      );
    }

    menuWrapper.appendChild(menuBtn);
    menuWrapper.appendChild(menu);
    actions.appendChild(menuWrapper);

    menuBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (openMenuEl && openMenuEl !== menu) {
        openMenuEl.classList.remove("open");
      }
      const isOpen = menu.classList.toggle("open");
      openMenuEl = isOpen ? menu : null;
    });
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

  const filtered = filterString(trimmed);

  messagesRef.child(id).update({
    text: filtered,
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

  if (!currentAccount) {
    alert("Set a name first.");
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

  const filteredText = filterString(text);

  const msg = {
    name: getCurrentName(),
    text: filteredText,
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
loadAccountFromStorage();
updateAuthUI();
initRooms();
checkBanState();
