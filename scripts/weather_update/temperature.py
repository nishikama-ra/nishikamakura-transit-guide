from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from .common import JST, NOW, fetch_json, finite_number, parse_iso

FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/140000.json'
AREA_CODE = '46106'
AREA_NAME = '横浜'


def load_previous_days(previous: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw = previous.get('temperatureForecasts', {}).get('days', {})
    if not isinstance(raw, dict):
        return {}
    keep_until = NOW.date() + timedelta(days=8)
    kept: dict[str, dict[str, Any]] = {}
    for date_key, values in raw.items():
        if not isinstance(values, dict):
            continue
        try:
            day = datetime.strptime(date_key, '%Y-%m-%d').date()
        except ValueError:
            continue
        if not NOW.date() <= day <= keep_until:
            continue
        item: dict[str, Any] = {'source': '気象庁', 'areaName': values.get('areaName') or AREA_NAME}
        for field in ('max', 'min'):
            number = finite_number(values.get(field))
            if number is None:
                continue
            item[field] = number
            report_field = f'{field}ReportDatetime'
            if values.get(report_field):
                item[report_field] = values[report_field]
        if 'max' in item or 'min' in item:
            kept[date_key] = item
    return kept


def set_value(days: dict[str, dict[str, Any]], date_key: str, field: str, value: Any,
              report_datetime: str, overwrite: bool) -> None:
    number = finite_number(value)
    if number is None or not date_key:
        return
    item = days.setdefault(date_key, {'source': '気象庁', 'areaName': AREA_NAME})
    if not overwrite and finite_number(item.get(field)) is not None:
        return
    item[field] = number
    if report_datetime:
        item[f'{field}ReportDatetime'] = report_datetime
    item['source'] = '気象庁'
    item['areaName'] = AREA_NAME


def extract_json(data: Any) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    if not isinstance(data, list) or not data:
        return result

    short = data[0] if isinstance(data[0], dict) else {}
    short_report = str(short.get('reportDatetime', ''))
    report_dt = parse_iso(short_report)
    if report_dt:
        report_dt = report_dt.astimezone(JST)

    for series in short.get('timeSeries', []):
        times = series.get('timeDefines', [])
        for area in series.get('areas', []):
            if str(area.get('area', {}).get('code', '')) != AREA_CODE:
                continue
            values = area.get('temps')
            if not isinstance(values, list):
                continue
            for time_value, raw in zip(times, values):
                dt = parse_iso(time_value)
                if not dt:
                    continue
                dt = dt.astimezone(JST)
                if dt.hour == 9:
                    field = 'max'
                elif dt.hour == 0:
                    # 05時・11時発表では、発表時刻より前の当日0時欄に
                    # 当日の最高気温が重複して入ることがあるため除外する。
                    if report_dt and dt < report_dt:
                        continue
                    field = 'min'
                else:
                    continue
                set_value(result, dt.date().isoformat(), field, raw, short_report, True)

    if len(data) > 1 and isinstance(data[1], dict):
        weekly = data[1]
        weekly_report = str(weekly.get('reportDatetime', ''))
        for series in weekly.get('timeSeries', []):
            times = series.get('timeDefines', [])
            for area in series.get('areas', []):
                if str(area.get('area', {}).get('code', '')) != AREA_CODE:
                    continue
                for field, source in (('max', 'tempsMax'), ('min', 'tempsMin')):
                    values = area.get(source)
                    if not isinstance(values, list):
                        continue
                    for time_value, raw in zip(times, values):
                        dt = parse_iso(time_value)
                        if dt:
                            set_value(result, dt.astimezone(JST).date().isoformat(), field,
                                      raw, weekly_report, False)
    return result


def merge(base: dict[str, dict[str, Any]], incoming: dict[str, dict[str, Any]], overwrite: bool) -> None:
    for date_key, values in incoming.items():
        for field in ('max', 'min'):
            set_value(base, date_key, field, values.get(field),
                      str(values.get(f'{field}ReportDatetime', '')), overwrite)


def validate_today(days: dict[str, dict[str, Any]], previous: dict[str, dict[str, Any]]) -> None:
    key = NOW.date().isoformat()
    current = days.get(key)
    prior = previous.get(key)
    if not isinstance(current, dict) or not isinstance(prior, dict):
        return
    maximum = finite_number(current.get('max'))
    minimum = finite_number(current.get('min'))
    prior_minimum = finite_number(prior.get('min'))
    same_report = current.get('minReportDatetime') == current.get('maxReportDatetime')
    if (maximum is not None and minimum is not None and minimum >= maximum and same_report
            and prior_minimum is not None and prior_minimum < maximum):
        current['min'] = prior_minimum
        if prior.get('minReportDatetime'):
            current['minReportDatetime'] = prior['minReportDatetime']


def build(previous_document: dict[str, Any]) -> dict[str, Any]:
    previous_days = load_previous_days(previous_document)
    days = json.loads(json.dumps(previous_days))
    error = ''
    try:
        merge(days, extract_json(fetch_json(FORECAST_URL)), True)
    except Exception as exc:
        error = str(exc)
        print(f'Temperature forecast fetch failed: {exc}')

    validate_today(days, previous_days)
    keep_until = NOW.date() + timedelta(days=8)
    days = {
        key: values for key, values in sorted(days.items())
        if NOW.date() <= datetime.strptime(key, '%Y-%m-%d').date() <= keep_until
    }
    reports = [
        str(values.get(field)) for values in days.values()
        for field in ('maxReportDatetime', 'minReportDatetime') if values.get(field)
    ]
    section: dict[str, Any] = {
        'status': 'ok' if days else 'error',
        'updatedAt': max(reports) if reports else '',
        'areaCode': AREA_CODE,
        'areaName': AREA_NAME,
        'source': '気象庁',
        'days': days,
    }
    if error:
        section['error'] = error
    return section
