import math
import time
from typing import List, Tuple, Optional, Dict

# Ký hiệu trên bàn cờ
EMPTY = "."
HUMAN = "X"  # Người chơi (Minimizing player)
AI = "O"     # Máy (Maximizing player)

# Bảng trọng số vị trí ưu tiên khu vực trung tâm bàn cờ 5x5
CENTER_WEIGHTS = [
    [1, 2, 3, 2, 1],
    [2, 4, 6, 4, 2],
    [3, 6, 9, 6, 3],
    [2, 4, 6, 4, 2],
    [1, 2, 3, 2, 1],
]


class TicTacToe5x5AI:
    def __init__(self, board_size: int = 5, win_length: int = 4):
        self.size = board_size
        self.win_length = win_length
        self.nodes_visited = 0
        self.pruned_branches = 0
        self.windows = self._generate_windows(win_length)
        self.lines_5 = self._generate_windows(5) if board_size == 5 else []

    def _generate_windows(self, length: int) -> List[List[Tuple[int, int]]]:
        """Tạo danh sách tất cả các cửa sổ (ngang, dọc, chéo) có độ dài `length`."""
        windows = []
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for r in range(self.size):
            for c in range(self.size):
                for dr, dc in directions:
                    end_r = r + (length - 1) * dr
                    end_c = c + (length - 1) * dc
                    if 0 <= end_r < self.size and 0 <= end_c < self.size:
                        window = [(r + i * dr, c + i * dc) for i in range(length)]
                        windows.append(window)
        return windows

    def check_winner(self, board: List[List[str]]) -> Optional[str]:
        """Kiểm tra trạng thái kết thúc: trả về 'O', 'X', 'DRAW', hoặc None."""
        for window in self.windows:
            first = board[window[0][0]][window[0][1]]
            if first != EMPTY and all(board[r][c] == first for r, c in window):
                return first

        if all(board[r][c] != EMPTY for r in range(self.size) for c in range(self.size)):
            return "DRAW"
        return None

    def evaluate_board(self, board: List[List[str]], depth: int = 0) -> int:
        """
        Hàm lượng giá Heuristic cho bàn cờ 5x5:
        1. Điểm thắng/thua tuyệt đối (cộng/trừ depth để ưu tiên thắng sớm, thua muộn).
        2. Đánh giá từng cửa sổ chiến thắng (Win Windows).
        3. Phát hiện chuỗi mở 2 đầu nguy hiểm (_ X X X _ hoặc _ O O O _).
        4. Kiểm soát vị trí trung tâm.
        """
        winner = self.check_winner(board)
        if winner == AI:
            return 1_000_000 + depth * 1000
        if winner == HUMAN:
            return -1_000_000 - depth * 1000
        if winner == "DRAW":
            return 0

        score = 0
        # Thang điểm lũy tiến theo số quân trong 1 cửa sổ không bị chặn
        weights = {0: 0, 1: 10, 2: 120, 3: 1800, 4: 25000, 5: 500000}

        # 1. Đánh giá tất cả các cửa sổ độ dài win_length
        for window in self.windows:
            ai_count = 0
            human_count = 0
            for r, c in window:
                if board[r][c] == AI:
                    ai_count += 1
                elif board[r][c] == HUMAN:
                    human_count += 1

            # Cửa sổ chỉ có lợi khi chưa bị đối phương chặn
            if ai_count > 0 and human_count == 0:
                score += weights.get(ai_count, 0)
            elif human_count > 0 and ai_count == 0:
                score -= int(weights.get(human_count, 0) * 1.15)  # Ưu tiên phòng thủ

        # 2. Thưởng/Phạt chuỗi mở 2 đầu trên đường 5 ô (khi chơi luật 4 ô thắng)
        if self.win_length == 4 and self.lines_5:
            for line in self.lines_5:
                cells = [board[r][c] for r, c in line]
                # Chuỗi mở 2 đầu dạng: . O O O . hoặc . X X X .
                if cells[0] == EMPTY and cells[4] == EMPTY:
                    mid = cells[1:4]
                    if mid.count(AI) == 3:
                        score += 50000
                    elif mid.count(HUMAN) == 3:
                        score -= 60000
                    elif mid.count(AI) == 2 and mid.count(EMPTY) == 1:
                        score += 800
                    elif mid.count(HUMAN) == 2 and mid.count(EMPTY) == 1:
                        score -= 950

        # 3. Điểm kiểm soát trung tâm
        for r in range(self.size):
            for c in range(self.size):
                if board[r][c] == AI:
                    score += CENTER_WEIGHTS[r][c]
                elif board[r][c] == HUMAN:
                    score -= CENTER_WEIGHTS[r][c]

        return score

    def _creates_immediate_win(self, board: List[List[str]], r: int, c: int, player: str) -> bool:
        """Kiểm tra nhanh xem đánh vào (r, c) có giúp `player` thắng ngay lập tức không."""
        board[r][c] = player
        won = self.check_winner(board) == player
        board[r][c] = EMPTY
        return won

    def get_ordered_moves(self, board: List[List[str]], current_player: str) -> List[Tuple[int, int]]:
        """
        Sắp xếp nước đi (Move Ordering) để tối đa hóa hiệu quả cắt tỉa Alpha-Beta:
        1. Nước đi thắng ngay lập tức (+100,000)
        2. Nước đi chặn đối thủ thắng ngay (+50,000)
        3. Ô kề cận các quân cờ đã đánh (+40 mỗi quân lân cận)
        4. Ô gần trung tâm bàn cờ
        """
        opponent = HUMAN if current_player == AI else AI
        move_Candidates = []

        for r in range(self.size):
            for c in range(self.size):
                if board[r][c] != EMPTY:
                    continue

                priority = CENTER_WEIGHTS[r][c]

                # Kiểm tra thắng ngay hoặc chặn thắng ngay
                if self._creates_immediate_win(board, r, c, current_player):
                    priority += 100_000
                elif self._creates_immediate_win(board, r, c, opponent):
                    priority += 50_000

                # Cộng điểm nếu nằm sát các quân đã đánh trong bán kính 1 ô
                neighbors = 0
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.size and 0 <= nc < self.size and board[nr][nc] != EMPTY:
                            neighbors += 1
                priority += neighbors * 40

                move_Candidates.append((priority, r, c))

        # Sắp xếp giảm dần theo điểm ưu tiên
        move_Candidates.sort(key=lambda x: x[0], reverse=True)
        return [(r, c) for _, r, c in move_Candidates]

    def minimax(
        self,
        board: List[List[str]],
        depth: int,
        alpha: float,
        beta: float,
        is_maximizing: bool,
        use_alpha_beta: bool = True,
    ) -> int:
        """Thuật toán Minimax kết hợp Cắt tỉa Alpha-Beta."""
        self.nodes_visited += 1

        # Điều kiện dừng: có người thắng/hòa hoặc chạm độ sâu giới hạn
        winner = self.check_winner(board)
        if winner is not None or depth == 0:
            return self.evaluate_board(board, depth)

        current_player = AI if is_maximizing else HUMAN
        moves = self.get_ordered_moves(board, current_player)

        if is_maximizing:
            max_eval = -math.inf
            for r, c in moves:
                board[r][c] = AI
                eval_score = self.minimax(board, depth - 1, alpha, beta, False, use_alpha_beta)
                board[r][c] = EMPTY

                max_eval = max(max_eval, eval_score)
                alpha = max(alpha, eval_score)

                if use_alpha_beta and beta <= alpha:
                    self.pruned_branches += 1
                    break  # Cắt tỉa nhánh Beta
            return int(max_eval)
        else:
            min_eval = math.inf
            for r, c in moves:
                board[r][c] = HUMAN
                eval_score = self.minimax(board, depth - 1, alpha, beta, True, use_alpha_beta)
                board[r][c] = EMPTY

                min_eval = min(min_eval, eval_score)
                beta = min(beta, eval_score)

                if use_alpha_beta and beta <= alpha:
                    self.pruned_branches += 1
                    break  # Cắt tỉa nhánh Alpha
            return int(min_eval)

    def find_best_move(
        self,
        board: List[List[str]],
        max_depth: int = 4,
        use_alpha_beta: bool = True,
    ) -> Tuple[Optional[Tuple[int, int]], Dict]:
        """Tìm nước đi tối ưu nhất cho AI kèm thống kê thuật toán."""
        self.nodes_visited = 0
        self.pruned_branches = 0
        start_time = time.perf_counter()

        best_move = None
        best_score = -math.inf
        alpha = -math.inf
        beta = math.inf

        moves = self.get_ordered_moves(board, AI)
        move_evaluations = {}

        for r, c in moves:
            board[r][c] = AI
            score = self.minimax(board, max_depth - 1, alpha, beta, False, use_alpha_beta)
            board[r][c] = EMPTY

            move_evaluations[(r, c)] = score
            if score > best_score:
                best_score = score
                best_move = (r, c)

            alpha = max(alpha, best_score)

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        stats = {
            "best_move": best_move,
            "best_score": best_score,
            "nodes_visited": self.nodes_visited,
            "pruned_branches": self.pruned_branches,
            "time_ms": round(elapsed_ms, 2),
            "move_evaluations": move_evaluations,
        }
        return best_move, stats


# ==========================================
# CHƯƠNG TRÌNH CHẠY THỬ TRÊN CONSOLE
# ==========================================
def print_board(board: List[List[str]]):
    print("\n    0   1   2   3   4")
    print("  +---+---+---+---+---+")
    for r, row in enumerate(board):
        print(f"{r} | " + " | ".join(row) + " |")
        print("  +---+---+---+---+---+")


if __name__ == "__main__":
    # Khởi tạo AI cho bàn cờ 5x5, điều kiện 4 ô liên tiếp thắng
    ai_engine = TicTacToe5x5AI(board_size=5, win_length=4)
    board = [[EMPTY for _ in range(5)] for _ in range(5)]

    print("=== TIC-TAC-TOE 5x5 (MINIMAX + ALPHA-BETA PRUNING) ===")
    print("Bạn là 'X', AI là 'O'. Nhập tọa độ dạng: hàng cột (VD: 2 2)")

    while True:
        print_board(board)
        winner = ai_engine.check_winner(board)
        if winner:
            print(f"\n>>> KẾT THÚC: {'HÒA!' if winner == 'DRAW' else f'{winner} CHIẾN THẮNG!'} <<<")
            break

        # Lượt người chơi (X)
        try:
            user_input = input("\nLượt của bạn (hàng cột): ").strip().split()
            if len(user_input) != 2:
                print("Vui lòng nhập đúng 2 số: hàng và cột (từ 0 đến 4).")
                continue
            r, c = map(int, user_input)
            if not (0 <= r < 5 and 0 <= c < 5) or board[r][c] != EMPTY:
                print("Ô không hợp lệ hoặc đã có quân cờ!")
                continue
        except ValueError:
            print("Đầu vào không hợp lệ!")
            continue

        board[r][c] = HUMAN
        if ai_engine.check_winner(board):
            continue

        # Lượt AI (O)
        print("\nAI đang tính toán...")
        best_move, stats = ai_engine.find_best_move(board, max_depth=4, use_alpha_beta=True)
        if best_move:
            ai_r, ai_c = best_move
            board[ai_r][ai_c] = AI
            print(
                f"-> AI đánh ô ({ai_r}, {ai_c}) | Điểm: {stats['best_score']} | "
                f"Số nút duyệt: {stats['nodes_visited']} | "
                f"Nhánh cắt tỉa: {stats['pruned_branches']} | "
                f"Thời gian: {stats['time_ms']} ms"
            )