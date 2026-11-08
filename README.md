### This repository made by Gemini 4 Argon with GPT-6.1 Sol


# Caro Lab 9×9 — AI nâng cấp - Upgrade by GPT

## Sức chơi

| Chế độ | Độ sâu mục tiêu | Ngân sách mỗi lượt |
| --- | --- | --- |
| Nhanh | 8 tầng | 1,5 giây |
| Mạnh (mặc định) | 12 tầng | 4 giây |
| Chuyên gia | 16 tầng | 8 giây |

Độ sâu mục tiêu không phải cam kết duyệt xong từng ấy tầng. Do LMR, một số nhánh yên tĩnh được xét nông hơn độ sâu danh nghĩa. Iterative deepening chỉ giữ kết quả tầng đã hoàn tất. Nếu hết giờ ngay tầng đầu, engine dùng nước dự phòng ưu tiên thắng/chặn thắng/đe dọa. Đòn bắt buộc được mở rộng tối đa 6 tầng ngoài chân trời thông thường. Giao diện hiển thị riêng tầng đã hoàn tất và độ sâu lớn nhất đã xét.

Engine dùng Negamax/Minimax, Alpha-Beta/PVS, giảm độ sâu các nước yên tĩnh xét muộn (LMR, kiểm tra lại khi nước giảm sâu cải thiện điểm), bộ nhớ thế cờ với Zobrist hash, lượng giá cập nhật sau từng nước, nhận diện chuỗi mở/chuỗi đứt và đòn kép. Kiểm tra thắng/chặn thắng quét toàn bàn. Các nước thông thường xét trong bán kính 2 ô, giới hạn 24 ứng viên ở gốc, 18 gần gốc, 14 ở sâu; các ứng viên chiến thuật quan trọng được giữ ngoài giới hạn đó. Vì vậy đây vẫn là tìm kiếm có chọn lọc, không phải lời giải tối ưu toàn bộ bàn cờ.

## Kiểm tra

```bash
node check-ai.cjs
```

Các ca gồm thắng/chặn thắng ngay, chuỗi bốn đứt, đường chéo, tạo/chặn bốn mở, tạo/chặn đòn kép; kiểm tra 4 quân chưa thắng và 5 quân thắng theo 4 hướng; so sánh giá trị Minimax khi bật/tắt Alpha-Beta ở cùng độ sâu hoàn tất; đảm bảo hết giờ không làm thay đổi bàn cờ.

Các ván đối đầu với bản cũ là phép kiểm tra sức chơi trên mẫu nhỏ; kết quả không bảo đảm thắng người chơi.
