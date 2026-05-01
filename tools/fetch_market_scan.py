#!/usr/bin/env python3
"""Fetch and model Endeavour residential electricity plans from AER CDR APIs."""

from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "market-scan.json"

POSTCODE = "2516"
NETWORK_MATCH = ("endeavour", "essential energy - endeavour")
GST = 1.1
POOL_DAILY_KWH = 2.2
POOL_ANNUAL_KWH = POOL_DAILY_KWH * 365
BASE_ANNUAL_KWH = 6263.533624812189
USAGE_SCENARIOS = {
    "low": {
        "label": "Low",
        "houseAnnualKwh": BASE_ANNUAL_KWH * 0.85,
        "poolDailyKwh": 1.2,
        "description": "Covered pool, mild weather, most pool heating and flexible load kept inside cheap/free windows.",
    },
    "medium": {
        "label": "Medium",
        "houseAnnualKwh": BASE_ANNUAL_KWH,
        "poolDailyKwh": 2.2,
        "description": "Current HA load shape plus covered pool maintenance to hold 20C.",
    },
    "high": {
        "label": "High",
        "houseAnnualKwh": BASE_ANNUAL_KWH * 1.18,
        "poolDailyKwh": 5.2,
        "description": "Winter HVAC, colder pool conditions, or catch-up heating equivalent to roughly 1C/day at COP 4.",
    },
}

BRANDS = [
    "agl",
    "origin",
    "energyaustralia",
    "redenergy",
    "alintaenergy",
    "nectr",
    "powershop",
    "amber",
    "engie",
    "momentumenergy",
    "dodo",
    "simplyenergy",
    "ovoenergy",
    "globird",
    "sumo",
    "tangoenergy",
    "1stenergy",
    "discoverenergy",
    "koganenergy",
]

HA_PROFILE = {
    "source": "Shelly EM channel 1 Home Assistant history; fallback from previous successful run",
    "samples": 11056,
    "completeDays": 9,
    "avgDailyKwh": 17.160366094005996,
    "annualisedKwh": BASE_ANNUAL_KWH,
    "annualisedKwhWithPool": BASE_ANNUAL_KWH + POOL_ANNUAL_KWH,
    "usageScenarios": {
        key: {
            **scenario,
            "poolAnnualKwh": scenario["poolDailyKwh"] * 365,
            "totalAnnualKwh": scenario["houseAnnualKwh"] + scenario["poolDailyKwh"] * 365,
        }
        for key, scenario in USAGE_SCENARIOS.items()
    },
    "pool": {
        "dimensionsM": "2.7 x 4.7 x 1.4",
        "volumeLitres": 17766,
        "targetTemperatureC": 20,
        "coverAssumption": "500 micron solar bubble blanket or better, fitted whenever not in use",
        "maintenanceKwhPerDay": POOL_DAILY_KWH,
        "maintenanceKwhPerYear": POOL_ANNUAL_KWH,
        "schedulingRule": "Run the pool heat pump in the cheapest available tariff hours, preferring free windows.",
        "catchUpKwhPerDegreeAtCop5": 20.65791 / 5,
        "catchUpKwhPerDegreeAtCop4": 20.65791 / 4,
    },
    "ovo": {
        "freeWindow": "11:00-14:00",
        "freeKwhPerDay": 5.463177505182682,
        "paidKwhPerDay": 11.697188588337314,
        "p95PaidKwh": 16.65752128926649,
    },
    "globird": {
        "freeWindow": "10:00-14:00",
        "freeKwhPerDay": 6.222270324697016,
        "paidKwhPerDay": 10.93809576882298,
        "p95PaidKwh": 15.00029417015903,
    },
    "hourlyFractions": [
        0.038,
        0.035,
        0.032,
        0.031,
        0.034,
        0.041,
        0.051,
        0.055,
        0.058,
        0.060,
        0.063,
        0.066,
        0.067,
        0.067,
        0.057,
        0.050,
        0.052,
        0.058,
        0.060,
        0.057,
        0.050,
        0.044,
        0.039,
        0.035,
    ],
}


@dataclass
class RateWindow:
    label: str
    rate: float
    start_hour: int
    end_hour: int


def get_json(url: str, params: dict[str, Any] | None = None, version: str = "1") -> dict[str, Any]:
    response = requests.get(
        url,
        headers={"x-v": version, "x-min-v": "1", "accept": "application/json"},
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def eligible_for_endeavour(plan: dict[str, Any]) -> bool:
    geography = plan.get("geography") or {}
    distributors = " ".join(geography.get("distributors") or []).lower()
    postcodes = set(geography.get("includedPostcodes") or [])
    return any(token in distributors for token in NETWORK_MATCH) or POSTCODE in postcodes


def fetch_brand_list(brand: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    base = f"https://cdr.energymadeeasy.gov.au/{brand}/cds-au/v1/energy/plans"
    page = 1
    plans: list[dict[str, Any]] = []
    meta: dict[str, Any] = {"brand": brand, "status": "ok", "records": 0}
    while True:
        data = get_json(
            base,
            {
                "type": "MARKET",
                "fuelType": "ELECTRICITY",
                "page": page,
                "page-size": 100,
            },
        )
        batch = data.get("data", {}).get("plans", [])
        plans.extend(batch)
        meta["records"] = data.get("meta", {}).get("totalRecords", len(plans))
        total_pages = data.get("meta", {}).get("totalPages", page)
        if page >= total_pages:
            break
        page += 1
    return plans, meta


def fetch_detail(brand: str, plan_id: str) -> dict[str, Any] | None:
    url = f"https://cdr.energymadeeasy.gov.au/{brand}/cds-au/v1/energy/plans/{plan_id}"
    for version in ("3", "2", "1"):
        try:
            return get_json(url, version=version).get("data")
        except requests.HTTPError:
            continue
    return None


def to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def first_rate(rates: list[dict[str, Any]] | None) -> float | None:
    if not rates:
        return None
    price = to_float(rates[0].get("unitPrice"))
    if price is None:
        return None
    return price * GST


def hour_from_time(value: str | None, fallback: int, *, is_end: bool = False) -> int:
    if not value:
        return fallback
    match = re.match(r"(\d{1,2})(?::(\d{2}))?", value)
    if not match:
        return fallback
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    if is_end and minute:
        hour += 1
    return max(0, min(24, hour))


def extract_rate_windows(contract: dict[str, Any]) -> tuple[list[RateWindow], float | None, list[str]]:
    windows: list[RateWindow] = []
    supply: float | None = None
    warnings: list[str] = []
    for period in contract.get("tariffPeriod") or []:
        daily = to_float(period.get("dailySupplyCharge"))
        if daily is not None and supply is None:
            supply = daily * GST
        block_type = period.get("rateBlockUType")
        if block_type == "timeOfUseRates":
            for item in period.get("timeOfUseRates") or []:
                rate = first_rate(item.get("rates"))
                if rate is None:
                    continue
                spans = item.get("timeOfUse") or []
                if not spans:
                    windows.append(RateWindow(item.get("displayName") or item.get("type") or "TOU", rate, 0, 24))
                for span in spans:
                    start = hour_from_time(span.get("startTime"), 0)
                    end = hour_from_time(span.get("endTime"), 24, is_end=True)
                    windows.append(RateWindow(item.get("displayName") or item.get("type") or "TOU", rate, start, end))
        elif block_type == "singleRate":
            rate = first_rate(period.get("singleRate", {}).get("rates"))
            if rate is not None:
                windows.append(RateWindow("Single rate", rate, 0, 24))
        elif block_type == "demandCharges":
            warnings.append("Demand charge present; interval demand charge not included in estimate.")
        else:
            for key in ("singleRate", "controlledLoadRates"):
                block = period.get(key)
                if isinstance(block, dict):
                    rate = first_rate(block.get("rates"))
                    if rate is not None and key == "singleRate":
                        windows.append(RateWindow("Single rate", rate, 0, 24))
    if not windows:
        warnings.append("Usage rates could not be normalised from CDR tariff blocks.")
    return windows, supply, warnings


def discount_rate(contract: dict[str, Any]) -> tuple[float, list[str]]:
    total = 0.0
    labels: list[str] = []
    for discount in contract.get("discounts") or []:
        method = discount.get("methodUType")
        if method == "percentOfBill":
            rate = to_float((discount.get("percentOfBill") or {}).get("rate"))
            if rate:
                total += rate
                labels.append(f"{discount.get('displayName') or discount.get('category')}: {rate * 100:.0f}%")
    return min(total, 0.4), labels


def solar_fit(contract: dict[str, Any]) -> float | None:
    tariffs = contract.get("solarFeedInTariff") or []
    rates: list[float] = []
    for tariff in tariffs:
        if "singleTariff" in tariff:
            rate = first_rate((tariff.get("singleTariff") or {}).get("rates"))
            if rate is not None:
                rates.append(rate)
        for tou in tariff.get("timeVaryingTariffs") or []:
            rate = first_rate(tou.get("rates"))
            if rate is not None:
                rates.append(rate)
    return max(rates) if rates else None


def free_window_from_windows(windows: list[RateWindow]) -> str | None:
    zero = [window for window in windows if window.rate <= 0.0001]
    if not zero:
        return None
    zero.sort(key=lambda item: (item.start_hour, item.end_hour))
    return ", ".join(f"{item.start_hour:02d}:00-{item.end_hour:02d}:00" for item in zero)


def cost_against_profile(
    windows: list[RateWindow],
    supply: float | None,
    *,
    house_annual_kwh: float,
    pool_daily_kwh: float,
) -> tuple[float | None, float | None, str]:
    if not windows or supply is None:
        return None, None, "partial"
    hourly = HA_PROFILE["hourlyFractions"]
    annual_kwh = house_annual_kwh
    pool_annual_kwh = pool_daily_kwh * 365
    cost = supply * 365
    matched_hours = 0
    for hour, fraction in enumerate(hourly):
        applicable = [
            window.rate
            for window in windows
            if (window.start_hour <= hour < window.end_hour)
            or (window.start_hour > window.end_hour and (hour >= window.start_hour or hour < window.end_hour))
        ]
        if applicable:
            cost += annual_kwh * fraction * min(applicable)
            matched_hours += 1
    if matched_hours < 20:
        fallback_rate = min(window.rate for window in windows)
        pool_cost = pool_annual_kwh * fallback_rate
        cost = supply * 365 + annual_kwh * fallback_rate + pool_cost
        return cost, pool_cost, "partial"
    cheapest_rate = min(window.rate for window in windows)
    pool_cost = pool_annual_kwh * cheapest_rate
    return cost + pool_cost, pool_cost, "profiled_pool_scheduled"


def normalise_plan(summary: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    contract = detail.get("electricityContract") or {}
    windows, supply, warnings = extract_rate_windows(contract)
    scenario_costs: dict[str, dict[str, Any]] = {}
    for key, scenario in USAGE_SCENARIOS.items():
        annual_for_scenario, pool_cost_for_scenario, scenario_quality = cost_against_profile(
            windows,
            supply,
            house_annual_kwh=scenario["houseAnnualKwh"],
            pool_daily_kwh=scenario["poolDailyKwh"],
        )
        scenario_costs[key] = {
            "annualIncGst": annual_for_scenario,
            "poolAnnualCostIncGst": pool_cost_for_scenario,
            "annualAfterDiscountIncGst": None,
            "quality": scenario_quality,
        }
    discount, discount_labels = discount_rate(contract)
    for scenario in scenario_costs.values():
        annual_for_scenario = scenario["annualIncGst"]
        scenario["annualAfterDiscountIncGst"] = (
            annual_for_scenario * (1 - discount) if annual_for_scenario is not None else None
        )
    medium = scenario_costs["medium"]
    free_window = free_window_from_windows(windows)
    rates = sorted({round(window.rate, 4) for window in windows})
    incentives = [item.get("displayName") or item.get("description") for item in contract.get("incentives") or []]
    if contract.get("pricingModel") == "DEMAND":
        warnings.append("Demand tariff model detected; demand component requires bill or interval demand data.")
    return {
        "retailer": detail.get("brandName") or summary.get("brandName") or summary.get("brand"),
        "brand": summary.get("brand"),
        "planId": summary.get("planId"),
        "name": detail.get("displayName") or summary.get("displayName") or summary.get("planId"),
        "customerType": detail.get("customerType") or summary.get("customerType"),
        "pricingModel": contract.get("pricingModel"),
        "effectiveFrom": detail.get("effectiveFrom"),
        "lastUpdated": detail.get("lastUpdated"),
        "dailySupplyIncGst": supply,
        "usageRatesIncGst": rates,
        "freeWindow": free_window,
        "solarFitIncGst": solar_fit(contract),
        "discountRate": discount,
        "discounts": discount_labels,
        "incentives": [item for item in incentives if item],
        "modelledAnnualIncGst": medium["annualIncGst"],
        "modelledAnnualAfterDiscountIncGst": medium["annualAfterDiscountIncGst"],
        "modelledPoolAnnualCostIncGst": medium["poolAnnualCostIncGst"],
        "modelledAnnualKwhWithPool": HA_PROFILE["annualisedKwhWithPool"],
        "scenarioCosts": scenario_costs,
        "modelQuality": medium["quality"],
        "warnings": sorted(set(warnings)),
    }


def rank_key(plan: dict[str, Any]) -> float:
    value = plan.get("modelledAnnualAfterDiscountIncGst")
    return value if isinstance(value, (int, float)) and math.isfinite(value) else 999999


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    plans: list[dict[str, Any]] = []
    provider_status: list[dict[str, Any]] = []
    seen: set[str] = set()
    for brand in BRANDS:
        try:
            summaries, meta = fetch_brand_list(brand)
        except Exception as exc:
            provider_status.append({"brand": brand, "status": "error", "error": str(exc)})
            continue
        eligible = [
            item
            for item in summaries
            if item.get("fuelType") == "ELECTRICITY"
            and (item.get("customerType") in (None, "RESIDENTIAL"))
            and eligible_for_endeavour(item)
        ]
        meta["eligible"] = len(eligible)
        provider_status.append(meta)
        for summary in eligible:
            plan_id = summary.get("planId")
            if not plan_id or plan_id in seen:
                continue
            seen.add(plan_id)
            detail = fetch_detail(summary.get("brand") or brand, plan_id)
            if not detail:
                continue
            if detail.get("customerType") not in (None, "RESIDENTIAL"):
                continue
            plans.append(normalise_plan(summary, detail))

    ranked = sorted(plans, key=rank_key)
    for idx, plan in enumerate(ranked, start=1):
        plan["rank"] = idx if rank_key(plan) < 999999 else None

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "postcode": POSTCODE,
        "network": "Endeavour Energy",
        "gstMultiplierApplied": GST,
        "modelBasis": HA_PROFILE,
        "providerStatus": provider_status,
        "planCount": len(ranked),
        "retailerCount": len({plan.get("retailer") for plan in ranked}),
        "plans": ranked,
        "notes": [
            "CDR plan rates are converted to inc GST with a 1.10 multiplier where rates are supplied ex GST.",
            "Costs use the Shelly EM daily load shape and annualise the successful HA sample window.",
            "Pool maintenance load is included as 2.2 kWh/day and scheduled into each plan's cheapest available tariff hours.",
            "Demand charges, controlled-load-specific usage, exports and VPP event credits require bill-grade interval data and are flagged where detected.",
            "Eligibility must be confirmed at signup because retailers can restrict meter types and tariffs.",
        ],
    }
    OUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} with {len(ranked)} eligible plans from {output['retailerCount']} retailers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
