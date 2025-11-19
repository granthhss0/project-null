# 🜸 Project Null  
A fast, modern, real-time chat application built on Firebase and designed with a clean full-screen dark UI.  
Project Null supports multiple chat rooms, message editing, message deleting, avatars, emojis, typing indicators, and basic device-level banning — all running entirely on GitHub Pages.

---

## ✨ Features

### 💬 Real-Time Chat
Messages sync instantly through Firebase Realtime Database.

### 🏷️ Usernames
Users can set a username, saved automatically in their browser (localStorage).

### 🧩 Multiple Rooms
Includes:
- `#general`
- `#gaming`
- `#random`

Rooms update instantly with isolated message feeds.

### ✏️ Edit & Delete Messages
Users may edit or delete **their own** messages.

### 🪪 Avatars
Each user gets:
- A circular avatar  
- First letter of their name  
- Dynamic color generated from their username  

### 😀 Emojis + Embeds
- Text transforms simple emoji shortcodes (`:)`, `<3`, etc.)  
- URLs auto-convert into clickable links  
- Image URLs auto-embed inline  

### ⌨️ Typing Indicator
Shows who is currently typing in real time.

### 🔨 Basic Device Banning
A lightweight system that blocks a clientId from sending messages:
- Type your username as `"admin"` to see Ban buttons  
- Persistent across reloads  
*(Not real IP banning — this is a client-side Firebase-ban system)*

### 🧱 Pure Front-End
Runs entirely on:
- HTML  
- CSS  
- JavaScript  
- Firebase Realtime Database (no backend server needed)  

Perfect for GitHub Pages, Replit, Netlify, or any static host.

---

## 📁 File Structure

