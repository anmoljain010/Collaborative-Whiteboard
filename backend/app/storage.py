import os
import json
import threading
from typing import List, Dict, Optional
from .models import BoardElement

class BoardStorage:
    def __init__(self, file_path: str = "board_data.json"):
        self.file_path = file_path
        self.lock = threading.Lock()
        self.room_elements: Dict[str, Dict[str, BoardElement]] = {}
        self.load_data()

    def load_data(self):
        with self.lock:
            if not os.path.exists(self.file_path):
                self.room_elements = {}
                self.save_data_unlocked()
                return
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.room_elements = {}
                    
                    # Check for rooms structure
                    rooms_data = data.get("rooms", {})
                    if rooms_data:
                        for room_id, el_list in rooms_data.items():
                            self.room_elements[room_id] = {
                                item["id"]: BoardElement(**item)
                                for item in el_list
                            }
                    # Fallback for old single-room data format
                    elif "elements" in data:
                        self.room_elements = {
                            "default": {
                                item["id"]: BoardElement(**item)
                                for item in data.get("elements", [])
                            }
                        }
                    else:
                        self.room_elements = {}
            except Exception as e:
                print(f"Error loading board data: {e}. Starting with empty board.")
                self.room_elements = {}

    def save_data(self):
        with self.lock:
            self.save_data_unlocked()

    def save_data_unlocked(self):
        try:
            # We dump elements to dicts first
            data = {
                "rooms": {
                    room_id: [
                        element.model_dump() for element in elements.values()
                    ]
                    for room_id, elements in self.room_elements.items()
                }
            }
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving board data: {e}")

    def get_all_elements(self, room_id: str) -> List[BoardElement]:
        with self.lock:
            if room_id not in self.room_elements:
                return []
            return list(self.room_elements[room_id].values())

    def add_element(self, room_id: str, element: BoardElement) -> BoardElement:
        with self.lock:
            if room_id not in self.room_elements:
                self.room_elements[room_id] = {}
            self.room_elements[room_id][element.id] = element
            self.save_data_unlocked()
            return element

    def update_element(self, room_id: str, element: BoardElement) -> Optional[BoardElement]:
        with self.lock:
            if room_id in self.room_elements and element.id in self.room_elements[room_id]:
                self.room_elements[room_id][element.id] = element
                self.save_data_unlocked()
                return element
            return None

    def delete_element(self, room_id: str, element_id: str) -> bool:
        with self.lock:
            if room_id in self.room_elements and element_id in self.room_elements[room_id]:
                del self.room_elements[room_id][element_id]
                self.save_data_unlocked()
                return True
            return False

    def clear(self, room_id: str):
        with self.lock:
            if room_id in self.room_elements:
                self.room_elements[room_id].clear()
                self.save_data_unlocked()
