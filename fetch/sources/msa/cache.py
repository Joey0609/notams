"""MSA 增量游标：抓取只暂存，visits 更新成功后才提交。"""
import json
import os
from pathlib import Path
from .log import log

_pending = None


def reset_pending():
    global _pending
    _pending = None


def load_cache(path):
    target = Path(path)
    log('缓存读取', f'读取 {target}')
    if not target.exists():
        log('缓存读取', '文件不存在，将按日期回看并恢复旧快照有效公告')
        return {'latest': {}, 'details': []}
    value = json.loads(target.read_text(encoding='utf-8'))
    if value.get('version') != 1 or not isinstance(value.get('latest'), dict) or not isinstance(value.get('details'), list):
        raise ValueError('MSA 缓存结构无效，不能可靠执行增量抓取')
    log('缓存读取', f"已恢复 {len(value['latest'])} 个栏目游标、{len(value['details'])} 篇正文，已提交 HASH: {value.get('HASH') or '无（旧版缓存）'}")
    return value


def stage_cache(path, latest, details):
    global _pending
    _pending = (Path(path), {'version': 1, 'latest': latest, 'details': details})
    log('缓存暂存', f'{len(latest)} 个栏目游标、{len(details)} 篇正文；尚未写入 {path}，等待全量 HASH 变化与 visits 更新，或补交上轮失败检查点')


def pending_available():
    return _pending is not None


def needs_retry(expected_hash):
    """快照已授权的缓存提交未完成时，允许下轮补交，不依赖再次变化。"""
    if not expected_hash or _pending is None:
        log('缓存检查', '无待提交数据或无快照检查点，本轮不补交缓存')
        return False
    path, _ = _pending
    current_hash = load_cache(path).get('HASH')
    retry = current_hash != expected_hash
    log('缓存检查', f"快照检查点 {expected_hash}，缓存 HASH {current_hash or '无'}，{'需要补交' if retry else '已同步，不重复写入'}")
    return retry


def commit_pending(expected_hash=None):
    global _pending
    if _pending is None:
        log('缓存提交', '无本轮待提交数据，不写入缓存')
        return False
    path, value = _pending
    if expected_hash:
        value = dict(value, HASH=expected_hash)
    log('缓存提交', f"开始原子写入 {path}，检查点 {expected_hash or '未指定'}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, path)
    log('缓存提交', f"写入成功：{len(value['latest'])} 个栏目游标、{len(value['details'])} 篇正文")
    _pending = None
    return True
