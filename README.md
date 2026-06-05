# 🎨 CoDraw — Collaborative Whiteboard

CoDraw is a premium, real-time collaborative whiteboard workspace that lets teams draw, sketch, and brainstorm together instantly. Built with a modern tech stack utilizing a **FastAPI** backend, a **React** & **TypeScript** frontend, and styled with **Tailwind CSS**.

---

## 🚀 Core Features

- **Lobbies & Multi-Room Isolation**: Enter isolated board spaces using unique, random room IDs, preventing interference across different working sessions.
- **Fluid 60FPS Canvas Rendering**: Optimized HTML5 Canvas rendering engine with double buffering concepts to guarantee high-performance, smooth frame rates.
- **Real-Time WebSocket Syncing**: Sync drawing paths, vector shapes (lines, rectangles, circles), HTML sticky notes, text boxes, and user cursors instantly across all connected collaborators.
- **Mobile Touch Controls**: Seamless mobile support via responsive touch listeners (`onTouchStart`, `onTouchMove`, `onTouchEnd`) mapping screen coordinates with zero lag.
- **Undo/Redo History Stacks**: Full keyboard and UI-driven history rollbacks (via `Ctrl+Z` / `Ctrl+Y` or standard undo/redo action buttons).
- **Layer & Element Management**: Select, move, and arrange layers dynamically (using "Bring Front" and "Send Back") or delete individual board elements.
- **Dynamic Background Themes**: Toggle whiteboard background colors and matching grid layouts on the fly (White, Light Gray, Deep Charcoal, and Slate Black).
- **QR Code & Room Sharing**: Share active whiteboard urls instantly using a floating share modal equipped with dynamic QR Code generation for mobile scanning.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Functional Components & Hooks)
- **Language**: TypeScript (Strict Typings)
- **Bundler & Server**: Vite 8 (Ultra-fast HMR)
- **Styling**: Tailwind CSS v4 (Glassmorphism & Sleek Dark Modes)
- **Icons**: Lucide React
- **Drawing**: HTML5 2D Canvas API

### Backend
- **Framework**: FastAPI (Python 3)
- **Server**: Uvicorn (Asynchronous HTTP & WebSocket Server)
- **Validation**: Pydantic v2 (Strict message validation schema)
- **Data Persistence**: Local, thread-safe JSON database storage

---

## ⚙️ Quick Setup

You can run the entire workspace (both frontend and backend) simultaneously with a single command, or launch them individually.

### Option A: Automatic Launch (Windows PowerShell)

Run the pre-configured PowerShell run script in the root directory:
```powershell
./run.ps1
```
This script will automatically:
1. Detect Node.js and Python.
2. Initialize a Python virtual environment (`.venv`) and install all backend requirements.
3. Launch the FastAPI backend on `http://localhost:8000`.
4. Launch the Vite frontend dev server on `http://localhost:5173`.

---

### Option B: Manual Setup

#### 1. Running the FastAPI Backend
Ensure you have Python 3.8+ installed. Navigate to the `backend` folder:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Running the Vite Frontend
Ensure you have Node.js 18+ installed. Navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.
