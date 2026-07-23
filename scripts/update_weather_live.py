from __future__ import annotations

import json
from typing import Any

from weather_update import temperature, warnings, wbgt
from weather_update.common import DATA_PATH, NOW, read_previous


def make_error(message: str, include_time: bool = True) -> dict[str, Any]:
    result: dict[str, Any] = {'status': 'error', 'error': message}
    if include_time:
        result['updatedAt'] = NOW.isoformat(timespec='minutes')
    return result


def main() -> None:
    previous = read_previous()
    temperature_section = temperature.build(previous)

    try:
        wbgt_section = wbgt.build()
    except Exception as exc:
        print(f'WBGT fetch failed: {exc}')
        wbgt_section = make_error(str(exc))
        wbgt_section['days'] = []

    try:
        warning_section = warnings.build()
    except Exception as exc:
        print(f'Early warning fetch failed: {exc}')
        warning_section = make_error(str(exc), include_time=False)
        warning_section['reportDatetime'] = ''
        warning_section['reports'] = {}
        warning_section['items'] = []

    result = {
        'updatedAt': NOW.isoformat(timespec='minutes'),
        'temperatureForecasts': temperature_section,
        'wbgt': wbgt_section,
        'earlyWarnings': warning_section,
    }
    DATA_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
