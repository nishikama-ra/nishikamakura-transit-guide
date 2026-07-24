from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from typing import Any

from .common import JST, NOW, fetch_text

PREFECTURE_CODE = '14'
PREFECTURE_NAME = '神奈川県'
ALERT_PAGE_URL = 'https://www.wbgt.env.go.jp/alert.php'
ALERT_URL = 'https://www.wbgt.env.go.jp/alert/dl/{year}/alert_{stamp}_{hour}.csv'
VALID_FLAGS = {'0', '1', '2', '3', '9'}


def parse_date(value: str | None) -> date | None:
    text = (value or '').strip()
    for pattern in ('%Y/%m/%d', '%Y-%m-%d'):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def parse_report_datetime(metadata: dict[str, str], fallback_date: date, fallback_hour: str) -> datetime:
    report_date = parse_date(metadata.get('ReportDate')) or fallback_date
    report_time = metadata.get('ReportTime', '').strip() or f'{fallback_hour}:00:00'
    try:
        parsed_time = datetime.strptime(report_time, '%H:%M:%S').time()
    except ValueError:
        try:
            parsed_time = datetime.strptime(report_time, '%H:%M').time()
        except ValueError:
            parsed_time = datetime.strptime(f'{fallback_hour}:00', '%H:%M').time()
    return datetime.combine(report_date, parsed_time, tzinfo=JST)


def parse_file(text: str, source_url: str, fallback_date: date, fallback_hour: str) -> dict[str, Any]:
    rows = list(csv.reader(io.StringIO(text)))
    metadata: dict[str, str] = {}
    for row in rows:
        if len(row) >= 2:
            key = row[0].strip()
            if key:
                metadata[key] = row[1].strip()

    status = metadata.get('Status', '').strip()
    if status and status != '通常':
        raise ValueError(f'運用種別が通常ではありません: {status}')

    flags = [0, 0]
    found = False
    rank = {0: 0, 9: 0, 2: 1, 1: 2, 3: 3}
    for row in rows:
        if len(row) < 8:
            continue
        prefecture_name = row[4].strip()
        prefecture_code = row[5].strip().zfill(2)
        if prefecture_code != PREFECTURE_CODE and prefecture_name not in {PREFECTURE_NAME, '神奈川'}:
            continue
        found = True
        for target_index, column_index in enumerate((6, 7)):
            raw = row[column_index].strip()
            if raw not in VALID_FLAGS:
                continue
            value = int(raw)
            if rank[value] > rank[flags[target_index]]:
                flags[target_index] = value

    if not found:
        raise ValueError('神奈川県の行がありません')

    return {
        'sourceUrl': source_url,
        'reportDatetime': parse_report_datetime(metadata, fallback_date, fallback_hour),
        'targetDates': [parse_date(metadata.get('TargetDate1')), parse_date(metadata.get('TargetDate2'))],
        'flags': flags,
    }


def fetch_file(report_date: date, report_hour: str) -> dict[str, Any] | None:
    source_url = ALERT_URL.format(
        year=report_date.year,
        stamp=report_date.strftime('%Y%m%d'),
        hour=report_hour,
    )
    try:
        text = fetch_text(source_url)
        return parse_file(text, source_url, report_date, report_hour)
    except Exception as exc:
        print(f'Heat alert file unavailable: {source_url}: {exc}')
        return None


def alert_item(record: dict[str, Any], target_index: int, target_date: date, label: str) -> dict[str, Any] | None:
    record_target = record['targetDates'][target_index]
    if record_target and record_target != target_date:
        return None
    flag = int(record['flags'][target_index])
    if flag not in (1, 3):
        return None
    return {
        'label': label,
        'date': target_date.isoformat(),
        'level': 'special' if flag == 3 else 'warning',
        'flag': flag,
        'areaName': PREFECTURE_NAME,
        'reportDatetime': record['reportDatetime'].isoformat(timespec='minutes'),
        'sourceUrl': record['sourceUrl'],
    }


def build() -> dict[str, Any]:
    today = NOW.date()
    if not 4 <= today.month <= 10:
        return {
            'status': 'off-season',
            'updatedAt': NOW.isoformat(timespec='minutes'),
            'sourcePage': ALERT_PAGE_URL,
            'days': [],
        }

    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    loaded = 0
    days: list[dict[str, Any]] = []

    current_record = fetch_file(today, '05')
    current_index = 0
    if current_record is None:
        current_record = fetch_file(yesterday, '17')
        current_index = 1
    if current_record is not None:
        loaded += 1
        item = alert_item(current_record, current_index, today, '今日')
        if item:
            days.append(item)

    next_record = fetch_file(today, '17')
    if next_record is None:
        next_record = fetch_file(today, '14')
    if next_record is not None:
        loaded += 1
        item = alert_item(next_record, 1, tomorrow, '明日')
        if item:
            days.append(item)

    return {
        'status': 'ok' if loaded else 'error',
        'updatedAt': NOW.isoformat(timespec='minutes'),
        'sourcePage': ALERT_PAGE_URL,
        'days': days,
    }
