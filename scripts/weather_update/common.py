from __future__ import annotations

import json
import math
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

JST = timezone(timedelta(hours=9))
NOW = datetime.now(JST)
DATA_PATH = Path('content/weather-live.json')


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'nishikamakura-transit-guide/1.0',
            'Cache-Control': 'no-cache',
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8-sig', errors='replace')


def fetch_json(url: str) -> Any:
    return json.loads(fetch_text(url))


def parse_iso(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value or '')
    except (TypeError, ValueError):
        return None


def finite_number(value: Any, divisor: float = 1.0) -> float | None:
    try:
        number = float(value) / divisor
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return number if math.isfinite(number) else None


def local_name(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def child_text(parent: ET.Element | None, name: str) -> str:
    if parent is None:
        return ''
    for child in parent:
        if local_name(child.tag) == name:
            return (child.text or '').strip()
    return ''


def descendants(parent: ET.Element, name: str) -> list[ET.Element]:
    return [node for node in parent.iter() if local_name(node.tag) == name]


def read_previous() -> dict[str, Any]:
    try:
        data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}
