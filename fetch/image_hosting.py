"""
图床上传模块：将 PIL Image 或 bytes 上传到 img.scdn.io，返回公开 URL。
职责独立，不依赖项目其他模块。
"""
import io
import requests
from PIL import Image


def upload_image(image_bytes: bytes, max_side: int = 1920) -> str | None:
    """
    上传图片字节到 img.scdn.io，缩放到最长边 max_side，返回公开 URL。
    失败返回 None。
    """
    img = Image.open(io.BytesIO(image_bytes))

    # 缩放
    w, h = img.size
    if w > max_side or h > max_side:
        ratio = max_side / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    buf.seek(0)

    url = 'https://img.scdn.io/api/v1.php'
    files = {'image': ('notam.png', buf, 'image/png')}

    try:
        resp = requests.post(url, files=files, timeout=60)
        if resp.status_code != 200:
            print(f"[image_hosting] HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        result = resp.json()
        if result.get('success'):
            return result.get('url') or result.get('data', {}).get('url', '')
        print(f"[image_hosting] 上传失败: {result.get('error', result.get('message', '未知'))}")
        return None
    except requests.RequestException as e:
        print(f"[image_hosting] 请求异常: {e}")
        return None
