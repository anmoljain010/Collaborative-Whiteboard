# 🎨 CoDraw — Real-Time Collaborative Whiteboard

CoDraw is a high-performance, real-time collaborative whiteboard workspace that lets teams draw, sketch, and brainstorm together in isolated rooms.

**🌐 Live Demo: [https://codraw-frontend.onrender.com](https://codraw-frontend.onrender.com)**

---

## 💡 Project Overview

CoDraw provides an interactive vector drawing environment that enables multiple users to collaborate in real-time. It is designed with:
- A **FastAPI** Python backend utilizing WebSockets for lightweight, real-time message broadcasting and thread-safe data persistence.
- A **React (Vite)** and **TypeScript** frontend utilizing the HTML5 2D Canvas API for high-performance vector rendering.
- A modern styling system built with **Tailwind CSS v4** featuring glassmorphic menus, responsive grids, and sleek dark modes.

---

## ✨ Detailed Core Features

### 1. Multi-Room Isolation Lobbies
- **Lobby Gate**: When a user arrives at the site, if no room ID is present, they are presented with an onboarding landing page to either create a new room or join an existing one by entering its ID.
- **Query-Parameter Routing**: Creating or joining a room updates the URL with `?room=ROOM_ID` using HTML5 `history.pushState`.
- **Mount Verification**: On load, the application inspects the query string for `?room=...` and automatically connects to the specified WebSocket workspace room.
- **Dual-Layer Isolation Fallback**: To ensure room isolation even when connecting to legacy backends, the frontend prefixes all element and cursor IDs with `ROOM_ID + "_"`. Incoming updates that do not match the current room prefix are automatically filtered out.

### 2. 60fps HTML5 Canvas Rendering
- **Render Loop**: Implements an optimized `requestAnimationFrame` render loop that clears the canvas, redraws grid guidelines, and updates vector elements at a fluid 60fps.
- **Coordinate Transformation**: Applies dynamic zoom scaling and panning offsets (`panOffset.x`, `panOffset.y`) during redraws, converting local canvas coordinates back and forth to client screen coordinates.

### 3. Throttled WebSocket Syncing
- **Message Dispatch**: Sends updates for pencil paths, lines, rectangles, circles, text blocks, sticky notes, and cursor movements.
- **Throttling (35ms)**: Cursor position broadcasts are throttled to a `35ms` window to limit unnecessary packet traffic over WebSockets while preserving a smooth user experience.

### 4. Smooth Mobile Touch Controls
- **Pointer Mirroring**: Touch events (`onTouchStart`, `onTouchMove`, `onTouchEnd`) are bound to the canvas and mapped directly to core drawing handlers.
- **Touch Coordinate Extraction**: Extracts coordinate metrics from `e.touches[0]` for absolute precision.
- **Default Prevention**: Disables default mobile behaviors (like pull-to-refresh and viewport scrolling) specifically when the user is drawing on the canvas.
- **Touch Notes Dragging**: Integrates mobile touch listeners on sticky note headers so users can drag notes across the screen on tablets and mobile phones.

### 5. Local Undo/Redo Action Stacks
- **History Tracking**: Manages a local undo/redo stack utilizing `HistoryAction` nodes (types: `add`, `update`, `delete`).
- **Keyboard Shortcuts**: Supports global `Ctrl+Z` (Undo) and `Ctrl+Y` / `Ctrl+Shift+Z` (Redo) hooks (disabled when the user is editing text inputs or sticky note textareas).

### 6. Layer Management with Z-Indexing
- **Z-Order Manipulation**: Elements store a numeric `zIndex` field. Collaborators can click "Bring Front" or "Send Back" on the toolbar to dynamically increase or decrease an element's rendering order.
- **Draw Sorting**: Elements are sorted by `zIndex` before redrawing on the canvas.

### 7. Custom Canvas Background Presets
- **Ambient Themes**: Users can switch between White, Light Gray, Deep Charcoal, and Slate Black background themes. Grid lines are dynamically adjusted (light or dark opacity) based on the background color.

### 8. Floating Share Overlay & Dynamic QR Code
- **Floating Pill**: A distinct share action button floats next to the top Actions Toolbar.
- **QR Generation**: Opens a glassmorphic modal overlay displaying the room share link alongside a dynamically generated QR Code powered by the public API `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=...` so smartphone users can join instantly.
- **Copy Feedback**: Features a clipboard copy field with temporary color-changing click states.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Functional Hooks & Context)
- **Language**: TypeScript (Strict type checks)
- **Styling**: Tailwind CSS v4 (Glassmorphic layouts, slate color palettes)
- **Icons**: Lucide React
- **Engine**: HTML5 Canvas 2D Context API

### Backend
- **Framework**: FastAPI (Python 3.8+)
- **Server**: Uvicorn (Asynchronous WebSocket & HTTP server)
- **Validation**: Pydantic v2
- **Persistence**: Thread-locked, local JSON database (`board_data.json`)

---

## 💻 Local Setup & Installation

Ensure you have **Node.js 18+** and **Python 3.8+** installed.

### Option A: Automatic Launch (Windows PowerShell)
You can launch both the frontend and backend servers automatically in separate terminal windows:
```powershell
./run.ps1
```

---

### Option B: Manual Setup

#### 1. Configure the Backend (FastAPI)
Navigate to the `backend` folder, set up a virtual environment, and install dependencies:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```
Start the local API & WebSocket server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend will run on [http://localhost:8000](http://localhost:8000).

#### 2. Configure the Frontend (React & Vite)
Navigate to the `frontend` folder and install packages:
```bash
cd ../frontend
npm install
```
Start the Vite developer server:
```bash
npm run dev
```
The web application will open on [http://localhost:5173](http://localhost:5173).
