import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Set, Optional
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
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: WebSocketMessage, exclude: Optional[WebSocket] = None):
        payload = message.model_dump_json()
        for connection in self.active_connections:
            if connection != exclude:
                try:
                    await connection.send_text(payload)
                except Exception:
                    # Handle closed connections gracefully
                    pass

manager = ConnectionManager()

@app.get("/api/board")
def get_board_state() -> List[BoardElement]:
    return storage.get_all_elements()

@app.delete("/api/board")
def clear_board():
    storage.clear()
    return {"status": "cleared"}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket)
    try:
        # Upon connecting, send initial board state to client
        current_elements = storage.get_all_elements()
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
                    storage.add_element(message.element)
                    await manager.broadcast(message, exclude=websocket)
                    
                elif message.type == "element_update" and message.element:
                    storage.update_element(message.element)
                    await manager.broadcast(message, exclude=websocket)
                    
                elif message.type == "element_delete" and message.elementId:
                    storage.delete_element(message.elementId)
                    await manager.broadcast(message, exclude=websocket)
                    
                elif message.type == "cursor_move" and message.cursor:
                    await manager.broadcast(message, exclude=websocket)
                    
                elif message.type == "clear":
                    storage.clear()
                    await manager.broadcast(message, exclude=websocket)
            except Exception as e:
                print(f"Error processing WebSocket message: {e}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
