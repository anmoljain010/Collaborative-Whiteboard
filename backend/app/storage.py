import os
import json
import threading
from typing import List, Dict, Optional
from .models import BoardElement

class BoardStorage:
    def __init__(self, file_path: str = "board_data.json"):
        self.file_path = file_path
        self.lock = threading.Lock()
        self.elements: Dict[str, BoardElement] = {}
        self.load_data()

    def load_data(self):
        with self.lock:
            if not os.path.exists(self.file_path):
                self.elements = {}
                self.save_data_unlocked()
                return
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Convert to BoardElement objects
                    self.elements = {
                        item["id"]: BoardElement(**item)
                        for item in data.get("elements", [])
                    }
            except Exception as e:
                print(f"Error loading board data: {e}. Starting with empty board.")
                self.elements = {}

    def save_data(self):
        with self.lock:
            self.save_data_unlocked()

    def save_data_unlocked(self):
        try:
            # We dump elements to dicts first
            data = {
                "elements": [
                    element.model_dump() for element in self.elements.values()
                ]
            }
            # Write to a temp file and rename or overwrite
            # Since this runs on Windows, we overwrite directly to avoid OS-specific file lock issues on rename
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving board data: {e}")

    def get_all_elements(self) -> List[BoardElement]:
        with self.lock:
            return list(self.elements.values())

    def add_element(self, element: BoardElement) -> BoardElement:
        with self.lock:
            self.elements[element.id] = element
            self.save_data_unlocked()
            return element

    def update_element(self, element: BoardElement) -> Optional[BoardElement]:
        with self.lock:
            if element.id in self.elements:
                self.elements[element.id] = element
                self.save_data_unlocked()
                return element
            return None

    def delete_element(self, element_id: str) -> bool:
        with self.lock:
            if element_id in self.elements:
                del self.elements[element_id]
                self.save_data_unlocked()
                return True
            return False

    def clear(self):
        with self.lock:
            self.elements.clear()
            self.save_data_unlocked()
