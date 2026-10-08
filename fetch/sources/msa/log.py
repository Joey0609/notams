"""统一使用 print，沿用主流程日志捕获；不输出凭据或整篇正文。"""
from threading import Lock

_lock = Lock()


def log(stage, message):
    text = str(message).replace('\r', ' ').replace('\n', ' ')
    with _lock:
        print(f'[MSA][{stage}] {text}', flush=True)
