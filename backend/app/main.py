import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Set, Optional, Dict
from .models import WebSocketMessage, BoardElement
from .storage import BoardStorage

app = FastAPI(title="Collaborative Whiteboard API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = BoardStorage()

class ConnectionManager:
    def __init__(self):
        # Map room_id -> Set of WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
        self.active_connections[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, message: WebSocketMessage, room_id: str, exclude: Optional[WebSocket] = None):
        payload = message.model_dump_json()
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                if connection != exclude:
                    try:
                        await connection.send_text(payload)
                    except Exception:
                        # Handle closed connections gracefully
                        pass

manager = ConnectionManager()

@app.get("/api/board")
def get_board_state(room: str = "default") -> List[BoardElement]:
    return storage.get_all_elements(room)

@app.delete("/api/board")
def clear_board(room: str = "default"):
    storage.clear(room)
    return {"status": "cleared"}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str, room: str = "default"):
    await manager.connect(websocket, room)
    try:
        # Upon connecting, send initial board state to client
        current_elements = storage.get_all_elements(room)
        init_message = WebSocketMessage(
            type="init",
            elements=current_elements,
            senderId="server"
        )
        await websocket.send_text(init_message.model_dump_json())

        while True:
            data = await websocket.receive_text()
            try:
                msg_dict = json.loads(data)
                message = WebSocketMessage(**msg_dict)
                
                if message.type == "element_add" and message.element:
                    storage.add_element(room, message.element)
                    await manager.broadcast(message, room, exclude=websocket)
                    
                elif message.type == "element_update" and message.element:
                    storage.update_element(room, message.element)
                    await manager.broadcast(message, room, exclude=websocket)
                    
                elif message.type == "element_delete" and message.elementId:
                    storage.delete_element(room, message.elementId)
                    await manager.broadcast(message, room, exclude=websocket)
                    
                elif message.type == "cursor_move" and message.cursor:
                    await manager.broadcast(message, room, exclude=websocket)
                    
                elif message.type == "clear":
                    storage.clear(room)
                    await manager.broadcast(message, room, exclude=websocket)
            except Exception as e:
                print(f"Error processing WebSocket message: {e}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
