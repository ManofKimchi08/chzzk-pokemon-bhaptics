import os
import sys
import json
import threading
import tkinter as tk

POS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overlay_positions.json')

def load_positions():
    try:
        if os.path.exists(POS_FILE):
            with open(POS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {}

def save_positions(pos_dict):
    try:
        with open(POS_FILE, 'w', encoding='utf-8') as f:
            json.dump(pos_dict, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

class MotorUnitWindow:
    def __init__(self, tk_root, title, side, haptic_engine, default_x, default_y, on_close):
        self.root = tk_root
        self.title = title
        self.side = side  # 'front' or 'back'
        self.haptic_engine = haptic_engine
        self.on_close = on_close
        self.TRANS_COLOR = '#010203'
        
        saved = load_positions()
        pos = saved.get(side, {})
        self.x = pos.get('x', default_x)
        self.y = pos.get('y', default_y)
        
        self.w = 150
        self.h = 220
        
        # If this is not the root tk instance, use Toplevel
        if tk_root is None:
            self.win = tk.Tk()
        else:
            self.win = tk.Toplevel(tk_root)
            
        self.win.title(f'bHaptics {title}')
        self.win.overrideredirect(True)
        self.win.attributes('-topmost', True)
        self.win.attributes('-transparentcolor', self.TRANS_COLOR)
        self.win.config(bg=self.TRANS_COLOR)
        self.win.geometry(f'{self.w}x{self.h}+{self.x}+{self.y}')
        
        self.canvas = tk.Canvas(self.win, bg=self.TRANS_COLOR, highlightthickness=0, width=self.w, height=self.h)
        self.canvas.pack(fill='both', expand=True)
        
        # Drag header bar
        bar_bg = self.canvas.create_rectangle(4, 4, self.w - 4, 26, fill='#0d1322', outline='#38bdf8', width=1)
        bar_txt = self.canvas.create_text(self.w // 2 - 8, 15, text=f'🎽 {title}', fill='#38bdf8', font=('Pretendard', 9, 'bold'))
        close_txt = self.canvas.create_text(self.w - 14, 15, text='✕', fill='#ef4444', font=('Pretendard', 10, 'bold'))
        
        self.canvas.tag_bind(close_txt, '<Button-1>', lambda e: self.destroy())
        
        # Drag logic
        self.drag_start_x = 0
        self.drag_start_y = 0
        def start_drag(e):
            self.drag_start_x = e.x_root - self.win.winfo_x()
            self.drag_start_y = e.y_root - self.win.winfo_y()
        def on_drag(e):
            new_x = e.x_root - self.drag_start_x
            new_y = e.y_root - self.drag_start_y
            self.win.geometry(f'+{new_x}+{new_y}')
            self.x = new_x
            self.y = new_y
        def stop_drag(e):
            p = load_positions()
            p[self.side] = {'x': self.x, 'y': self.y}
            save_positions(p)
            
        for tag in (bar_bg, bar_txt):
            self.canvas.tag_bind(tag, '<Button-1>', start_drag)
            self.canvas.tag_bind(tag, '<B1-Motion>', on_drag)
            self.canvas.tag_bind(tag, '<ButtonRelease-1>', stop_drag)
            
        # Title text
        self.canvas.create_text(self.w // 2, 40, text=title, fill='#38bdf8', font=('Pretendard', 11, 'bold'))
        
        # 4x5 circular motor dots
        self.dots = []
        dot_size = 18
        gap = 7
        start_gx = (self.w - (4 * dot_size + 3 * gap)) // 2
        start_gy = 54
        for r in range(5):
            for c in range(4):
                dx = start_gx + c * (dot_size + gap)
                dy = start_gy + r * (dot_size + gap)
                dot = self.canvas.create_oval(dx, dy, dx + dot_size, dy + dot_size, outline='#38bdf8', width=1.5, fill=self.TRANS_COLOR)
                self.dots.append(dot)

    def update_motors(self, values, level):
        try:
            color = '#38bdf8'
            if level == 'medium': color = '#fbbf24'
            elif level == 'heavy': color = '#f97316'
            elif level in ('critical', 'faint'): color = '#f43f5e'
            elif level == 'heartbeat': color = '#ec4899'
            
            for i, val in enumerate(values[:20]):
                fill_col = color if val > 1 else self.TRANS_COLOR
                out_col = color if val > 1 else '#38bdf8'
                self.canvas.itemconfig(self.dots[i], fill=fill_col, outline=out_col)
        except Exception:
            pass

    def destroy(self):
        try:
            self.win.destroy()
        except:
            pass
        if self.on_close:
            self.on_close(self.side)

class DesktopHapticOverlay:
    _instance = None

    @classmethod
    def get_instance(cls, haptic_engine=None):
        if cls._instance is None:
            cls._instance = cls(haptic_engine)
        elif haptic_engine:
            cls._instance.haptic_engine = haptic_engine
        return cls._instance

    def __init__(self, haptic_engine=None):
        self.haptic_engine = haptic_engine
        self.root = None
        self.front_win = None
        self.back_win = None
        self.is_running = False

    def start(self, side='both'):
        if self.is_running and self.root:
            try:
                if self.front_win and side in ('both', 'front'):
                    self.front_win.win.deiconify()
                    self.front_win.win.lift()
                if self.back_win and side in ('both', 'back'):
                    self.back_win.win.deiconify()
                    self.back_win.win.lift()
                return True
            except:
                pass
        t = threading.Thread(target=lambda: self._run(side), daemon=True)
        t.start()
        return True

    def _run(self, side='both'):
        self.is_running = True
        try:
            self.root = tk.Tk()
            self.root.withdraw()  # Hide master root window
            
            screen_w = self.root.winfo_screenwidth()
            screen_h = self.root.winfo_screenheight()
            
            def handle_child_close(closed_side):
                if closed_side == 'front':
                    self.front_win = None
                elif closed_side == 'back':
                    self.back_win = None
                if not self.front_win and not self.back_win:
                    self.stop()

            # Front default position: left side
            front_def_x = max(20, screen_w // 2 - 300)
            front_def_y = 120
            # Back default position: right side
            back_def_x = min(screen_w - 180, screen_w // 2 + 150)
            back_def_y = 120

            if side in ('both', 'front'):
                self.front_win = MotorUnitWindow(self.root, '정면', 'front', self.haptic_engine, front_def_x, front_def_y, handle_child_close)
            if side in ('both', 'back'):
                self.back_win = MotorUnitWindow(self.root, '후면', 'back', self.haptic_engine, back_def_x, back_def_y, handle_child_close)
                
            def update_loop():
                if not self.is_running or not self.root:
                    return
                try:
                    if self.haptic_engine:
                        front, back, level = self.haptic_engine.get_current_motor_intensities()
                        if self.front_win:
                            self.front_win.update_motors(front, level)
                        if self.back_win:
                            self.back_win.update_motors(back, level)
                except Exception:
                    pass
                if self.is_running and self.root:
                    self.root.after(60, update_loop)
                    
            self.root.after(100, update_loop)
            self.root.mainloop()
        except Exception:
            pass
        finally:
            self.is_running = False
            self.root = None
            self.front_win = None
            self.back_win = None

    def stop(self):
        self.is_running = False
        if self.root:
            try:
                self.root.quit()
                self.root.destroy()
            except:
                pass
        self.root = None
        self.front_win = None
        self.back_win = None
