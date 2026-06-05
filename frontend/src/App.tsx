import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pointer,
  Pencil,
  Square,
  Circle as CircleIcon,
  Minus,
  FileText,
  Type,
  Eraser,
  Trash2,
  ZoomIn,
  ZoomOut,
  User,
  X,
  Undo,
  Redo,
  Share2
} from 'lucide-react';
import type { Point, ToolType, BoardElement, CursorPosition, WebSocketMessage } from './types';

// Beautiful modern color palette
const COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Coral', value: '#f87171' },
  { name: 'Emerald', value: '#34d399' },
  { name: 'Yellow', value: '#fbbf24' },
  { name: 'Purple', value: '#c084fc' },
  { name: 'White', value: '#f8fafc' },
  { name: 'Slate', value: '#475569' }
];

const STICKY_COLORS = [
  { name: 'Soft Yellow', value: '#fef08a', text: '#713f12' },
  { name: 'Soft Blue', value: '#bfdbfe', text: '#1e3a8a' },
  { name: 'Soft Green', value: '#bbf7d0', text: '#064e3b' },
  { name: 'Soft Pink', value: '#fbcfe8', text: '#831843' },
  { name: 'Soft Purple', value: '#e9d5ff', text: '#581c87' }
];

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

// Setup current user details from local storage or defaults
const getStoredUser = () => {
  const storedId = localStorage.getItem('board_user_id');
  const storedName = localStorage.getItem('board_user_name');
  const storedColor = localStorage.getItem('board_user_color');

  const id = storedId || 'user-' + generateId();
  const name = storedName || 'User ' + Math.floor(Math.random() * 1000);
  const color = storedColor || COLORS[Math.floor(Math.random() * COLORS.length)].value;

  if (!storedId) localStorage.setItem('board_user_id', id);
  if (!storedName) localStorage.setItem('board_user_name', name);
  if (!storedColor) localStorage.setItem('board_user_color', color);

  return { id, name, color };
};

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [elements, setElements] = useState<Record<string, BoardElement>>({});
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
  
  // Room state
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
  });
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Interactive state
  const [activeTool, setActiveTool] = useState<ToolType>('pencil');
  const [selectedColor, setSelectedColor] = useState<string>('#3b82f6');
  const [selectedStickyColor, setSelectedStickyColor] = useState<typeof STICKY_COLORS[0]>(STICKY_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [canvasBgColor, setCanvasBgColor] = useState<string>('#1e293b');
  
  // Canvas navigation
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Drawing states
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const [isDraggingElement, setIsDraggingElement] = useState<boolean>(false);
  const [dragStartOffset, setDragStartOffset] = useState<Point>({ x: 0, y: 0 });
  
  // UI States
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>(user.name);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastCursorBroadcast = useRef<number>(0);

  // Broadcast events to backend
  const sendWSMessage = useCallback((message: Omit<WebSocketMessage, 'senderId'>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...message, senderId: user.id }));
    }
  }, [user.id]);

  // Undo/Redo & Layout ordering history
  interface HistoryAction {
    type: 'add' | 'update' | 'delete';
    element: BoardElement;
    prevElement?: BoardElement;
  }

  const undoStack = useRef<HistoryAction[]>([]);
  const redoStack = useRef<HistoryAction[]>([]);
  const draggedElementInitialState = useRef<BoardElement | null>(null);
  const editingElementInitialState = useRef<BoardElement | null>(null);

  const pushToUndoStack = useCallback((action: HistoryAction) => {
    undoStack.current.push(action);
    redoStack.current = []; // clear redo on new action
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const action = undoStack.current.pop()!;
    redoStack.current.push(action);

    if (action.type === 'add') {
      setElements((prev) => {
        const updated = { ...prev };
        delete updated[action.element.id];
        return updated;
      });
      sendWSMessage({ type: 'element_delete', elementId: action.element.id });
      if (selectedElementId === action.element.id) setSelectedElementId(null);
    } else if (action.type === 'update') {
      const prevEl = action.prevElement;
      if (prevEl) {
        setElements((prev) => ({ ...prev, [prevEl.id]: prevEl }));
        sendWSMessage({ type: 'element_update', element: prevEl });
      }
    } else if (action.type === 'delete') {
      setElements((prev) => ({ ...prev, [action.element.id]: action.element }));
      sendWSMessage({ type: 'element_add', element: action.element });
    }
  }, [selectedElementId, sendWSMessage]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const action = redoStack.current.pop()!;
    undoStack.current.push(action);

    if (action.type === 'add') {
      setElements((prev) => ({ ...prev, [action.element.id]: action.element }));
      sendWSMessage({ type: 'element_add', element: action.element });
    } else if (action.type === 'update') {
      setElements((prev) => ({ ...prev, [action.element.id]: action.element }));
      sendWSMessage({ type: 'element_update', element: action.element });
    } else if (action.type === 'delete') {
      setElements((prev) => {
        const updated = { ...prev };
        delete updated[action.element.id];
        return updated;
      });
      sendWSMessage({ type: 'element_delete', elementId: action.element.id });
      if (selectedElementId === action.element.id) setSelectedElementId(null);
    }
  }, [selectedElementId, sendWSMessage]);

  // Bring to Front / Send to Back
  const bringToFront = useCallback(() => {
    if (!selectedElementId || !elements[selectedElementId]) return;
    const el = elements[selectedElementId];
    const allZIndices = Object.values(elements).map((item) => item.zIndex || 0);
    const maxZ = allZIndices.length > 0 ? Math.max(...allZIndices) : 0;
    const newZIndex = Math.max(maxZ + 1, Date.now());
    const updated = { ...el, zIndex: newZIndex };
    
    pushToUndoStack({ type: 'update', element: updated, prevElement: el });
    setElements((prev) => ({ ...prev, [selectedElementId]: updated }));
    sendWSMessage({ type: 'element_update', element: updated });
  }, [selectedElementId, elements, pushToUndoStack, sendWSMessage]);

  const sendToBack = useCallback(() => {
    if (!selectedElementId || !elements[selectedElementId]) return;
    const el = elements[selectedElementId];
    const allZIndices = Object.values(elements).map((item) => item.zIndex || 0);
    const minZ = allZIndices.length > 0 ? Math.min(...allZIndices) : 0;
    const newZIndex = minZ - 1;
    const updated = { ...el, zIndex: newZIndex };
    
    pushToUndoStack({ type: 'update', element: updated, prevElement: el });
    setElements((prev) => ({ ...prev, [selectedElementId]: updated }));
    sendWSMessage({ type: 'element_update', element: updated });
  }, [selectedElementId, elements, pushToUndoStack, sendWSMessage]);

  // Keybindings for Undo (Ctrl+Z) / Redo (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (isCtrl && !isTyping) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Initialize and manage WebSocket connection
  useEffect(() => {
    if (!activeRoomId) {
      setWsConnected(false);
      return;
    }

    let socket: WebSocket;
    let reconnectTimeout: number;

    const connectWebSocket = () => {
      // Dynamically use local ws server if running on localhost, else fallback to live Render server
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const baseWsUrl = isLocalhost
        ? `ws://${window.location.hostname}:8000`
        : 'wss://codraw-backend-8okx.onrender.com';
      
      const wsUrl = `${baseWsUrl}/ws/${user.id}?room=${activeRoomId}`;
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        console.log('Connected to whiteboard WebSocket server for room:', activeRoomId);
      };

      socket.onclose = () => {
        setWsConnected(false);
        console.log('WebSocket closed. Reconnecting...');
        reconnectTimeout = window.setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        socket.close();
      };

      socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'init':
              if (message.elements) {
                const elementMap: Record<string, BoardElement> = {};
                message.elements.forEach((el) => {
                  // Only keep elements for this active room (dual-layer isolation fallback)
                  if (el.id.startsWith(activeRoomId + '_')) {
                    elementMap[el.id] = el;
                  }
                });
                setElements(elementMap);
              }
              break;
            case 'element_add':
            case 'element_update':
              if (message.element && message.element.id.startsWith(activeRoomId + '_')) {
                setElements((prev) => ({
                  ...prev,
                  [message.element!.id]: message.element!
                }));
              }
              break;
            case 'element_delete':
              if (message.elementId && message.elementId.startsWith(activeRoomId + '_')) {
                setElements((prev) => {
                  const updated = { ...prev };
                  delete updated[message.elementId!];
                  return updated;
                });
                if (selectedElementId === message.elementId) {
                  setSelectedElementId(null);
                }
              }
              break;
            case 'cursor_move':
              if (message.cursor && message.cursor.userId.startsWith(activeRoomId + '_')) {
                const cleanUserId = message.cursor.userId.substring(activeRoomId.length + 1);
                setCursors((prev) => ({
                  ...prev,
                  [cleanUserId]: {
                    ...message.cursor!,
                    userId: cleanUserId,
                    lastUpdated: Date.now()
                  }
                }));
              }
              break;
            case 'clear':
              setElements({});
              setSelectedElementId(null);
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    };

    connectWebSocket();

    // Cursor expiration check loop
    const cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const active: Record<string, CursorPosition> = {};
        let changed = false;
        Object.entries(prev).forEach(([key, val]) => {
          if (now - val.lastUpdated < 5000) {
            active[key] = val;
          } else {
            changed = true;
          }
        });
        return changed ? active : prev;
      });
    }, 2000);

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
      clearInterval(cursorCleanupInterval);
    };
  }, [user.id, activeRoomId]);

  // Update userName locally and globally
  const handleSaveSettings = () => {
    if (!tempName.trim()) return;
    const updatedUser = { ...user, name: tempName };
    setUser(updatedUser);
    localStorage.setItem('board_user_name', tempName);
    setShowSettings(false);
  };

  const handleColorChange = (newColor: string) => {
    const updatedUser = { ...user, color: newColor };
    setUser(updatedUser);
    localStorage.setItem('board_user_color', newColor);
  };

  const handleCreateRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 9);
    setActiveRoomId(roomId);
    window.history.pushState(null, '', `?room=${roomId}`);
  };

  const handleJoinRoom = (roomId: string) => {
    if (!roomId.trim()) return;
    const cleanRoomId = roomId.trim();
    setActiveRoomId(cleanRoomId);
    window.history.pushState(null, '', `?room=${cleanRoomId}`);
  };

  const handleLeaveRoom = () => {
    setActiveRoomId(null);
    window.history.pushState(null, '', window.location.pathname);
    setElements({});
    setSelectedElementId(null);
    setShowSettings(false);
  };

  // Clear Board action (room isolated)
  const handleClearBoard = () => {
    if (!activeRoomId) return;
    if (window.confirm('Are you sure you want to clear the whiteboard for this room?')) {
      // Send individual delete events for each element in this room
      Object.keys(elements).forEach((id) => {
        if (id.startsWith(activeRoomId + '_')) {
          sendWSMessage({ type: 'element_delete', elementId: id });
        }
      });
      setElements({});
      setSelectedElementId(null);
    }
  };

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.1, 3.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.2));
  const handleZoomReset = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  // Convert client coordinate to canvas coordinates
  const getCanvasCoordinates = useCallback((clientX: number, clientY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panOffset.x) / zoom;
    const y = (clientY - rect.top - panOffset.y) / zoom;
    return { x, y };
  }, [panOffset, zoom]);

  // Click testing (Hit detection)
  const getElementAtPosition = useCallback((pos: Point): BoardElement | null => {
    const list = Object.values(elements).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    // Loop backwards to select topmost item first
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      if (el.type === 'pencil' && el.points) {
        // Check if cursor is close to any point
        for (const pt of el.points) {
          const dist = Math.hypot(pt.x - pos.x, pt.y - pos.y);
          if (dist < 8) return el;
        }
      } else if (el.type === 'rectangle') {
        const left = el.width! < 0 ? el.x + el.width! : el.x;
        const right = el.width! < 0 ? el.x : el.x + el.width!;
        const top = el.height! < 0 ? el.y + el.height! : el.y;
        const bottom = el.height! < 0 ? el.y : el.y + el.height!;
        if (pos.x >= left && pos.x <= right && pos.y >= top && pos.y <= bottom) {
          return el;
        }
      } else if (el.type === 'circle') {
        const cx = el.x;
        const cy = el.y;
        const dist = Math.hypot(pos.x - cx, pos.y - cy);
        if (dist <= Math.abs(el.width!)) return el;
      } else if (el.type === 'line') {
        // Distance from point to line segment
        const x1 = el.x;
        const y1 = el.y;
        const x2 = el.x + el.width!;
        const y2 = el.y + el.height!;
        const A = pos.x - x1;
        const B = pos.y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        let xx, yy;
        if (param < 0) {
          xx = x1;
          yy = y1;
        } else if (param > 1) {
          xx = x2;
          yy = y2;
        } else {
          xx = x1 + param * C;
          yy = y1 + param * D;
        }
        if (Math.hypot(pos.x - xx, pos.y - yy) < 8) return el;
      } else if (el.type === 'sticky') {
        const sw = el.width || 180;
        const sh = el.height || 180;
        if (pos.x >= el.x && pos.x <= el.x + sw && pos.y >= el.y && pos.y <= el.y + sh) {
          return el;
        }
      } else if (el.type === 'text') {
        const tw = el.width || 150;
        const th = el.height || 40;
        if (pos.x >= el.x && pos.x <= el.x + tw && pos.y >= el.y && pos.y <= el.y + th) {
          return el;
        }
      }
    }
    return null;
  }, [elements]);

  // Canvas redraw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill container
    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      canvas.width = (rect?.width || window.innerWidth) * window.devicePixelRatio;
      canvas.height = (rect?.height || window.innerHeight) * window.devicePixelRatio;
      canvas.style.width = `${rect?.width || window.innerWidth}px`;
      canvas.style.height = `${rect?.height || window.innerHeight}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Render loop
    const render = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      // Draw background
      ctx.fillStyle = canvasBgColor;
      ctx.fillRect(0, 0, w, h);

      // Draw Grid Background
      ctx.save();
      const isLightBg = canvasBgColor === '#ffffff' || canvasBgColor === '#f1f5f9';
      ctx.strokeStyle = isLightBg ? '#e2e8f0' : '#334155';
      ctx.lineWidth = 0.5;
      const gridSize = 40 * zoom;
      const startX = panOffset.x % gridSize;
      const startY = panOffset.y % gridSize;

      for (let x = startX; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = startY; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();

      // Transform for elements
      ctx.save();
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoom, zoom);

      // Draw vectors
      const sorted = Object.values(elements).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      sorted.forEach((el) => {
        ctx.strokeStyle = el.color;
        ctx.fillStyle = el.fillColor || 'transparent';
        ctx.lineWidth = el.strokeWidth || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (el.type === 'pencil' && el.points && el.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
        } else if (el.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(el.x, el.y);
          ctx.lineTo(el.x + el.width!, el.y + el.height!);
          ctx.stroke();
        } else if (el.type === 'rectangle') {
          ctx.beginPath();
          ctx.rect(el.x, el.y, el.width!, el.height!);
          if (el.fillColor) ctx.fill();
          ctx.stroke();
        } else if (el.type === 'circle') {
          ctx.beginPath();
          ctx.arc(el.x, el.y, Math.abs(el.width!), 0, 2 * Math.PI);
          if (el.fillColor) ctx.fill();
          ctx.stroke();
        }
      });

      // Highlight selected element
      if (selectedElementId && elements[selectedElementId]) {
        const el = elements[selectedElementId];
        ctx.strokeStyle = '#a78bfa'; // Violet border
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        if (el.type === 'rectangle') {
          ctx.strokeRect(el.x - 4, el.y - 4, el.width! + 8, el.height! + 8);
        } else if (el.type === 'circle') {
          ctx.beginPath();
          ctx.arc(el.x, el.y, Math.abs(el.width!) + 4, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (el.type === 'line') {
          ctx.strokeRect(
            Math.min(el.x, el.x + el.width!) - 4,
            Math.min(el.y, el.y + el.height!) - 4,
            Math.abs(el.width!) + 8,
            Math.abs(el.height!) + 8
          );
        } else if (el.type === 'pencil' && el.points) {
          const xs = el.points.map(p => p.x);
          const ys = el.points.map(p => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
        }
        ctx.setLineDash([]);
      }

      ctx.restore();
    };

    let animationFrameId: number;
    const tick = () => {
      render();
      animationFrameId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [elements, panOffset, zoom, selectedElementId, canvasBgColor]);

  // Shared Interaction Helpers
  const onStart = (clientX: number, clientY: number, shiftKey: boolean) => {
    const screenPos = { x: clientX, y: clientY };
    const canvasPos = getCanvasCoordinates(clientX, clientY);

    if (activeTool === 'select' && shiftKey) {
      setIsPanning(true);
      setPanStart(screenPos);
      return;
    }

    if (activeTool === 'select') {
      const clickedEl = getElementAtPosition(canvasPos);
      if (clickedEl) {
        setSelectedElementId(clickedEl.id);
        setIsDraggingElement(true);
        draggedElementInitialState.current = clickedEl;
        setDragStartOffset({
          x: canvasPos.x - clickedEl.x,
          y: canvasPos.y - clickedEl.y
        });
      } else {
        setSelectedElementId(null);
        setIsPanning(true);
        setPanStart(screenPos);
      }
      return;
    }

    if (activeTool === 'eraser') {
      const clickedEl = getElementAtPosition(canvasPos);
      if (clickedEl) {
        pushToUndoStack({ type: 'delete', element: clickedEl });
        setElements((prev) => {
          const updated = { ...prev };
          delete updated[clickedEl.id];
          return updated;
        });
        sendWSMessage({ type: 'element_delete', elementId: clickedEl.id });
      }
      return;
    }

    setIsDrawing(true);
    const id = activeRoomId ? `${activeRoomId}_${generateId()}` : generateId();
    setActiveElementId(id);

    let newElement: BoardElement;

    if (activeTool === 'pencil') {
      newElement = {
        id,
        type: 'pencil',
        x: canvasPos.x,
        y: canvasPos.y,
        points: [canvasPos],
        color: selectedColor,
        strokeWidth,
        creatorId: user.id,
        zIndex: Date.now()
      };
    } else if (activeTool === 'line') {
      newElement = {
        id,
        type: 'line',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 0,
        height: 0,
        color: selectedColor,
        strokeWidth,
        creatorId: user.id,
        zIndex: Date.now()
      };
    } else if (activeTool === 'rectangle') {
      newElement = {
        id,
        type: 'rectangle',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 0,
        height: 0,
        color: selectedColor,
        strokeWidth,
        creatorId: user.id,
        zIndex: Date.now()
      };
    } else if (activeTool === 'circle') {
      newElement = {
        id,
        type: 'circle',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 0,
        height: 0,
        color: selectedColor,
        strokeWidth,
        creatorId: user.id,
        zIndex: Date.now()
      };
    } else if (activeTool === 'sticky') {
      newElement = {
        id,
        type: 'sticky',
        x: canvasPos.x - 90,
        y: canvasPos.y - 90,
        width: 180,
        height: 180,
        color: selectedStickyColor.value,
        text: '',
        creatorId: user.id,
        zIndex: Date.now()
      };
      setIsDrawing(false);
      setActiveElementId(null);
      pushToUndoStack({ type: 'add', element: newElement });
      setElements((prev) => ({ ...prev, [id]: newElement }));
      sendWSMessage({ type: 'element_add', element: newElement });
      setSelectedElementId(id);
      setActiveTool('select');
      return;
    } else if (activeTool === 'text') {
      newElement = {
        id,
        type: 'text',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 160,
        height: 40,
        color: selectedColor,
        text: '',
        fontSize: 20,
        creatorId: user.id,
        zIndex: Date.now()
      };
      setIsDrawing(false);
      setActiveElementId(null);
      pushToUndoStack({ type: 'add', element: newElement });
      setElements((prev) => ({ ...prev, [id]: newElement }));
      sendWSMessage({ type: 'element_add', element: newElement });
      setSelectedElementId(id);
      setActiveTool('select');
      return;
    } else {
      return;
    }

    setElements((prev) => ({ ...prev, [id]: newElement }));
    sendWSMessage({ type: 'element_add', element: newElement });
  };

  const onMove = (clientX: number, clientY: number) => {
    const screenPos = { x: clientX, y: clientY };
    const canvasPos = getCanvasCoordinates(clientX, clientY);

    // Broadcast cursor position (Throttled to 35ms)
    const now = Date.now();
    if (now - lastCursorBroadcast.current > 35 && activeRoomId) {
      sendWSMessage({
        type: 'cursor_move',
        cursor: {
          userId: `${activeRoomId}_${user.id}`,
          userName: user.name,
          color: user.color,
          x: canvasPos.x,
          y: canvasPos.y
        }
      });
      lastCursorBroadcast.current = now;
    }

    if (isPanning) {
      const dx = screenPos.x - panStart.x;
      const dy = screenPos.y - panStart.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart(screenPos);
      return;
    }

    if (isDraggingElement && selectedElementId && elements[selectedElementId]) {
      const el = elements[selectedElementId];
      const newX = canvasPos.x - dragStartOffset.x;
      const newY = canvasPos.y - dragStartOffset.y;
      
      const updated = { ...el, x: newX, y: newY };
      setElements((prev) => ({ ...prev, [selectedElementId]: updated }));
      sendWSMessage({ type: 'element_update', element: updated });
      return;
    }

    if (!isDrawing || !activeElementId || !elements[activeElementId]) return;

    const activeEl = elements[activeElementId];

    let updated: BoardElement;

    if (activeEl.type === 'pencil' && activeEl.points) {
      updated = {
        ...activeEl,
        points: [...activeEl.points, canvasPos]
      };
    } else if (activeEl.type === 'line') {
      updated = {
        ...activeEl,
        width: canvasPos.x - activeEl.x,
        height: canvasPos.y - activeEl.y
      };
    } else if (activeEl.type === 'rectangle') {
      updated = {
        ...activeEl,
        width: canvasPos.x - activeEl.x,
        height: canvasPos.y - activeEl.y
      };
    } else if (activeEl.type === 'circle') {
      const dx = canvasPos.x - activeEl.x;
      const dy = canvasPos.y - activeEl.y;
      const radius = Math.hypot(dx, dy);
      updated = {
        ...activeEl,
        width: radius,
        height: radius
      };
    } else {
      return;
    }

    setElements((prev) => ({ ...prev, [activeElementId]: updated }));
    sendWSMessage({ type: 'element_update', element: updated });
  };

  const onEnd = () => {
    if (isDrawing && activeElementId && elements[activeElementId]) {
      pushToUndoStack({ type: 'add', element: elements[activeElementId] });
    }
    if (isDraggingElement && selectedElementId && elements[selectedElementId] && draggedElementInitialState.current) {
      const initial = draggedElementInitialState.current;
      const current = elements[selectedElementId];
      if (initial.x !== current.x || initial.y !== current.y) {
        pushToUndoStack({ type: 'update', element: current, prevElement: initial });
      }
    }
    setIsDrawing(false);
    setActiveElementId(null);
    setIsPanning(false);
    setIsDraggingElement(false);
    draggedElementInitialState.current = null;
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY, e.shiftKey);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    onMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    onEnd();
  };

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    onStart(touch.clientX, touch.clientY, false);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    onMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    onEnd();
  };

  // HTML Overlay Text area change handler
  const handleHtmlTextChange = (id: string, text: string) => {
    if (!elements[id]) return;
    const updated = { ...elements[id], text };
    setElements((prev) => ({ ...prev, [id]: updated }));
    sendWSMessage({ type: 'element_update', element: updated });
  };

  // Delete overlay element
  const deleteElement = (id: string) => {
    if (elements[id]) {
      pushToUndoStack({ type: 'delete', element: elements[id] });
    }
    setElements((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    sendWSMessage({ type: 'element_delete', elementId: id });
    if (selectedElementId === id) setSelectedElementId(null);
  };

  // Render Room Lobby Landing Page if room is null
  if (!activeRoomId) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-4 relative overflow-hidden font-sans select-none">
        {/* Modern ambient glowing backgrounds */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse duration-4000" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse duration-4000 delay-1000" />

        <div className="relative z-10 max-w-md w-full flex flex-col items-center gap-8 text-center animate-fade-in">
          {/* Glowing logo / header */}
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-3xl shadow-xl shadow-violet-600/20">
              <Pencil size={36} className="text-white" />
            </div>
            <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent drop-shadow-sm mt-4">
              CoDraw
            </h1>
            <p className="text-sm md:text-base text-slate-400 font-medium max-w-sm mt-2">
              A premium, real-time collaborative whiteboard. Sketch, add sticky notes, and share with your team instantly.
            </p>
          </div>

          {/* Actions Card */}
          <div className="w-full bg-slate-900/60 border border-slate-800/85 backdrop-blur-md p-6 md:p-8 rounded-3xl shadow-2xl flex flex-col gap-6">
            {/* Create Room Button */}
            <button
              onClick={handleCreateRoom}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-base transition-all duration-200 cursor-pointer shadow-lg shadow-violet-600/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              Create New Board
            </button>

            {/* Or Divider */}
            <div className="flex items-center gap-3 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <div className="h-px flex-1 bg-slate-800" />
              <span>Or Join Existing</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            {/* Join Room Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = e.currentTarget.elements.namedItem('roomIdInput') as HTMLInputElement;
                handleJoinRoom(target.value);
              }}
              className="flex flex-col gap-3"
            >
              <div className="relative">
                <input
                  name="roomIdInput"
                  type="text"
                  required
                  placeholder="Enter Board Room ID..."
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-100 placeholder-slate-500 text-sm font-semibold transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-2xl bg-slate-850 hover:bg-slate-800 text-slate-200 font-semibold text-sm transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              >
                Join Board
              </button>
            </form>
          </div>

          {/* Footer credits */}
          <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-4">
            Built with React & FastAPI
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ backgroundColor: canvasBgColor }}
      className="relative w-screen h-screen overflow-hidden text-slate-100 select-none font-sans transition-colors duration-200"
    >
      {/* Real-time Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 block cursor-crosshair touch-none"
      />

      {/* Floating HTML Components Overlay (Sticky notes & Textboxes) */}
      <div className="absolute inset-0 pointer-events-none">
        {Object.values(elements)
          .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
          .map((el) => {
            if (el.type === 'sticky') {
              const isSelected = selectedElementId === el.id;
              const cardBgColor = el.color;
              const darkText = STICKY_COLORS.find(c => c.value === cardBgColor)?.text || '#000000';

              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: el.x * zoom + panOffset.x,
                    top: el.y * zoom + panOffset.y,
                    width: 180 * zoom,
                    height: 180 * zoom,
                    backgroundColor: el.color,
                    color: darkText,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left'
                  }}
                  className={`pointer-events-auto rounded-xl p-3 flex flex-col shadow-lg shadow-black/40 border transition-shadow duration-200 ${
                    isSelected ? 'ring-2 ring-violet-500 border-violet-400 z-10' : 'border-black/10'
                  }`}
                >
                  {/* Drag Handle & Delete */}
                  <div className="flex justify-between items-center mb-1 text-xs opacity-40 hover:opacity-100 transition-opacity">
                    <div 
                      className="cursor-move p-0.5 select-none" 
                      title="Drag Note"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedElementId(el.id);
                        setIsDraggingElement(true);
                        draggedElementInitialState.current = el;
                        const canvasPos = getCanvasCoordinates(e.clientX, e.clientY);
                        setDragStartOffset({
                          x: canvasPos.x - el.x,
                          y: canvasPos.y - el.y
                        });
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        if (e.touches.length === 0) return;
                        const touch = e.touches[0];
                        setSelectedElementId(el.id);
                        setIsDraggingElement(true);
                        draggedElementInitialState.current = el;
                        const canvasPos = getCanvasCoordinates(touch.clientX, touch.clientY);
                        setDragStartOffset({
                          x: canvasPos.x - el.x,
                          y: canvasPos.y - el.y
                        });
                      }}
                    >
                      📝 Note
                    </div>
                    <button
                      onClick={() => deleteElement(el.id)}
                      className="text-red-700 hover:text-red-900 font-bold p-0.5 rounded cursor-pointer pointer-events-auto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <textarea
                    value={el.text || ''}
                    onChange={(e) => handleHtmlTextChange(el.id, e.target.value)}
                    placeholder="Type note..."
                    className="w-full flex-1 bg-transparent border-none outline-none resize-none text-sm leading-snug placeholder-black/30 font-medium"
                    style={{ color: darkText }}
                    onFocus={() => {
                      setSelectedElementId(el.id);
                      editingElementInitialState.current = el;
                    }}
                    onBlur={() => {
                      if (editingElementInitialState.current && editingElementInitialState.current.text !== el.text) {
                        pushToUndoStack({ type: 'update', element: el, prevElement: editingElementInitialState.current });
                      }
                      editingElementInitialState.current = null;
                    }}
                  />
                </div>
              );
            }

            if (el.type === 'text') {
              const isSelected = selectedElementId === el.id;
              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: el.x * zoom + panOffset.x,
                    top: el.y * zoom + panOffset.y,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left'
                  }}
                  className={`pointer-events-auto p-1 rounded border transition-colors duration-150 ${
                    isSelected ? 'border-violet-500/50 bg-violet-950/20' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={el.text || ''}
                      onChange={(e) => handleHtmlTextChange(el.id, e.target.value)}
                      placeholder="Type text..."
                      className="bg-transparent border-none outline-none text-base placeholder-slate-500/50 min-w-[120px] font-semibold"
                      style={{ color: el.color }}
                      onFocus={() => {
                        setSelectedElementId(el.id);
                        editingElementInitialState.current = el;
                      }}
                      onBlur={() => {
                        if (editingElementInitialState.current && editingElementInitialState.current.text !== el.text) {
                          pushToUndoStack({ type: 'update', element: el, prevElement: editingElementInitialState.current });
                        }
                        editingElementInitialState.current = null;
                      }}
                    />
                    {isSelected && (
                      <button
                        onClick={() => deleteElement(el.id)}
                        className="text-slate-400 hover:text-red-400 opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })}
      </div>

      {/* Other Users' Mouse Cursors */}
      <div className="absolute inset-0 pointer-events-none">
        {Object.values(cursors).map((cur) => {
          if (cur.userId === user.id) return null;
          const sx = cur.x * zoom + panOffset.x;
          const sy = cur.y * zoom + panOffset.y;

          // Render cursor pointer and username tag
          return (
            <div
              key={cur.userId}
              className="absolute left-0 top-0 transition-transform duration-75 pointer-events-none z-50"
              style={{
                transform: `translate3d(${sx}px, ${sy}px, 0)`
              }}
            >
              {/* Custom Colored Cursor Arrow */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: cur.color }}
                className="drop-shadow-md"
              >
                <path
                  d="M5.65376 12.3825L19.513 5.40295C20.3926 4.96025 21.3912 5.79848 21.054 6.74548L15.3407 22.8126C15.0118 23.7374 13.7303 23.7196 13.456 22.7845L11.0827 14.6853L5.27555 13.9149C4.38555 13.7969 4.31682 12.6397 5.65376 12.3825Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>
              {/* User Tag */}
              <div
                style={{ backgroundColor: cur.color }}
                className="ml-4 -mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-md flex items-center gap-1 border border-white/20 whitespace-nowrap"
              >
                <User size={8} /> {cur.userName}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Navigation & Connection HUD (Bottom Left) */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-4 pointer-events-auto z-40">
        <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            ) : (
              <span className="flex h-2 w-2 relative">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
            <span className="text-xs font-semibold text-slate-400">
              {wsConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span
              onClick={handleZoomReset}
              className="text-xs font-mono font-bold text-slate-300 w-12 text-center cursor-pointer hover:text-white"
              title="Reset Zoom & Pan"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Canvas background presets */}
          <div className="flex items-center gap-1.5" title="Canvas Background Color">
            {[
              { color: '#ffffff', name: 'White', border: 'border-slate-300' },
              { color: '#f1f5f9', name: 'Light Gray', border: 'border-slate-300' },
              { color: '#1e293b', name: 'Deep Charcoal', border: 'border-slate-700' },
              { color: '#090d16', name: 'Slate Black', border: 'border-slate-850' }
            ].map((bg) => (
              <button
                key={bg.color}
                onClick={() => setCanvasBgColor(bg.color)}
                style={{ backgroundColor: bg.color }}
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer transition-transform duration-100 ${bg.border} ${
                  canvasBgColor === bg.color ? 'scale-125 ring-2 ring-violet-500 ring-offset-2 ring-offset-slate-900' : ''
                }`}
                title={bg.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Floating Glassmorphic Main Toolbar (Top Center) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto z-40">
        <div className="flex flex-col gap-3 items-center">
          {/* Main Actions Panel & Share Wrapper */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* Main Actions Panel */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-slate-800 shadow-2xl flex-wrap justify-center max-w-[95vw] md:max-w-none">
              {[
                { id: 'select', icon: <Pointer size={18} />, label: 'Select / Move (Shift+Drag to Pan)' },
                { id: 'pencil', icon: <Pencil size={18} />, label: 'Draw' },
                { id: 'line', icon: <Minus size={18} />, label: 'Line' },
                { id: 'rectangle', icon: <Square size={18} />, label: 'Rectangle' },
                { id: 'circle', icon: <CircleIcon size={18} />, label: 'Circle' },
                { id: 'sticky', icon: <FileText size={18} />, label: 'Sticky Note' },
                { id: 'text', icon: <Type size={18} />, label: 'Text Box' },
                { id: 'eraser', icon: <Eraser size={18} />, label: 'Eraser' }
              ].map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => {
                    setActiveTool(tool.id as ToolType);
                    if (tool.id !== 'select') setSelectedElementId(null);
                  }}
                  className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                    activeTool === tool.id
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title={tool.label}
                >
                  {tool.icon}
                </button>
              ))}

              <div className="h-6 w-px bg-slate-800 mx-1" />

              {/* Undo button */}
              <button
                onClick={handleUndo}
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                title="Undo (Ctrl+Z)"
              >
                <Undo size={18} />
              </button>

              {/* Redo button */}
              <button
                onClick={handleRedo}
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                title="Redo (Ctrl+Y)"
              >
                <Redo size={18} />
              </button>

              <div className="h-6 w-px bg-slate-800 mx-1" />

              {/* Clear button */}
              <button
                onClick={handleClearBoard}
                className="p-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition-colors cursor-pointer"
                title="Clear Whiteboard"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Share Room Button */}
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all duration-200 cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center gap-2 text-xs md:text-sm px-4"
              title="Share Board Room"
            >
              <Share2 size={18} />
              <span className="hidden md:inline">Share</span>
            </button>
          </div>

          {/* Context Options for Select Tool (Arrange Layers & Delete) */}
          {activeTool === 'select' && selectedElementId && elements[selectedElementId] && (
            <div className="flex flex-wrap items-center justify-center gap-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 shadow-xl text-xs max-w-[90vw]">
              <span className="text-slate-400 font-semibold">Arrange:</span>
              <button
                onClick={bringToFront}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium cursor-pointer"
                title="Bring Selected Element to Front"
              >
                Bring Front
              </button>
              <button
                onClick={sendToBack}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium cursor-pointer"
                title="Send Selected Element to Back"
              >
                Send Back
              </button>
              <div className="h-4 w-px bg-slate-800" />
              <button
                onClick={() => deleteElement(selectedElementId)}
                className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 rounded-lg font-medium cursor-pointer"
                title="Delete Selected Element"
              >
                Delete
              </button>
            </div>
          )}

          {/* Context Options (Colors & Stroke sizing) */}
          {activeTool !== 'select' && activeTool !== 'eraser' && (
            <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 shadow-xl text-xs max-w-[90vw]">
              {activeTool === 'sticky' ? (
                // Sticky Note Color Picker
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">Note Color:</span>
                  <div className="flex gap-1.5">
                    {STICKY_COLORS.map((sc) => (
                      <button
                        key={sc.value}
                        onClick={() => setSelectedStickyColor(sc)}
                        style={{ backgroundColor: sc.value }}
                        className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                          selectedStickyColor.value === sc.value ? 'scale-125 ring-2 ring-violet-500 border-white' : 'border-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                // Stroke Color Picker
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">Color:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((col) => (
                      <button
                        key={col.value}
                        onClick={() => setSelectedColor(col.value)}
                        style={{ backgroundColor: col.value }}
                        className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                          selectedColor === col.value ? 'scale-125 ring-2 ring-violet-500 border-white' : 'border-transparent'
                        }`}
                        title={col.name}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Stroke Size slider */}
              {activeTool !== 'sticky' && activeTool !== 'text' && (
                <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
                  <span className="text-slate-400 font-semibold">Size:</span>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                    className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <span className="text-slate-400 font-mono w-4">{strokeWidth}px</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Settings & Profile (Top Right) */}
      <div className="absolute top-6 right-6 pointer-events-auto z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setTempName(user.name);
              setShowSettings(!showSettings);
            }}
            className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 shadow-2xl hover:bg-slate-800 transition-colors"
          >
            <div
              className="w-3 h-3 rounded-full border border-white/20"
              style={{ backgroundColor: user.color }}
            />
            <span className="text-sm font-semibold max-w-[120px] truncate">{user.name}</span>
          </button>
        </div>

        {/* Profile Settings Popup Modal */}
        {showSettings && (
          <div className="absolute right-0 mt-3 w-64 bg-slate-900/95 backdrop-blur-lg border border-slate-800 p-4 rounded-2xl shadow-2xl flex flex-col gap-4 text-sm z-50">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="font-bold text-slate-200">Collaborator Profile</span>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Display Name</label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="Enter name..."
                maxLength={18}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 text-slate-100 font-semibold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Cursor Color</label>
              <div className="grid grid-cols-7 gap-1">
                {COLORS.map((col) => (
                  <button
                    key={col.value}
                    onClick={() => handleColorChange(col.value)}
                    style={{ backgroundColor: col.value }}
                    className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                      user.color === col.value ? 'scale-110 ring-2 ring-violet-500 border-white' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 rounded-xl transition-colors cursor-pointer"
            >
              Save Changes
            </button>
            <button
              onClick={handleLeaveRoom}
              className="w-full bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 font-bold py-2 rounded-xl transition-colors cursor-pointer border border-rose-900/50 mt-1"
            >
              Leave Room
            </button>
          </div>
        )}
      </div>

      {/* Floating Overlay Helper Info */}
      <div className="absolute bottom-6 right-6 hidden md:block z-35 opacity-45 hover:opacity-100 transition-opacity">
        <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-900 p-3 rounded-xl text-[10px] text-slate-500 font-medium">
          <ul className="list-disc list-inside space-y-0.5">
            <li>Shift + Drag: Pan Canvas</li>
            <li>Mouse Wheel: Zoom In / Out</li>
            <li>Select element and drag to move</li>
            <li>Eraser: Click elements to remove</li>
          </ul>
        </div>
      </div>

      {/* Share Board QR Code Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-default"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-slate-900/95 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center gap-5 text-center relative pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-850 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="flex flex-col items-center gap-1.5 mt-2">
              <h3 className="text-lg font-bold text-slate-200">Share Board Room</h3>
              <p className="text-xs text-slate-400 font-medium max-w-[240px]">
                Scan this QR code with a phone camera or copy the link to collaborate in real-time.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-800">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `${window.location.origin}${window.location.pathname}?room=${activeRoomId}`
                )}`}
                alt="Room QR Code"
                className="w-44 h-44 block"
              />
            </div>

            {/* Copy Link Input */}
            <div className="w-full flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-1.5 rounded-2xl w-full">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${window.location.pathname}?room=${activeRoomId}`}
                  className="flex-1 bg-transparent border-none outline-none text-[11px] text-slate-400 font-mono pl-2 truncate"
                />
                <button
                  onClick={() => {
                    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${activeRoomId}`;
                    navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    copied
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                      : 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/20'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Footer Info */}
            <div className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
              Room ID: <span className="font-mono text-slate-400">{activeRoomId}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
