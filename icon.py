import os
import subprocess
from pathlib import Path

# 使用 Path 來處理路徑
current_dir = Path(__file__).parent
icons_dir = current_dir / 'icons'
svg_file = current_dir / 'lightning.svg'

# 創建 icons 目錄
if not os.path.exists(icons_dir):
    os.makedirs(icons_dir)

def convert_svg_to_png(svg_path, output_path, size):
    try:
        # Inkscape 的安裝路徑
        inkscape_path = r'C:\Program Files\Inkscape\bin\inkscape.exe'
        
        # 確保路徑存在
        if not os.path.exists(inkscape_path):
            print(f'錯誤: 找不到 Inkscape，請確認安裝路徑: {inkscape_path}')
            return
            
        # 使用 Inkscape 命令行工具轉換
        subprocess.run([
            inkscape_path,
            '--export-type=png',
            f'--export-filename={output_path}',
            f'--export-width={size}',
            f'--export-height={size}',
            str(svg_path)  # 轉換為字符串
        ], check=True)
        print(f'已生成 {size}x{size} 圖標: {output_path}')
    except Exception as e:
        print(f'轉換失敗: {e}')

# 需要的圖標尺寸
sizes = [16, 48, 128]

# 轉換每個尺寸
for size in sizes:
    output_file = icons_dir / f'lightning{size}.png'
    convert_svg_to_png(svg_file, output_file, size)
