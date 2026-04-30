# Free Power

Created: 2026-05-01

Free Power is a new project workspace.

## Status

Initial project folder created.

## Next Steps

- Run the Home Assistant sizing tool when HA is reachable.
- Confirm GloBird quoted peak, daily supply, and feed-in rates.
- Compare battery options by usable kWh, continuous inverter output, and grid-charge power.
- Refresh the retailer scan before making a signup decision.

## Battery Sizing

The GloBird FOUR4FREE plan has a free usage window from 10:00 AM to 2:00 PM
daily. To avoid usage charges, a battery must cover household load from 2:00 PM
until 10:00 AM the next day, then recharge during the four-hour free window.

Run:

```sh
python3 tools/size_battery_from_ha.py --days 30
```

The script reads `HA_TOKEN` or `~/.openclaw/credentials/homeassistant.json`,
pulls `sensor.shelly_em_channel_1_power` history from Home Assistant, and
outputs the recommended usable battery capacity, nominal capacity, and minimum
grid-charge power.

## Retailer Market Scan

The dashboard includes generated Energy Made Easy / CDR plan data for
residential electricity plans in postcode `2516` on the Endeavour network.

Run:

```sh
python3 tools/fetch_market_scan.py
```

This writes `data/market-scan.json`, converting CDR usage and supply rates to
inc GST and ranking eligible plans against the Shelly EM load profile. Demand
charges, controlled load, exports, and VPP event credits are flagged where they
need bill-grade interval data.
