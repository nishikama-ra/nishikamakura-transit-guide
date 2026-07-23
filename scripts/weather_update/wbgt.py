from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from typing import Any

from .common import JST, NOW, fetch_text, finite_number

POINT = '46141'
FORECAST_URL = f'https://www.wbgt.env.go.jp/prev15WG/dl/yohou_{POINT}.csv'
OBSERVED_URL = f'https://www.wbgt.env.go.jp/est15WG/dl/wbgt_{POINT}_{NOW:%Y%m}.csv'


def parse_forecast(text: str) -> tuple[dict[str, float], str]:
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2:
        return {}, ''
    header = rows[0]
    station = next((row for row in rows[1:] if row and row[0].strip() == POINT), rows[1])
    created_at = station[1].strip() if len(station) > 1 else ''
    maxima: dict[str, float] = {}
    for stamp, raw in zip(header[2:], station[2:]):
        digits = ''.join(ch for ch in stamp if ch.isdigit())
        if len(digits) < 10:
            continue
        try:
            dt = datetime.strptime(digits[:10], '%Y%m%d%H').replace(tzinfo=JST)
        except ValueError:
            continue
        value = finite_number(raw, 10.0)
        if value is None:
            continue
        key = dt.date().isoformat()
        maxima[key] = max(value, maxima.get(key, value))
    return maxima, created_at


def parse_observed(text: str) -> tuple[float | None, str]:
    rows = list(csv.reader(io.StringIO(text)))
    header_index = next((i for i, row in enumerate(rows)
                         if len(row) >= 3 and row[0].strip().lower() == 'date'
                         and row[1].strip().lower() == 'time'), None)
    if header_index is None:
        return None, ''
    header = rows[header_index]
    try:
        value_index = next(i for i, cell in enumerate(header) if cell.strip() == POINT)
    except StopIteration:
        value_index = 2
    maximum: float | None = None
    latest: datetime | None = None
    for row in rows[header_index + 1:]:
        if len(row) <= value_index:
            continue
        try:
            day = datetime.strptime(row[0].strip(), '%Y/%m/%d').date()
            hour_text, minute_text = row[1].strip().split(':', 1)
            hour, minute = int(hour_text), int(minute_text)
        except (TypeError, ValueError):
            continue
        if day != NOW.date():
            continue
        if hour == 24 and minute == 0:
            observed_at = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=JST)
        elif 0 <= hour <= 23 and 0 <= minute <= 59:
            observed_at = datetime(day.year, day.month, day.day, hour, minute, tzinfo=JST)
        else:
            continue
        value = finite_number(row[value_index])
        if value is None:
            continue
        maximum = value if maximum is None else max(maximum, value)
        latest = observed_at if latest is None or observed_at > latest else latest
    return maximum, latest.isoformat(timespec='minutes') if latest else ''


def build() -> dict[str, Any]:
    forecast, created_at = parse_forecast(fetch_text(FORECAST_URL))
    observed, observed_through = parse_observed(fetch_text(OBSERVED_URL))
    days: list[dict[str, Any]] = []
    for offset, label in enumerate(('今日', '明日', '明後日')):
        key = (NOW.date() + timedelta(days=offset)).isoformat()
        forecast_max = forecast.get(key)
        candidates = [forecast_max] + ([observed] if offset == 0 else [])
        valid = [value for value in candidates if value is not None]
        if not valid:
            continue
        item: dict[str, Any] = {
            'label': label,
            'date': key,
            'max': max(valid),
            'forecastMax': forecast_max,
            'valueType': 'observed-or-forecast-maximum' if offset == 0 else 'forecast-maximum',
        }
        if offset == 0:
            item['observedMax'] = observed
            item['observedThrough'] = observed_through
        days.append(item)
    return {
        'status': 'ok' if days else 'error',
        'updatedAt': NOW.isoformat(timespec='minutes'),
        'forecastCreatedAt': created_at,
        'days': days,
    }
