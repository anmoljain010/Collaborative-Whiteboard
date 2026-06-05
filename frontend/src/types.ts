export interface Point {
  x: number;
  y: number;
}

export type ToolType = 'select' | 'pencil' | 'rectangle' | 'circle' | 'line' | 'sticky' | 'text' | 'eraser';

export interface BoardElement {
  id: string;
  type: 'pencil' | 'rectangle' | 'circle' | 'line' | 'sticky' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[];
  text?: string;
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  fontSize?: number;
  creatorId: string;
  zIndex?: number;
}

export interface CursorPosition {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
  lastUpdated: number; // local timestamp to expire idle cursors
}

export type WebSocketMessageType =
  | 'init'
  | 'element_add'
  | 'element_update'
  | 'element_delete'
  | 'cursor_move'
  | 'clear';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  element?: BoardElement;
  elementId?: string;
  cursor?: Omit<CursorPosition, 'lastUpdated'>;
  elements?: BoardElement[];
  senderId: string;
}
