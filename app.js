const plans = [
  { name: "GloBird BOOST", annual: 2507, note: "Lowest quoted annual estimate", color: "#16805a" },
  { name: "OVO Free 3", annual: 2772, note: "Your current quote", color: "#285f9e" },
  { name: "GloBird EASYEV", annual: 2820, note: "EV-oriented quote", color: "#6d7780" },
  { name: "GloBird FOUR4FREE discounted", annual: 2877, note: "Lowest possible with listed discounts", color: "#b8872d" },
  { name: "GloBird FOUR4FREE", annual: 2966, note: "Before conditional discounts", color: "#b44d42" },
  { name: "GloBird ZEROHERO with VPP", annual: 2965, note: "Assumes $292 annual credit", color: "#7b5aa6" },
  { name: "GloBird ZEROHERO no VPP", annual: 3257, note: "No conditional VPP credits", color: "#2b3338" },
];

const batteryScenarios = [
  { name: "GloBird p95 paid-window day", usable: 15.00029417015903 },
  { name: "OVO p95 paid-window day", usable: 16.65752128926649 },
  { name: "Highest observed OVO paid-window day", usable: 18.09123841247981 },
  { name: "GloBird p95 + pool cold headroom", usable: 20.2 },
  { name: "OVO p95 + pool cold headroom", usable: 21.8 },
];

const batteryOptions = [
  {
    name: "Single Tesla PW3",
    usable: 13.5,
    chargeLimit: 5,
    note: "Below p95 target",
  },
  {
    name: "Sungrow 19.2 kWh",
    usable: 19.2,
    chargeLimit: 10,
    note: "Best-fit value",
  },
  {
    name: "Sungrow + pool lift",
    usable: 24.4,
    chargeLimit: 10,
    note: "House plus 1°C pool catch-up",
  },
  {
    name: "Sigenergy 20 kWh",
    usable: 20,
    chargeLimit: 8,
    note: "Modular fit",
  },
  {
    name: "Tesla PW3 + Expansion",
    usable: 27,
    chargeLimit: 5,
    note: "Charge-limited today",
  },
  {
    name: "Sigenergy 23.4 kWh+",
    usable: 23.4,
    chargeLimit: 10,
    note: "Headroom option",
  },
  {
    name: "Sigenergy + pool lift",
    usable: 28.6,
    chargeLimit: 10,
    note: "House plus 1°C pool catch-up",
  },
];

const measuredFreeWindowLoad = {
  ovo: 5.463177505182682 / 3,
  globird: 6.222270324697016 / 4,
};

const poolCatchupKwh = 20.65791 / 4;
const poolMaintenanceKwhPerDay = 2.2;

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 0,
});

const fallbackMarketData = {
  planCount: 606,
  retailerCount: 8,
  modelBasis: {
    annualisedKwh: 6263.533624812189,
    annualisedKwhWithPool: 7066.533624812189,
    usageScenarios: {
      low: { totalAnnualKwh: 5684, description: "Mild covered-pool use" },
      medium: { totalAnnualKwh: 7067, description: "Current HA load plus covered pool" },
      high: { totalAnnualKwh: 9295, description: "Winter HVAC plus pool catch-up" },
    },
  },
  providerStatus: [
    { brand: "agl", eligible: 68 },
    { brand: "origin", eligible: 154 },
    { brand: "energyaustralia", eligible: 64 },
    { brand: "nectr", eligible: 12 },
    { brand: "powershop", eligible: 36 },
    { brand: "amber", eligible: 21 },
    { brand: "engie", eligible: 240 },
    { brand: "dodo", eligible: 4 },
    { brand: "globird", eligible: 28 },
  ],
  plans: [
    {
      rank: 1,
      retailer: "GloBird Energy",
      name: "BOOST Residential (Flexible Rate)-Endeavour",
      modelledAnnualAfterDiscountIncGst: 2441,
      modelledPoolAnnualCostIncGst: 190,
      scenarioCosts: {
        low: { annualAfterDiscountIncGst: 2088 },
        medium: { annualAfterDiscountIncGst: 2441 },
        high: { annualAfterDiscountIncGst: 3020 },
      },
      dailySupplyIncGst: 1.298,
      usageRatesIncGst: [0.2365, 0.275, 0.4026],
      modelQuality: "profiled",
      warnings: [],
    },
    {
      rank: 3,
      retailer: "ENGIE",
      name: "ENGIE Perks Plus Elec",
      modelledAnnualAfterDiscountIncGst: 2447,
      modelledPoolAnnualCostIncGst: 240,
      scenarioCosts: {
        low: { annualAfterDiscountIncGst: 2072 },
        medium: { annualAfterDiscountIncGst: 2447 },
        high: { annualAfterDiscountIncGst: 3061 },
      },
      dailySupplyIncGst: 1.16864,
      usageRatesIncGst: [0.2989, 0.4758, 0.5659],
      modelQuality: "profiled",
      warnings: [],
    },
    {
      rank: 9,
      retailer: "Origin Energy",
      name: "Origin Affinity Variable ePlus",
      modelledAnnualAfterDiscountIncGst: 2301,
      modelledPoolAnnualCostIncGst: 205,
      scenarioCosts: {
        low: { annualAfterDiscountIncGst: 1970 },
        medium: { annualAfterDiscountIncGst: 2301 },
        high: { annualAfterDiscountIncGst: 2930 },
      },
      dailySupplyIncGst: 1.03631,
      usageRatesIncGst: [0.2559, 0.3861, 0.4817],
      modelQuality: "profiled",
      warnings: [],
    },
  ],
};

let marketData = fallbackMarketData;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function moneyValue(value) {
  return Number.isFinite(value) ? currency.format(value) : "Not modelled";
}

function uniqueMarketPlans(plansToRank, limit = 12) {
  const seen = new Set();
  const ranked = [];
  plansToRank
    .filter((plan) => Number.isFinite(plan.modelledAnnualAfterDiscountIncGst))
    .forEach((plan) => {
      const rateKey = (plan.usageRatesIncGst || []).map((rate) => Number(rate).toFixed(4)).join("/");
      const key = `${plan.retailer}|${plan.name}|${Number(plan.dailySupplyIncGst || 0).toFixed(4)}|${rateKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranked.push(plan);
      }
    });
  return ranked.slice(0, limit);
}

function drawPlanChart() {
  const canvas = document.getElementById("planChart");
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = 320 * ratio;
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = 320;
  const padding = { top: 28, right: 24, bottom: 58, left: 64 };
  const max = Math.max(...plans.map((plan) => plan.annual)) * 1.08;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 12;
  const barWidth = Math.max(18, (chartWidth - barGap * (plans.length - 1)) / plans.length);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d8ded7";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#60707a";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + chartHeight * (i / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  plans.forEach((plan, index) => {
    const x = padding.left + index * (barWidth + barGap);
    const barHeight = (plan.annual / max) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    ctx.fillStyle = plan.color;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#182026";
    ctx.textAlign = "center";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.fillText(currency.format(plan.annual), x + barWidth / 2, y - 8);
    ctx.save();
    ctx.translate(x + barWidth / 2, height - 18);
    ctx.rotate(-0.35);
    ctx.fillStyle = "#60707a";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.fillText(plan.name.replace("GloBird ", ""), 0, 0);
    ctx.restore();
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#60707a";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.fillText("Annual estimate inc GST", padding.left, 18);
}

function drawMarketChart() {
  const canvas = document.getElementById("marketChart");
  if (!canvas) return;

  const top = uniqueMarketPlans(marketData.plans || [], 10);
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = 340 * ratio;
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = 340;
  const padding = { top: 30, right: 26, bottom: 82, left: 66 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...top.map((plan) => plan.modelledAnnualAfterDiscountIncGst), 2600) * 1.08;
  const barGap = 10;
  const barWidth = Math.max(18, (chartWidth - barGap * Math.max(0, top.length - 1)) / Math.max(1, top.length));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d8ded7";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#60707a";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + chartHeight * (i / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  top.forEach((plan, index) => {
    const x = padding.left + index * (barWidth + barGap);
    const value = plan.modelledAnnualAfterDiscountIncGst;
    const barHeight = (value / max) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    ctx.fillStyle = index === 0 ? "#16805a" : index < 3 ? "#285f9e" : "#6d7780";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#182026";
    ctx.textAlign = "center";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.fillText(currency.format(value), x + barWidth / 2, y - 8);
    ctx.save();
    ctx.translate(x + barWidth / 2, height - 18);
    ctx.rotate(-0.35);
    ctx.fillStyle = "#60707a";
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.fillText(String(plan.retailer || "").replace(" Energy", ""), 0, 0);
    ctx.restore();
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#60707a";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.fillText("Top distinct plans, modelled annual cost inc GST", padding.left, 18);
}

function renderMarketScan() {
  const top = uniqueMarketPlans(marketData.plans || [], 12);
  const best = top[0];
  const annualUse = marketData.modelBasis?.annualisedKwhWithPool || marketData.modelBasis?.annualisedKwh;
  const checkedProviders = (marketData.providerStatus || [])
    .map((provider) => provider.brand)
    .join(", ");
  const eligibleProviders = (marketData.providerStatus || [])
    .filter((provider) => provider.eligible)
    .map((provider) => provider.brand)
    .join(", ");

  document.getElementById("marketPlanCount").textContent = number.format(marketData.planCount || 0);
  document.getElementById("marketRetailerCount").textContent = number.format(marketData.retailerCount || 0);
  document.getElementById("marketAnnualUse").textContent = `${number.format(annualUse || 0)} kWh`;
  document.getElementById("marketBestOffer").textContent = best
    ? moneyValue(best.modelledAnnualAfterDiscountIncGst)
    : "Not modelled";
  document.getElementById("marketBestMetric").textContent = best
    ? moneyValue(best.modelledAnnualAfterDiscountIncGst)
    : "$2,441";
  document.getElementById("marketBestText").textContent = best
    ? `${best.retailer} ${best.name}`.slice(0, 68)
    : "Best CDR plan modelled against HA load";
  document.getElementById("execBestPlan").textContent = best
    ? `${best.retailer} ${best.name}: ${moneyValue(best.modelledAnnualAfterDiscountIncGst)} in the medium case, including scheduled covered-pool heating.`
    : "Market scan data is not available.";
  document.getElementById("marketScope").textContent = checkedProviders
    ? `${checkedProviders} CDR endpoints were checked. Eligible Endeavour plans were found for ${eligibleProviders}; providers with zero eligible records are retained in the generated data.`
    : "Official CDR endpoints were checked; eligible Endeavour residential electricity plans were modelled.";

  document.getElementById("marketTable").innerHTML = top
    .map((plan, index) => {
      const rates = (plan.usageRatesIncGst || [])
        .slice(0, 4)
        .map((rate) => `${(rate * 100).toFixed(2)} c/kWh`)
        .join(", ");
      const freeWindow = plan.freeWindow ? `Free ${plan.freeWindow}` : "";
      const discounts = plan.discountRate ? `${(plan.discountRate * 100).toFixed(0)}% conditional discount modelled` : "";
      const poolCost = Number.isFinite(plan.modelledPoolAnnualCostIncGst)
        ? `Pool ${currency.format(plan.modelledPoolAnnualCostIncGst)}/yr`
        : "";
      const warnings = (plan.warnings || []).slice(0, 1).join(" ");
      const notes = [freeWindow, poolCost, discounts, warnings || plan.modelQuality].filter(Boolean).join(" ");
      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(plan.retailer)}</strong><br>
            <span>${escapeHtml(plan.name)}</span>
          </td>
          <td>${moneyValue(plan.scenarioCosts?.low?.annualAfterDiscountIncGst)}</td>
          <td>${moneyValue(plan.scenarioCosts?.medium?.annualAfterDiscountIncGst ?? plan.modelledAnnualAfterDiscountIncGst)}</td>
          <td>${moneyValue(plan.scenarioCosts?.high?.annualAfterDiscountIncGst)}</td>
          <td>${plan.dailySupplyIncGst ? `${(plan.dailySupplyIncGst * 100).toFixed(1)} c/day` : "Unknown"}</td>
          <td>${escapeHtml(rates || "Unparsed")}</td>
          <td>${escapeHtml(notes)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderPlanList() {
  const container = document.getElementById("planList");
  container.innerHTML = plans
    .map((plan) => {
      const diff = plan.annual - 2772;
      const diffLabel = diff === 0 ? "baseline" : `${diff > 0 ? "+" : "-"}${currency.format(Math.abs(diff))} vs OVO`;
      return `
        <div class="plan-item">
          <div>
            <strong>${plan.name}</strong>
            <span>${plan.note}</span>
          </div>
          <div>
            <strong>${currency.format(plan.annual)}</strong>
            <span>${diffLabel}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateBreakEven() {
  const annualGap = Number(document.getElementById("annualGap").value);
  const avoidedRateCents = Number(document.getElementById("avoidedRate").value);
  const annualKwh = annualGap / (avoidedRateCents / 100);
  const dailyKwh = annualKwh / 365;

  document.getElementById("annualGapOutput").textContent = `${currency.format(annualGap)}/year`;
  document.getElementById("avoidedRateOutput").textContent = `${avoidedRateCents.toFixed(2)} c/kWh`;
  document.getElementById("breakEvenDaily").textContent = `${dailyKwh.toFixed(2)} kWh/day`;
  document.getElementById("breakEvenAnnual").textContent = `${annualKwh.toFixed(0)} kWh/year`;
}

function chargePower(usable, hours) {
  return usable / 0.9 / hours;
}

function drawChargeChart() {
  const canvas = document.getElementById("chargeChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = 360 * ratio;
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = 360;
  const padding = { top: 34, right: 24, bottom: 84, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxKw = Math.max(
    ...batteryOptions.flatMap((option) => [
      chargePower(option.usable, 3) + measuredFreeWindowLoad.ovo,
      chargePower(option.usable, 4) + measuredFreeWindowLoad.globird,
      option.chargeLimit,
    ]),
  ) * 1.18;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d8ded7";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#60707a";

  for (let i = 0; i <= 5; i += 1) {
    const y = padding.top + chartHeight * (i / 5);
    const label = maxKw - maxKw * (i / 5);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${label.toFixed(1)} kW`, padding.left - 8, y + 4);
  }

  const groupWidth = chartWidth / batteryOptions.length;
  const barWidth = Math.min(28, groupWidth / 4);

  batteryOptions.forEach((option, index) => {
    const center = padding.left + groupWidth * index + groupWidth / 2;
    const ovoKw = chargePower(option.usable, 3);
    const globirdKw = chargePower(option.usable, 4);
    const bars = [
      { x: center - barWidth - 3, value: ovoKw, load: measuredFreeWindowLoad.ovo, color: "#285f9e" },
      { x: center + 3, value: globirdKw, load: measuredFreeWindowLoad.globird, color: "#16805a" },
    ];

    bars.forEach((bar) => {
      const barHeight = (bar.value / maxKw) * chartHeight;
      const loadHeight = (bar.load / maxKw) * chartHeight;
      const y = padding.top + chartHeight - barHeight;
      const loadY = y - loadHeight;
      ctx.fillStyle = bar.color;
      ctx.fillRect(bar.x, y, barWidth, barHeight);
      ctx.fillStyle = "#c7ced1";
      ctx.fillRect(bar.x, loadY, barWidth, loadHeight);
      ctx.fillStyle = "#182026";
      ctx.textAlign = "center";
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      ctx.fillText((bar.value + bar.load).toFixed(1), bar.x + barWidth / 2, loadY - 7);
    });

    const limitY = padding.top + chartHeight - (option.chargeLimit / maxKw) * chartHeight;
    ctx.strokeStyle = "#b44d42";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center - barWidth * 1.45, limitY);
    ctx.lineTo(center + barWidth * 1.45, limitY);
    ctx.stroke();

    ctx.save();
    ctx.translate(center, height - 22);
    ctx.rotate(-0.32);
    ctx.fillStyle = "#60707a";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(option.name, 0, 0);
    ctx.restore();
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#60707a";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.fillText("Average free-window grid draw: battery charging plus measured house load", padding.left, 20);
  ctx.fillStyle = "#b44d42";
  ctx.fillText("red tick = battery charge limit", width - padding.right - 175, 20);
}

function renderBattery() {
  const table = document.getElementById("batteryTable");
  table.innerHTML = batteryScenarios
    .map((scenario) => {
      const nominal = scenario.usable / 0.9;
      return `
        <tr>
          <td>${scenario.name}</td>
          <td>${scenario.usable.toFixed(1)} kWh</td>
          <td>${nominal.toFixed(1)} kWh</td>
          <td>${chargePower(scenario.usable, 3).toFixed(1)} kW</td>
          <td>${chargePower(scenario.usable, 4).toFixed(1)} kW</td>
        </tr>
      `;
    })
    .join("");

  const list = document.getElementById("scenarioList");
  list.innerHTML = batteryScenarios
    .map(
      (scenario, index) => `
        <button class="scenario-item ${index === 1 ? "active" : ""}" data-index="${index}" type="button">
          <span>
            <strong>${scenario.name}</strong>
            ${scenario.usable.toFixed(1)} kWh usable battery
          </span>
          <strong>${chargePower(scenario.usable, 3).toFixed(1)} kW</strong>
        </button>
      `,
    )
    .join("");

  list.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      list.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const scenario = batteryScenarios[Number(button.dataset.index)];
      document.getElementById("usableKwhLabel").textContent = `${scenario.usable.toFixed(1)} kWh usable`;
      document.getElementById("batteryFill").style.width = `${Math.min(92, 28 + scenario.usable * 2.2)}%`;
    });
  });
}

window.addEventListener("resize", () => {
  drawPlanChart();
  drawChargeChart();
  drawMarketChart();
});
document.getElementById("annualGap").addEventListener("input", updateBreakEven);
document.getElementById("avoidedRate").addEventListener("input", updateBreakEven);

async function loadMarketData() {
  try {
    const response = await fetch("./data/market-scan.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    marketData = await response.json();
  } catch (error) {
    console.warn("Using fallback market data", error);
  }
}

async function init() {
  renderPlanList();
  renderBattery();
  updateBreakEven();
  await loadMarketData();
  renderMarketScan();
  drawPlanChart();
  drawChargeChart();
  drawMarketChart();
}

init();
