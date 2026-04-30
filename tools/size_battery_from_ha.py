#!/usr/bin/env python3
"""Size a battery for GloBird FOUR4FREE using Home Assistant history.

The plan has free grid energy from 10:00 to 14:00 local time. To avoid usage
charges, the battery must be able to carry the house from 14:00 until 10:00
the next day, then recharge inside the four-hour free window.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests


DEFAULT_ENTITY = "sensor.shelly_em_channel_1_power"
DEFAULT_HA_URL = "http://100.97.49.102:8123"
DEFAULT_TZ = "Australia/Sydney"


def load_token() -> str:
    token = os.environ.get("HA_TOKEN")
    if token:
        return token

    credentials = Path.home() / ".openclaw" / "credentials" / "homeassistant.json"
    if credentials.exists():
        data = json.loads(credentials.read_text())
        token = data.get("token") or data.get("access_token")
        if token:
            return token

    raise SystemExit("HA_TOKEN is not set and no Home Assistant token was found.")


def parse_ha_time(value: str, tz: ZoneInfo) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(tz)


def is_free_window(ts: datetime) -> bool:
    return 10 <= ts.hour < 14


def split_at_boundaries(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    boundaries = [start, end]
    day = start.date()
    while day <= end.date():
        for hour in (10, 14):
            boundary = start.replace(
                year=day.year,
                month=day.month,
                day=day.day,
                hour=hour,
                minute=0,
                second=0,
                microsecond=0,
            )
            if start < boundary < end:
                boundaries.append(boundary)
        day += timedelta(days=1)

    boundaries = sorted(set(boundaries))
    return list(zip(boundaries, boundaries[1:]))


def fetch_history(
    ha_url: str,
    token: str,
    entity_id: str,
    start: datetime,
    end: datetime,
    timeout_seconds: int,
) -> list[dict]:
    try:
        response = requests.get(
            f"{ha_url.rstrip('/')}/api/history/period/{start.isoformat()}",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "filter_entity_id": entity_id,
                "end_time": end.isoformat(),
                "minimal_response": "true",
            },
            timeout=timeout_seconds,
        )
    except requests.RequestException as exc:
        raise SystemExit(f"Could not reach Home Assistant at {ha_url}: {exc}") from exc

    response.raise_for_status()
    payload = response.json()
    return payload[0] if payload else []


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    index = (len(values) - 1) * pct
    lower = int(index)
    upper = min(lower + 1, len(values) - 1)
    weight = index - lower
    return values[lower] * (1 - weight) + values[upper] * weight


def analyse(samples: list[dict], tz: ZoneInfo, max_gap_minutes: int) -> dict:
    points: list[tuple[datetime, float]] = []
    for item in samples:
        try:
            watts = float(item["state"])
        except (KeyError, TypeError, ValueError):
            continue
        if watts < 0:
            continue
        ts = parse_ha_time(item["last_changed"], tz)
        points.append((ts, watts))

    points.sort(key=lambda row: row[0])
    by_day = defaultdict(lambda: {"free_kwh": 0.0, "paid_kwh": 0.0, "peak_kw": 0.0})
    total_free = 0.0
    total_paid = 0.0
    peak_kw = 0.0
    max_gap = timedelta(minutes=max_gap_minutes)

    for (start, watts), (end, _) in zip(points, points[1:]):
        if end <= start or end - start > max_gap:
            continue

        for seg_start, seg_end in split_at_boundaries(start, end):
            kwh = watts / 1000.0 * ((seg_end - seg_start).total_seconds() / 3600.0)
            day = seg_start.date().isoformat()
            if is_free_window(seg_start):
                by_day[day]["free_kwh"] += kwh
                total_free += kwh
            else:
                by_day[day]["paid_kwh"] += kwh
                total_paid += kwh
                by_day[day]["peak_kw"] = max(by_day[day]["peak_kw"], watts / 1000.0)
                peak_kw = max(peak_kw, watts / 1000.0)

    completeish = [
        values
        for values in by_day.values()
        if values["free_kwh"] > 0 and values["paid_kwh"] > 0
    ]
    paid_days = [values["paid_kwh"] for values in completeish]

    return {
        "sample_count": len(points),
        "days": len(completeish),
        "total_free_window_kwh": total_free,
        "total_paid_window_kwh": total_paid,
        "avg_paid_window_kwh": statistics.mean(paid_days) if paid_days else 0.0,
        "p90_paid_window_kwh": percentile(paid_days, 0.90),
        "p95_paid_window_kwh": percentile(paid_days, 0.95),
        "max_paid_window_kwh": max(paid_days) if paid_days else 0.0,
        "peak_paid_window_kw": peak_kw,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ha-url", default=os.environ.get("HA_URL", DEFAULT_HA_URL))
    parser.add_argument("--entity", default=DEFAULT_ENTITY)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--timezone", default=DEFAULT_TZ)
    parser.add_argument("--round-trip-efficiency", type=float, default=0.90)
    parser.add_argument("--reserve-fraction", type=float, default=0.10)
    parser.add_argument("--max-gap-minutes", type=int, default=20)
    parser.add_argument("--timeout-seconds", type=int, default=10)
    args = parser.parse_args()

    tz = ZoneInfo(args.timezone)
    end = datetime.now(tz)
    start = end - timedelta(days=args.days)
    samples = fetch_history(
        args.ha_url,
        load_token(),
        args.entity,
        start,
        end,
        args.timeout_seconds,
    )
    result = analyse(samples, tz, args.max_gap_minutes)

    usable_kwh = result["p95_paid_window_kwh"]
    nominal_kwh = usable_kwh / (1 - args.reserve_fraction) if usable_kwh else 0.0
    free_window_charge_kwh = usable_kwh / args.round_trip_efficiency if usable_kwh else 0.0
    charge_kw = free_window_charge_kwh / 4.0 if usable_kwh else 0.0

    result.update(
        {
            "recommended_usable_battery_kwh": usable_kwh,
            "recommended_nominal_battery_kwh": nominal_kwh,
            "minimum_charge_power_kw": charge_kw,
            "assumptions": {
                "free_window": "10:00-14:00",
                "round_trip_efficiency": args.round_trip_efficiency,
                "reserve_fraction": args.reserve_fraction,
                "sizing_basis": "95th percentile paid-window daily kWh",
            },
        }
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
