"""
NOTAM QQ Bot 通知模块。
职责：接收邮件草稿 payload，提取图片与摘要，上传图床，启动 bot_send 子进程发送群消息。
"""
import os
import sys
import subprocess
from datetime import datetime

from fetch.image_hosting import upload_image

# ── 配置 ──────────────────────────────────────────────────────
APP_ID = os.getenv('APP_ID', '').strip()
APP_SECRET = os.getenv('APP_SECRET', '').strip()
GROUP_OPENID = '1E03FF7A6A726FCB9F81C2E0419F53E9'
QQBOT_ENABLED = True


def _build_message_text(email_draft: dict) -> str:
    """从邮件 body_text 中提取航警信息，去掉历史匹配结果行"""
    text = email_draft.get('body_text', '')
    if not text:
        return 'NOTAM更新：无详细数据。'
    lines = text.split('\n')
    filtered = []
    skip = False
    for line in lines:
        # 匹配结果行及其子项以空格/短横开头，跳过整块
        if line.strip().startswith('历史匹配结果') or line.strip().startswith('- 重叠') or (line.startswith('  -') and skip):
            skip = True
            continue
        if line.strip().startswith('历史匹配结果'):
            skip = True
            continue
        skip = False
        filtered.append(line)
    return '\n'.join(filtered)


def send_notification(email_draft: dict) -> bool:
    """
    主入口：根据邮件草稿发送 QQ Bot 通知。
    流程：存临时图片 → 图床上传 → 子进程 bot_send → 删除临时文件。
    """
    if not QQBOT_ENABLED:
        print('[notam_bot] QQBOT_ENABLED=false，跳过')
        return False
    if not APP_ID or not APP_SECRET:
        print('[notam_bot] APP_ID/APP_SECRET 未配置，跳过')
        return False
    if not GROUP_OPENID:
        print('[notam_bot] GROUP_OPENID 未配置，跳过')
        return False

    # 1. 提取图片
    image_bytes = None
    inline_images = email_draft.get('inline_images', []) or []
    if inline_images:
        image_bytes = inline_images[0].get('data')
    if not image_bytes:
        print('[notam_bot] 邮件草稿中无图片，仅发送文本')

    # 2. 存临时文件（方便排查 + 子进程找不到也可以用）
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    temp_png = os.path.abspath(os.path.join(temp_dir, f'notam_{timestamp}.png'))

    if image_bytes:
        try:
            with open(temp_png, 'wb') as f:
                f.write(image_bytes)
            print(f'[notam_bot] 临时图片已保存: {temp_png}')
        except Exception as e:
            print(f'[notam_bot] 保存临时图片失败: {e}')
            temp_png = None

    # 3. 上传图床（重试 2 次）
    image_url = None
    if image_bytes:
        print('[notam_bot] 上传图片至图床...')
        for attempt in range(2):
            image_url = upload_image(image_bytes)
            if image_url:
                print(f'[notam_bot] 图床上传成功: {image_url}')
                break
            print(f'[notam_bot] 图床上传第 {attempt+1} 次失败，{"重试" if attempt==0 else "放弃"}')

    # 4. 构建消息内容
    message_text = _build_message_text(email_draft)

    # 5. 启动 bot_send 子进程发送
    print(f'[notam_bot] 启动 bot_send 进程发送消息: {message_text[:100]}...')
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notam_bot_send.py')

    if not os.path.exists(script_path):
        print(f'[notam_bot] 找不到 bot_send 脚本: {script_path}')
        return False

    env = os.environ.copy()
    env['APP_ID'] = APP_ID
    env['APP_SECRET'] = APP_SECRET
    env['GROUP_OPENID'] = GROUP_OPENID
    env['MESSAGE_TEXT'] = message_text
    env['IMAGE_URL'] = image_url or ''

    try:
        result = subprocess.run(
            [sys.executable, script_path],
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        print(f'[notam_bot] bot_send 退出码: {result.returncode}')
        if result.stdout:
            for line in result.stdout.strip().split('\n'):
                print(f'  [bot] {line}')
        if result.stderr:
            for line in result.stderr.strip().split('\n'):
                print(f'  [bot-err] {line}')

        ok = (result.returncode == 0)
        print(f'[notam_bot] QQ Bot 通知{"发送成功" if ok else "发送失败"}')
    except subprocess.TimeoutExpired:
        print('[notam_bot] bot_send 超时（60s）')
        ok = False
    except Exception as e:
        print(f'[notam_bot] 启动 bot_send 异常: {e}')
        ok = False

    # 6. 清理临时文件
    if temp_png and os.path.exists(temp_png):
        try:
            os.remove(temp_png)
            print(f'[notam_bot] 临时图片已删除: {temp_png}')
        except Exception as e:
            print(f'[notam_bot] 删除临时图片失败: {e}')

    return ok
