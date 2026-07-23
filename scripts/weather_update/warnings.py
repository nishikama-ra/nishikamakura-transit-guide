from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urljoin

from .common import JST, child_text, descendants, fetch_text, local_name, parse_iso

FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml'
NEAR_CODES = ('140010', '140000')
FAR_CODES = ('140000',)


def feed_entries(feed_text: str, product_code: str) -> list[dict[str, str]]:
    root = ET.fromstring(feed_text)
    entries: list[dict[str, str]] = []
    for entry in descendants(root, 'entry'):
        href = ''
        for link in entry:
            if local_name(link.tag) == 'link' and link.attrib.get('href'):
                href = link.attrib['href']
                if product_code in href:
                    break
        if not href or product_code not in href:
            continue
        entries.append({
            'href': urljoin(FEED_URL, href),
            'updated': child_text(entry, 'updated'),
            'content': child_text(entry, 'content'),
        })
    entries.sort(key=lambda item: item['updated'], reverse=True)
    preferred = [item for item in entries if '横浜地方気象台' in item['content']
                 or re.search(r'_140000\.xml(?:$|\?)', item['href'])]
    return preferred or entries


def is_kanagawa(root: ET.Element) -> bool:
    status = next(((node.text or '').strip() for node in descendants(root, 'Status')
                   if (node.text or '').strip()), '')
    if status and status != '通常':
        return False
    offices = ' '.join((node.text or '').strip() for node in descendants(root, 'PublishingOffice'))
    titles = ' '.join((node.text or '').strip() for node in descendants(root, 'Title'))
    codes = {(node.text or '').strip() for node in descendants(root, 'Code')}
    return ('横浜地方気象台' in offices or '神奈川県' in titles
            or bool(codes.intersection({'140000', '140010', '140020'})))


def latest_report(feed_text: str, product_code: str) -> tuple[ET.Element, str]:
    errors: list[str] = []
    for entry in feed_entries(feed_text, product_code)[:30]:
        try:
            root = ET.fromstring(fetch_text(entry['href']))
        except Exception as exc:
            errors.append(str(exc))
            continue
        if is_kanagawa(root):
            return root, entry['href']
    raise RuntimeError(f'{product_code} の神奈川県電文が見つかりません。' + '; '.join(errors[:2]))


def report_datetime(root: ET.Element) -> str:
    return next(((node.text or '').strip() for node in descendants(root, 'ReportDateTime')
                 if (node.text or '').strip()), '')


def direct_area(item: ET.Element) -> tuple[str, str]:
    for child in item:
        if local_name(child.tag) == 'Area':
            return child_text(child, 'Code'), child_text(child, 'Name')
    return '', ''


def parse_duration(value: str) -> timedelta:
    match = re.fullmatch(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?', value or '')
    if not match:
        return timedelta(0)
    days, hours, minutes = (int(part or 0) for part in match.groups())
    return timedelta(days=days, hours=hours, minutes=minutes)


def format_range(start: datetime, end: datetime) -> str:
    display_end, end_hour = end, end.hour
    if end > start and end.hour == 0 and end.minute == 0:
        display_end, end_hour = end - timedelta(days=1), 24
    if display_end.date() == start.date():
        return f'{start.month}/{start.day} {start.hour:02d}時～{end_hour:02d}時'
    return f'{start.month}/{start.day} {start.hour:02d}時～{display_end.month}/{display_end.day} {end_hour:02d}時'


def phenomenon_name(name: str) -> str:
    if '土砂' in name:
        return '土砂災害'
    if '大雨' in name or '雨' in name:
        return '大雨'
    if '雪' in name:
        return '大雪'
    if '風' in name:
        return '暴風・暴風雪'
    if '波' in name:
        return '高波'
    if '潮位' in name:
        return '高潮'
    return name.replace('の警報級の可能性', '')


def extract_items(root: ET.Element, accepted: tuple[str, ...], source: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    codes = {direct_area(item)[0] for item in descendants(root, 'Item')}
    target = next((code for code in accepted if code in codes), '')
    if not target:
        return rows
    for series in descendants(root, 'TimeSeriesInfo'):
        times: dict[str, tuple[str, str]] = {}
        for time_define in descendants(series, 'TimeDefine'):
            times[time_define.attrib.get('timeId', '')] = (
                child_text(time_define, 'DateTime'), child_text(time_define, 'Duration'))
        for item in descendants(series, 'Item'):
            area_code, area_name = direct_area(item)
            if area_code != target:
                continue
            for prop in descendants(item, 'Property'):
                type_name = child_text(prop, 'Type')
                if '警報級の可能性' not in type_name:
                    continue
                for rank in descendants(prop, 'PossibilityRankOfWarning'):
                    level = (rank.text or '').strip()
                    if level not in ('高', '中'):
                        continue
                    start_text, duration_text = times.get(rank.attrib.get('refID', ''), ('', ''))
                    start = parse_iso(start_text)
                    period = ''
                    if start:
                        start = start.astimezone(JST)
                        period = format_range(start, start + parse_duration(duration_text))
                    rows.append({
                        'phenomenon': phenomenon_name(type_name), 'level': level,
                        'period': period, 'areaCode': area_code, 'areaName': area_name,
                        'sourceCode': source,
                    })
    return rows


def deduplicate(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for row in sorted(rows, key=lambda x: (0 if x['level'] == '高' else 1, x['period'], x['phenomenon'])):
        key = (row['phenomenon'], row['level'], row['period'], row['areaCode'])
        if key not in seen:
            seen.add(key)
            result.append(row)
    return result


def build() -> dict[str, Any]:
    feed = fetch_text(FEED_URL)
    near_root, near_url = latest_report(feed, 'VPFD61')
    near_dt = report_datetime(near_root)
    items = extract_items(near_root, NEAR_CODES, 'VPFD61')
    reports: dict[str, Any] = {'VPFD61': {'reportDatetime': near_dt, 'sourceUrl': near_url}}
    report_times = [near_dt]
    try:
        far_root, far_url = latest_report(feed, 'VPFW60')
        far_dt = report_datetime(far_root)
        items.extend(extract_items(far_root, FAR_CODES, 'VPFW60'))
        reports['VPFW60'] = {'reportDatetime': far_dt, 'sourceUrl': far_url}
        report_times.append(far_dt)
    except Exception as exc:
        reports['VPFW60'] = {'status': 'error', 'error': str(exc)}
        print(f'Far-range early warning fetch failed: {exc}')
    return {
        'status': 'ok',
        'reportDatetime': max(value for value in report_times if value),
        'reports': reports,
        'items': deduplicate(items),
    }
