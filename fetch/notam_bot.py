"""
NOTAM QQ Bot 通知模块。
职责：接收邮件草稿 payload，提取图片与摘要，上传图床，
      将图文消息通过 HTTP POST 发送到外部 QQbotServer 代为发送。
      （避免 GitHub Actions IP 不在 QQ 机器人白名单的问题）
"""
import json
import os
from datetime import datetime

import requests

from fetch.image_hosting import upload_image

# ── 配置 ──────────────────────────────────────────────────────
QQ_BOT_SERVER_IP = os.getenv('QQ_BOT_SERVER_IP', '0.0.0.0').strip()
QQ_BOT_SERVER_PORT = os.getenv('QQ_BOT_SERVER_PORT', '2001').strip()
QQBOT_ENABLED = bool(QQ_BOT_SERVER_IP) and QQ_BOT_SERVER_IP != '0.0.0.0'


def _build_message_text(email_draft: dict) -> str:
    """从邮件 body_text 中提取航警信息，去掉历史匹配结果行"""
    text = email_draft.get('body_text', '')
    if not text:
        return 'NOTAM更新：无详细数据。'
    lines = text.split('\n')
    filtered = []
    skip = False
    for line in lines:
        if line.strip().startswith('历史匹配结果'):
            skip = True
            continue
        if skip and (line.strip().startswith('- 重叠') or line.startswith('  -')):
            continue
        skip = False
        # QQ 消息中去掉坐标行
        if '航警坐标' in line:
            continue
        filtered.append(line)
    return '\n'.join(filtered)


def send_notification(email_draft: dict) -> bool:
    """
    主入口：根据邮件草稿发送 QQ Bot 通知。
    流程：存临时图片 → 图床上传 → HTTP POST → 删除临时文件。
    """
    if not QQBOT_ENABLED:
        print('[notam_bot] QQBOT_ENABLED=false，跳过')
        return False
    if not QQ_BOT_SERVER_IP:
        print('[notam_bot] QQ_BOT_SERVER_IP 未配置，跳过')
        return False

    # 1. 提取图片
    image_bytes = None
    inline_images = email_draft.get('inline_images', []) or []
    if inline_images:
        image_bytes = inline_images[0].get('data')
    if not image_bytes:
        print('[notam_bot] 邮件草稿中无图片，仅发送文本')

    # 2. 存临时文件
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

    # 5. HTTP POST 到外部 QQbotServer
    server_url = f'http://{QQ_BOT_SERVER_IP}:{QQ_BOT_SERVER_PORT}/send_notification'
    payload = {
        'text': message_text,
        'image_url': image_url or '',
    }
    print(f'[notam_bot] 转发消息到 QQbotServer: {server_url}')
    print(f'[notam_bot] 消息长度: text={len(message_text)}, image_url={bool(image_url)}')

    try:
        resp = requests.post(server_url, json=payload, timeout=120)
        result = resp.json()
        if resp.status_code == 200 and result.get('success'):
            print(f'[notam_bot] QQ Bot 通知发送成功: {result.get("message")}')
            ok = True
        else:
            print(f'[notam_bot] QQ Bot 通知发送失败: HTTP {resp.status_code}, {result.get("message")}')
            ok = False
    except requests.ConnectionError:
        print(f'[notam_bot] 无法连接到 QQbotServer ({server_url})，请检查服务器是否已启动')
        ok = False
    except requests.Timeout:
        print('[notam_bot] 请求 QQbotServer 超时（120s）')
        ok = False
    except Exception as e:
        print(f'[notam_bot] 请求 QQbotServer 异常: {e}')
        ok = False

    # 6. 清理临时文件
    if temp_png and os.path.exists(temp_png):
        try:
            os.remove(temp_png)
            print(f'[notam_bot] 临时图片已删除: {temp_png}')
        except Exception as e:
            print(f'[notam_bot] 删除临时图片失败: {e}')

    return ok


def send_two_notifications(added_draft: dict, full_draft: dict) -> bool:
    """
    发送两条 QQ 消息：
      第一条：新增航警（图片仅新增 + 文字仅新增）
      第二条：全部航警（图片全部 + 文字全部）
    两条之间间隔 3 秒。
    """
    # 第一条：新增航警
    print('[notam_bot] === 发送第一条消息：新增航警 ===')
    ok1 = send_notification(added_draft)
    if not ok1:
        print('[notam_bot] 第一条消息发送失败，继续尝试第二条')

    import time
    time.sleep(3)

    # 第二条：全部航警
    print('[notam_bot] === 发送第二条消息：全部航警 ===')
    ok2 = send_notification(full_draft)

    return ok1 and ok2
