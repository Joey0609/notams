"""MSA 增量游标：抓取只暂存，visits 更新成功后才提交。"""
import json
import os
from pathlib import Path

_pending = None


def reset_pending():
    global _pending
    _pending = None


def load_cache(path):
    target = Path(path)
    if not target.exists():
        return {'latest': {}, 'details': []}
    value = json.loads(target.read_text(encoding='utf-8'))
    if value.get('version') != 1 or not isinstance(value.get('latest'), dict) or not isinstance(value.get('details'), list):
        raise ValueError('MSA 缓存结构无效，不能可靠执行增量抓取')
    return value


def stage_cache(path, latest, details):
    global _pending
    _pending = (Path(path), {'version': 1, 'latest': latest, 'details': details})


def pending_available():
    return _pending is not None


def needs_retry(expected_hash):
    """快照已授权的缓存提交未完成时，允许下轮补交，不依赖再次变化。"""
    if not expected_hash or _pending is None:
        return False
    path, _ = _pending
    return load_cache(path).get('HASH') != expected_hash


def commit_pending(expected_hash=None):
    global _pending
    if _pending is None:
        return False
    path, value = _pending
    if expected_hash:
        value = dict(value, HASH=expected_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, path)
    _pending = None
    return True
