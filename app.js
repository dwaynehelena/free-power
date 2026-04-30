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
];

const measuredFreeWindowLoad = {
  ovo: 5.463177505182682 / 3,
  globird: 6.222270324697016 / 4,
};

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

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
      document.getElementById("usableKwhLabel").textContent = `${scenario.usable} kWh usable`;
      document.getElementById("batteryFill").style.width = `${Math.min(92, 28 + scenario.usable * 2.2)}%`;
    });
  });
}

window.addEventListener("resize", () => {
  drawPlanChart();
  drawChargeChart();
});
document.getElementById("annualGap").addEventListener("input", updateBreakEven);
document.getElementById("avoidedRate").addEventListener("input", updateBreakEven);

renderPlanList();
renderBattery();
updateBreakEven();
drawPlanChart();
drawChargeChart();
