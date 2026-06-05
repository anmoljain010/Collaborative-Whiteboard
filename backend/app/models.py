from pydantic import BaseModel
from typing import List, Optional, Literal

class Point(BaseModel):
    x: float
    y: float

class BoardElement(BaseModel):
    id: str
    type: Literal["pencil", "rectangle", "circle", "line", "sticky", "text"]
    x: float
    y: float
    width: Optional[float] = None
    height: Optional[float] = None
    points: Optional[List[Point]] = None
    text: Optional[str] = None
    color: str  # stroke color, note color, or text color
    fillColor: Optional[str] = None
    strokeWidth: Optional[float] = None
    fontSize: Optional[float] = None
    creatorId: str

class CursorPosition(BaseModel):
    userId: str
    userName: str
    x: float
    y: float
    color: str

class WebSocketMessage(BaseModel):
    type: Literal["init", "element_add", "element_update", "element_delete", "cursor_move", "clear"]
    element: Optional[BoardElement] = None
    elementId: Optional[str] = None
    cursor: Optional[CursorPosition] = None
    elements: Optional[List[BoardElement]] = None
    senderId: str
