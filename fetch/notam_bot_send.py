"""
botpy 独立发送脚本：启动 WebSocket 连接，发送图片+文本，然后退出。
由 notam_bot.py 以子进程方式调用。
环境变量：
  APP_ID, APP_SECRET, IMAGE_URL, MESSAGE_TEXT, GROUP_OPENID
"""
import asyncio
import os
import sys

import botpy
from botpy import logging

_log = logging.get_logger()

APP_ID = os.getenv('APP_ID', '').strip()
APP_SECRET = os.getenv('APP_SECRET', '').strip()
IMAGE_URL = os.getenv('IMAGE_URL', '').strip()
MESSAGE_TEXT = os.getenv('MESSAGE_TEXT', '').strip()
GROUP_OPENID = os.getenv('GROUP_OPENID', '1E03FF7A6A726FCB9F81C2E0419F53E9').strip()


class SenderClient(botpy.Client):
    async def on_ready(self):
        _log.info('机器人已就绪，准备发送消息...')
        asyncio.create_task(self._send_and_exit())

    async def _send_and_exit(self):
        try:
            # 1. 上传图片到 QQ 服务器
            _log.info('上传图片到 QQ 服务器...')
            upload_media = await self.api.post_group_file(
                group_openid=GROUP_OPENID,
                file_type=1,
                url=IMAGE_URL,
                srv_send_msg=False,
            )
            _log.info('图片上传成功')

            # 2. 发送一条消息：文字在前，图片在后
            result = await self.api.post_group_message(
                group_openid=GROUP_OPENID,
                msg_type=7,
                content=MESSAGE_TEXT,
                media=upload_media,
            )
            _log.info('图文消息发送成功')
        except Exception as e:
            _log.error(f'发送失败: {e}')
        finally:
            os._exit(0)


def main():
    if not APP_ID or not APP_SECRET:
        print('错误: 请设置环境变量 APP_ID 和 APP_SECRET')
        sys.exit(1)
    if not IMAGE_URL:
        print('错误: 请设置环境变量 IMAGE_URL')
        sys.exit(1)
    if not MESSAGE_TEXT:
        print('错误: 请设置环境变量 MESSAGE_TEXT')
        sys.exit(1)

    intents = botpy.Intents(guilds=True)
    client = SenderClient(intents=intents)
    client.run(appid=APP_ID, secret=APP_SECRET)


if __name__ == '__main__':
    main()
