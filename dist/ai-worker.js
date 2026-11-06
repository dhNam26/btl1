        const BOARD_SIZE = 9;
        const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE; // 25 ô (0..24)
        const EMPTY = 0;
        const HUMAN = 1; // Người chơi: X
        const AI = 2;    // Máy AI: O

        const COL_NAMES = 'ABCDEFGHI'.split('');

        // Trọng số vị trí tĩnh trên bàn cờ 9x9 (Ưu tiên trung tâm và các đường chéo chính)
        const POSITIONAL_WEIGHTS = Array.from({length:81}, (_,i) => 12-Math.abs(Math.floor(i/9)-4)-Math.abs(i%9-4));

        // Trạng thái ván đấu hiện tại
        let board = new Int8Array(TOTAL_CELLS);
        let currentPlayer = HUMAN;
        let gameOver = false;
        const winLength = 5;        // Luật cố định: ít nhất 5 quân liên tiếp
        let searchDepth = 4;      // Độ sâu tìm kiếm mặc định
        let useAlphaBeta = true;  // Bật cắt tỉa Alpha-Beta

        // Lưu trữ các đường thẳng (ngang, dọc, chéo) dùng cho kiểm tra thắng & hàm Heuristic
        let winSegments = [];     // Các đoạn có độ dài = winLength (28 đoạn nếu K=4, 12 đoạn nếu K=5)
        let fullLines = [];       // Toàn bộ các đường ngang, dọc, chéo có độ dài >= winLength để xét chặn 2 đầu

        // Lịch sử nước đi & Điểm số
        let moveHistory = [];     // [{ index, player, stats }]
        let lastMoveIndex = -1;
        let hintMoveIndex = -1;
        let winningCells = [];
        let lastCandidateScores = new Map(); // Lưu điểm đánh giá từng ô từ lần tìm kiếm gần nhất

        let scores = {
            player: 0,
            draw: 0,
            ai: 0
        };

        // Biến đếm thống kê thuật toán cho mỗi lượt AI
        let nodesEvaluated = 0;
        let prunedBranches = 0;
let deadline=Infinity; let budgetReached=false;

        /***********************************************************************
         * 2. TIỀN XỬ LÝ ĐƯỜNG THẮNG & ĐƯỜNG LƯỢNG GIÁ (PRECOMPUTED LINES)
         ***********************************************************************/
        function precomputeBoardLines(k) {
            winSegments = [];
            fullLines = [];

            const idx = (r, c) => r * BOARD_SIZE + c;

            // 1. Sinh tất cả các đoạn có độ dài đúng bằng k (để kiểm tra thắng nhanh O(1))
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    // Ngang (Horizontal)
                    if (c + k <= BOARD_SIZE) {
                        const seg = [];
                        for (let i = 0; i < k; i++) seg.push(idx(r, c + i));
                        winSegments.push(seg);
                    }
                    // Dọc (Vertical)
                    if (r + k <= BOARD_SIZE) {
                        const seg = [];
                        for (let i = 0; i < k; i++) seg.push(idx(r + i, c));
                        winSegments.push(seg);
                    }
                    // Chéo chính \ (Main Diagonal)
                    if (r + k <= BOARD_SIZE && c + k <= BOARD_SIZE) {
                        const seg = [];
                        for (let i = 0; i < k; i++) seg.push(idx(r + i, c + i));
                        winSegments.push(seg);
                    }
                    // Chéo phụ / (Anti Diagonal)
                    if (r + k <= BOARD_SIZE && c - k + 1 >= 0) {
                        const seg = [];
                        for (let i = 0; i < k; i++) seg.push(idx(r + i, c - i));
                        winSegments.push(seg);
                    }
                }
            }

            // 2. Sinh toàn bộ các đường đầy đủ (5 ngang, 5 dọc, các đường chéo >= k) để đánh giá chuỗi mở 2 đầu
            // 5 hàng ngang
            for (let r = 0; r < BOARD_SIZE; r++) {
                const line = [];
                for (let c = 0; c < BOARD_SIZE; c++) line.push(idx(r, c));
                fullLines.push(line);
            }
            // 5 cột dọc
            for (let c = 0; c < BOARD_SIZE; c++) {
                const line = [];
                for (let r = 0; r < BOARD_SIZE; r++) line.push(idx(r, c));
                fullLines.push(line);
            }
            // Đường chéo chính & các đường chéo song song có độ dài >= k
            for (let startR = 0; startR <= BOARD_SIZE - k; startR++) {
                const line = [];
                for (let i = 0; startR + i < BOARD_SIZE; i++) line.push(idx(startR + i, i));
                fullLines.push(line);
            }
            for (let startC = 1; startC <= BOARD_SIZE - k; startC++) {
                const line = [];
                for (let i = 0; startC + i < BOARD_SIZE; i++) line.push(idx(i, startC + i));
                fullLines.push(line);
            }
            // Đường chéo phụ & các đường chéo song song có độ dài >= k
            for (let startC = k - 1; startC < BOARD_SIZE; startC++) {
                const line = [];
                for (let i = 0; startC - i >= 0; i++) line.push(idx(i, startC - i));
                fullLines.push(line);
            }
            for (let startR = 1; startR <= BOARD_SIZE - k; startR++) {
                const line = [];
                for (let i = 0; startR + i < BOARD_SIZE; i++) line.push(idx(startR + i, BOARD_SIZE - 1 - i));
                fullLines.push(line);
            }
        }

        /***********************************************************************
         * 3. KIỂM TRA THẮNG / KẾT THÚC VÁN ĐẤU (TERMINAL STATE CHECK)
         ***********************************************************************/
        function checkWinnerState(b) {
            for (let i = 0; i < winSegments.length; i++) {
                const seg = winSegments[i];
                const first = b[seg[0]];
                if (first === EMPTY) continue;

                let won = true;
                for (let j = 1; j < seg.length; j++) {
                    if (b[seg[j]] !== first) {
                        won = false;
                        break;
                    }
                }
                if (won) {
                    return { winner: first, line: seg };
                }
            }

            // Kiểm tra còn ô trống không
            for (let i = 0; i < TOTAL_CELLS; i++) {
                if (b[i] === EMPTY) return null; // Chưa kết thúc
            }

            return { winner: 0, line: [] }; // Hòa (Draw)
        }

        /***********************************************************************
         * 4. HÀM LƯỢNG GIÁ HEURISTIC (BOARD EVALUATION FUNCTION)
         * Đánh giá trạng thái bàn cờ 9x9 dựa trên:
         * - Số cửa sổ (windows) có khả năng tạo thành k ô liên tiếp
         * - Các chuỗi liên tiếp mở 2 đầu (Open threats) và mở 1 đầu (Half-open)
         * - Kiểm soát vị trí trung tâm bàn cờ
         ***********************************************************************/
        const WIN_SCORE = 1000000;

        function evaluateBoard(b, depthRemaining = 0) {
            // 1. Kiểm tra nếu đã có người chiến thắng
            const winCheck = checkWinnerState(b);
            if (winCheck !== null) {
                if (winCheck.winner === AI) return WIN_SCORE + depthRemaining * 1000;
                if (winCheck.winner === HUMAN) return -WIN_SCORE - depthRemaining * 1000;
                return 0; // Hòa
            }

            let totalScore = 0;

            // 2. Lượng giá trên tất cả các đoạn (windows) độ dài K = winLength
            for (let i = 0; i < winSegments.length; i++) {
                const seg = winSegments[i];
                let aiCount = 0;
                let humanCount = 0;

                for (let j = 0; j < seg.length; j++) {
                    const cell = b[seg[j]];
                    if (cell === AI) aiCount++;
                    else if (cell === HUMAN) humanCount++;
                }

                // Nếu đoạn có cả X và O thì đoạn này đã bị khóa (không ai thắng được trên đoạn này)
                if (aiCount > 0 && humanCount > 0) continue;

                if (aiCount > 0) {
                    totalScore += getSegmentWeight(aiCount, winLength, true);
                } else if (humanCount > 0) {
                    totalScore -= getSegmentWeight(humanCount, winLength, false);
                }
            }

            // 3. Lượng giá chuỗi liên tiếp mở 2 đầu (Open-ended streaks) trên các đường dài 5 ô
            // Đặc biệt quan trọng với luật 4 ô liên tiếp: chuỗi 3 ô mở 2 đầu (_ X X X _) là chắc chắn thắng!
            if (winLength === 4) {
                for (let i = 0; i < fullLines.length; i++) {
                    const line = fullLines[i];
                    if (line.length < 5) continue;

                    // Kiểm tra mẫu _ O O O _ hoặc _ X X X _ trên đường 5 ô: vị trí [1, 2, 3] cùng màu và [0], [4] trống
                    const c0 = b[line[0]], c1 = b[line[1]], c2 = b[line[2]], c3 = b[line[3]], c4 = b[line[4]];
                    if (c1 !== EMPTY && c1 === c2 && c2 === c3) {
                        if (c0 === EMPTY && c4 === EMPTY) {
                            // Chuỗi 3 mở cả 2 đầu -> Không thể đỡ!
                            if (c1 === AI) totalScore += 65000;
                            else totalScore -= 75000;
                        } else if (c0 === EMPTY || c4 === EMPTY) {
                            // Chuỗi 3 mở 1 đầu -> Đe dọa thắng ở nước tiếp theo
                            if (c1 === AI) totalScore += 5500;
                            else totalScore -= 6500;
                        }
                    }
                }
            }

            // 4. Điểm kiểm soát vị trí trung tâm bàn cờ (Positional Control)
            for (let i = 0; i < TOTAL_CELLS; i++) {
                if (b[i] === AI) totalScore += POSITIONAL_WEIGHTS[i];
                else if (b[i] === HUMAN) totalScore -= POSITIONAL_WEIGHTS[i];
            }

            return totalScore;
        }

        // Bảng điểm theo số quân đã chiếm trong một cửa sổ thắng K ô
        function getSegmentWeight(count, k, isAI) {
            // Tăng nhẹ hệ số phòng thủ (!isAI) để AI luôn chủ động chặn các mối đe dọa nguy hiểm của người chơi
            const defenseMultiplier = isAI ? 1.0 : 1.15;
            if (k === 4) {
                if (count === 3) return Math.round(4200 * defenseMultiplier);
                if (count === 2) return Math.round(260 * defenseMultiplier);
                if (count === 1) return 18;
            } else {
                // k === 5
                if (count === 4) return Math.round(8000 * defenseMultiplier);
                if (count === 3) return Math.round(750 * defenseMultiplier);
                if (count === 2) return Math.round(90 * defenseMultiplier);
                if (count === 1) return 12;
            }
            return 0;
        }

        /***********************************************************************
         * 5. SẮP XẾP THỨ TỰ NƯỚC ĐI (MOVE ORDERING) ĐỂ TỐI ƯU CẮT TỈA ALPHA-BETA
         * Nếu xét các nước đi mạnh nhất trước (nước thắng ngay, nước chặn thắng,
         * hoặc ô gần các quân đã đánh), Alpha-Beta sẽ cắt tỉa được tối đa!
         ***********************************************************************/
        function getOrderedMoves(b, currentTurnPlayer) {
            const candidates = [];
            const opponent = currentTurnPlayer === AI ? HUMAN : AI;

            for (let i = 0; i < TOTAL_CELLS; i++) {
                if (b[i] !== EMPTY) continue;
                if (b.some(v=>v!==EMPTY) && !b.some((v,j)=>v!==EMPTY && Math.max(Math.abs(Math.floor(i/9)-Math.floor(j/9)),Math.abs(i%9-j%9))<=2)) continue;

                let priority = POSITIONAL_WEIGHTS[i] * 2;

                // Kiểm tra nhanh nếu đánh vào ô i có tạo thắng ngay hoặc chặn đối thủ thắng ngay không
                b[i] = currentTurnPlayer;
                const winNow = checkImmediateWinAt(b, currentTurnPlayer);
                b[i] = opponent;
                const blockOpponentWin = checkImmediateWinAt(b, opponent);
                b[i] = EMPTY;

                if (winNow) {
                    priority += 500000;
                } else if (blockOpponentWin) {
                    priority += 250000;
                } else {
                    // Cộng điểm nếu ô i nằm kề (trong bán kính 1 ô) với các quân cờ đã có trên bàn
                    const r = Math.floor(i / BOARD_SIZE);
                    const c = i % BOARD_SIZE;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                                const neighborVal = b[nr * BOARD_SIZE + nc];
                                if (neighborVal !== EMPTY) {
                                    priority += 45;
                                }
                            }
                        }
                    }
                }

                candidates.push({ index: i, priority });
            }

            // Sắp xếp giảm dần theo điểm ưu tiên
            candidates.sort((a, b) => b.priority - a.priority);
            return (candidates.some(c=>c.priority>=500000) ? candidates.filter(c=>c.priority>=500000) : candidates.some(c=>c.priority>=250000) ? candidates.filter(c=>c.priority>=250000) : candidates.slice(0,12)).map(c => c.index);
        }

        // Kiểm tra nhanh xem player có chuỗi thắng trên bàn cờ hay chưa
        function checkImmediateWinAt(b, player) {
            for (let i = 0; i < winSegments.length; i++) {
                const seg = winSegments[i];
                let match = true;
                for (let j = 0; j < seg.length; j++) {
                    if (b[seg[j]] !== player) {
                        match = false;
                        break;
                    }
                }
                if (match) return true;
            }
            return false;
        }

        /***********************************************************************
         * 6. THUẬT TOÁN MINIMAX KẾT HỢP CẮT TỈA ALPHA-BETA
         ***********************************************************************/
        function minimax(b, depth, alpha, beta, isMaximizing) {
            nodesEvaluated++;
if(performance.now()>deadline){budgetReached=true; return evaluateBoard(b,0);}

            // Kiểm tra trạng thái kết thúc hoặc đạt độ sâu giới hạn
            const winState = checkWinnerState(b);
            if (winState !== null || depth === 0) {
                return evaluateBoard(b, depth);
            }

            // Nếu bật Alpha-Beta thì dùng Move Ordering, nếu tắt thì duyệt tuần tự để người dùng thấy sự khác biệt
            const moves = useAlphaBeta
                ? getOrderedMoves(b, isMaximizing ? AI : HUMAN)
                : getOrderedMoves(b, isMaximizing ? AI : HUMAN).sort((a,b)=>a-b);

            if (isMaximizing) {
                let maxEval = -Infinity;
                for (let i = 0; i < moves.length; i++) {
                    const move = moves[i];
                    b[move] = AI;
                    const evaluation = minimax(b, depth - 1, alpha, beta, false);
                    b[move] = EMPTY;

                    if (evaluation > maxEval) maxEval = evaluation;
                    if (evaluation > alpha) alpha = evaluation;

                    // Cắt tỉa nhánh Beta (Beta Cutoff)
                    if (useAlphaBeta && beta <= alpha) {
                        prunedBranches += (moves.length - 1 - i);
                        break;
                    }
                }
                return maxEval;
            } else {
                let minEval = Infinity;
                for (let i = 0; i < moves.length; i++) {
                    const move = moves[i];
                    b[move] = HUMAN;
                    const evaluation = minimax(b, depth - 1, alpha, beta, true);
                    b[move] = EMPTY;

                    if (evaluation < minEval) minEval = evaluation;
                    if (evaluation < beta) beta = evaluation;

                    // Cắt tỉa nhánh Alpha (Alpha Cutoff)
                    if (useAlphaBeta && beta <= alpha) {
                        prunedBranches += (moves.length - 1 - i);
                        break;
                    }
                }
                return minEval;
            }
        }

        function getSequentialMoves(b) {
            const list = [];
            for (let i = 0; i < TOTAL_CELLS; i++) {
                if (b[i] === EMPTY) list.push(i);
            }
            return list;
        }

        /**
         * Hàm tìm nước đi tối ưu nhất tại gốc (Root Search) cho player (AI hoặc Gợi ý cho HUMAN)
         */
        function findBestMove(b, targetPlayer) {
            nodesEvaluated = 0;
            prunedBranches = 0;
            const startTime = performance.now(); deadline=startTime+1000; budgetReached=false;

            // Giới hạn độ sâu an toàn nếu người dùng tắt Alpha-Beta trên bàn cờ còn trống nhiều ô
            let emptyCount = 0;
            for (let i = 0; i < TOTAL_CELLS; i++) if (b[i] === EMPTY) emptyCount++;

            let effectiveDepth = searchDepth;
            if (!useAlphaBeta && emptyCount > 14 && effectiveDepth > 3) {
                effectiveDepth = 3; // Bảo vệ trình duyệt không bị treo khi tắt Alpha-Beta
            }

            const isMaximizingRoot = (targetPlayer === AI);
            const moves = useAlphaBeta
                ? getOrderedMoves(b, targetPlayer)
                : getOrderedMoves(b, targetPlayer).sort((a,b)=>a-b);

            let bestMove = moves[0];
            let bestScore = isMaximizingRoot ? -Infinity : Infinity;
            let alpha = -Infinity;
            let beta = Infinity;

            const rootEvaluations = [];

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                b[move] = targetPlayer;
                const score = minimax(b, effectiveDepth - 1, -Infinity, Infinity, !isMaximizingRoot);
                b[move] = EMPTY;

                rootEvaluations.push({ index: move, score });

                if (isMaximizingRoot) {
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = move;
                    }
                    if (score > alpha) alpha = score;
                } else {
                    if (score < bestScore) {
                        bestScore = score;
                        bestMove = move;
                    }
                    if (score < beta) beta = score;
                }
            }

            const elapsedMs = performance.now() - startTime;

            // Lưu lại bảng điểm của các ô trống để hiển thị Heatmap và bảng xếp hạng
            lastCandidateScores.clear();
            rootEvaluations.forEach(item => {
                // Quy đổi để luôn hiển thị trực quan
                lastCandidateScores.set(item.index, item.score);
            });

            // Sắp xếp danh sách ứng viên từ tốt nhất đến kém nhất
            rootEvaluations.sort((a, b) => isMaximizingRoot ? (b.score - a.score) : (a.score - b.score));

            return {
                bestMove,
                bestScore,
                nodesEvaluated,
                prunedBranches,
                elapsedMs,
                effectiveDepth,
                budgetReached,
                emptyCount,
                rootEvaluations
            };
        }

        /***********************************************************************
         * 7. GIAO DIỆN NGƯỜI DÙNG & TƯƠNG TÁC (UI RENDERING & INTERACTION)
         ***********************************************************************/

onmessage=({data})=>{ searchDepth=data.searchDepth;useAlphaBeta=data.useAlphaBeta;precomputeBoardLines(winLength);const result=findBestMove(new Int8Array(data.board),data.player);postMessage(result);};