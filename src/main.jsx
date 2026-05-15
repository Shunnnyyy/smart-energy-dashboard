import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion } from 'framer-motion';
import {
  Zap, BarChart3, Home, LineChart, Settings, Lightbulb,
  Sparkles, Database, ShieldCheck, Calculator, FileText, Info, ArrowLeft
} from 'lucide-react';
import './style.css';

const HourlyUsageChart = lazy(() => import('./charts.jsx').then(module => ({ default: module.HourlyUsageChart })));
const ApplianceBreakdownChart = lazy(() => import('./charts.jsx').then(module => ({ default: module.ApplianceBreakdownChart })));

const OEB_TOU_RATES = {
  offPeak: 0.098,
  midPeak: 0.157,
  onPeak: 0.203,
};

const ONTARIO_AVERAGE_KWH = 746;
const STORAGE_KEY = 'smartenergy-dashboard-state-v2';
const LAST_VERIFIED = 'May 15, 2026';
const OEB_RATES_URL = 'https://www.oeb.ca/consumer-information-and-protection/electricity-rates';
const OEB_ANNOUNCEMENT_URL = 'https://www.oeb.ca/newsroom/2025/ontario-energy-board-announces-changes-electricity-prices-households-small-businesses';
const ONTARIO_OER_URL = 'https://www.ontario.ca/page/manage-energy-costs-your-home';
const LUMEN_SHIFT_URL = 'https://lumen-shift.vercel.app';
const POWER_IN_PRACTICE_URL = 'https://power-in-practice.vercel.app';

const BILLING_PROFILES = {
  condo: {
    label: 'Condo / apartment',
    fixedCharge: 24,
    deliveryRate: 0.057,
    regulatoryRate: 0.006,
    applianceMix: { HVAC: 0.32, EV: 0.04, Laundry: 0.12, Lighting: 0.14, Kitchen: 0.18, Other: 0.20 },
  },
  detached: {
    label: 'Detached home',
    fixedCharge: 34,
    deliveryRate: 0.071,
    regulatoryRate: 0.006,
    applianceMix: { HVAC: 0.40, EV: 0.08, Laundry: 0.10, Lighting: 0.10, Kitchen: 0.16, Other: 0.16 },
  },
  ev: {
    label: 'EV household',
    fixedCharge: 36,
    deliveryRate: 0.074,
    regulatoryRate: 0.006,
    applianceMix: { HVAC: 0.28, EV: 0.30, Laundry: 0.08, Lighting: 0.08, Kitchen: 0.12, Other: 0.14 },
  },
};

const HST_RATE = 0.13;
const ONTARIO_ELECTRICITY_REBATE = 0.235;

const SCENARIOS = {
  condo: { label: 'Condo', monthlyUsage: 560, onPeakPercent: 28, midPeakPercent: 18, billingProfile: 'condo', dayType: 'weekday' },
  detached: { label: 'Detached Home', monthlyUsage: 820, onPeakPercent: 35, midPeakPercent: 0, billingProfile: 'detached', dayType: 'weekday' },
  ev: { label: 'EV Household', monthlyUsage: 1120, onPeakPercent: 24, midPeakPercent: 10, billingProfile: 'ev', dayType: 'weekday' },
  workFromHome: { label: 'Work From Home', monthlyUsage: 910, onPeakPercent: 46, midPeakPercent: 18, billingProfile: 'detached', dayType: 'weekday' },
  saver: { label: 'Energy Saver', monthlyUsage: 520, onPeakPercent: 18, midPeakPercent: 12, billingProfile: 'condo', dayType: 'weekend' },
};

function formatMoney(value) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
}

function getEfficiencyScore(usage) {
  if (usage < 600) return 'A';
  if (usage <= 750) return 'B+';
  if (usage <= 900) return 'C';
  return 'D';
}

function getTouPeriod(hour, dayType) {
  if (dayType === 'weekend') return 'offPeak';
  if (hour < 7 || hour >= 19) return 'offPeak';
  if (hour >= 11 && hour < 17) return 'onPeak';
  return 'midPeak';
}

function formatRate(rate) {
  return `${(rate * 100).toFixed(1)}¢`;
}

function calculateEnergyModel(monthlyUsage, onPeakPercent, midPeakPercent, billingProfile = 'detached') {
  const normalizedOnPeak = Math.min(100, Math.max(0, onPeakPercent));
  const normalizedMidPeak = Math.min(100 - normalizedOnPeak, Math.max(0, midPeakPercent));
  const offPeakPercent = 100 - normalizedOnPeak - normalizedMidPeak;
  const onPeakKwh = monthlyUsage * (normalizedOnPeak / 100);
  const midPeakKwh = monthlyUsage * (normalizedMidPeak / 100);
  const offPeakKwh = monthlyUsage * (offPeakPercent / 100);
  const profile = BILLING_PROFILES[billingProfile] || BILLING_PROFILES.detached;

  const electricityCharge =
    onPeakKwh * OEB_TOU_RATES.onPeak +
    midPeakKwh * OEB_TOU_RATES.midPeak +
    offPeakKwh * OEB_TOU_RATES.offPeak;
  const deliveryCharge = monthlyUsage * profile.deliveryRate + profile.fixedCharge;
  const regulatoryCharge = monthlyUsage * profile.regulatoryRate;
  const subtotalBeforeTax = electricityCharge + deliveryCharge + regulatoryCharge;
  const hst = subtotalBeforeTax * HST_RATE;
  const oerCredit = subtotalBeforeTax * ONTARIO_ELECTRICITY_REBATE;
  const estimatedBill = subtotalBeforeTax + hst - oerCredit;

  const shiftedKwh = onPeakKwh * 0.15;
  const potentialSavings = shiftedKwh * (OEB_TOU_RATES.onPeak - OEB_TOU_RATES.offPeak);
  const comparisonPercent = ((monthlyUsage - ONTARIO_AVERAGE_KWH) / ONTARIO_AVERAGE_KWH) * 100;

  return {
    offPeakPercent,
    onPeakPercent: normalizedOnPeak,
    midPeakPercent: normalizedMidPeak,
    onPeakKwh,
    midPeakKwh,
    offPeakKwh,
    electricityCharge,
    deliveryCharge,
    regulatoryCharge,
    fixedCharge: profile.fixedCharge,
    hst,
    oerCredit,
    subtotalBeforeTax,
    estimatedBill,
    potentialSavings,
    comparisonPercent,
    efficiencyScore: getEfficiencyScore(monthlyUsage),
    billingProfile,
    profile,
  };
}

function buildInsights(monthlyUsage, onPeakPercent, model) {
  const insights = [];

  if (onPeakPercent > 40) {
    insights.push(['Peak usage is high', 'Your peak-hour consumption is higher than average. Shift appliances after 7 PM to lower cost periods.']);
  } else {
    insights.push(['Peak usage is controlled', 'Your on-peak share is within a healthy range for a residential TOU profile.']);
  }

  if (monthlyUsage > ONTARIO_AVERAGE_KWH) {
    insights.push(['Above Ontario average', `Your household uses ${Math.abs(model.comparisonPercent).toFixed(1)}% more electricity than the Ontario benchmark.`]);
  } else {
    insights.push(['Below Ontario average', `Your household uses ${Math.abs(model.comparisonPercent).toFixed(1)}% less electricity than the Ontario benchmark.`]);
  }

  if (monthlyUsage < 600) {
    insights.push(['Efficient home profile', 'Your home is operating efficiently compared with Ontario households.']);
  } else {
    insights.push(['Savings opportunity', `Shifting 15% of on-peak usage to off-peak could save about ${formatMoney(model.potentialSavings)} per month.`]);
  }

  return insights;
}

function makeHourlyUsageData(monthlyUsage, dayType, billingProfile = 'detached') {
  const dailyTarget = monthlyUsage / 30;
  const profile = BILLING_PROFILES[billingProfile] || BILLING_PROFILES.detached;
  const evBoost = profile.applianceMix.EV > 0.2 ? 1.55 : 1;
  const raw = Array.from({ length: 24 }, (_, hour) => {
    const morning = hour >= 6 && hour <= 9 ? 1.4 : 0;
    const workday = dayType === 'weekday' && hour >= 10 && hour <= 16 ? 0.72 : 0;
    const evening = hour >= 17 && hour <= 22 ? 1.75 : 0;
    const overnight = hour < 6 ? 0.72 * evBoost : 0.25;
    const weekendBump = dayType === 'weekend' && hour >= 9 && hour <= 21 ? 0.42 : 0;
    const base = 0.48 + morning + workday + evening + overnight + weekendBump;
    return { hour, period: getTouPeriod(hour, dayType), raw: base };
  });
  const rawTotal = raw.reduce((sum, item) => sum + item.raw, 0);
  return raw.map(item => ({
    time: `${String(item.hour).padStart(2, '0')}:00`,
    hour: item.hour,
    period: item.period,
    periodLabel: item.period === 'onPeak' ? 'On-Peak' : item.period === 'midPeak' ? 'Mid-Peak' : 'Off-Peak',
    usage: +(item.raw / rawTotal * dailyTarget).toFixed(2),
  }));
}

function makeApplianceData(monthlyUsage, billingProfile = 'detached') {
  const profile = BILLING_PROFILES[billingProfile] || BILLING_PROFILES.detached;
  return Object.entries(profile.applianceMix).map(([name, share]) => ({
    name,
    value: Math.round(monthlyUsage * share),
    share,
  }));
}

const features = [
  [Calculator, 'OEB Bill Estimation', 'Estimate monthly hydro cost using Ontario Time-of-Use rates.'],
  [BarChart3, 'Ontario Benchmarking', 'Compare your home against the 746 kWh typical monthly household benchmark.'],
  [Lightbulb, 'Rule-Based Insights', 'Generate practical recommendations without needing a real AI model.'],
];

const tariffRows = [
  ['On-Peak', '20.3¢', 'Weekday demand hours', '#EF4444'],
  ['Mid-Peak', '15.7¢', 'Shoulder periods', '#F59E0B'],
  ['Off-Peak', '9.8¢', 'Evenings, weekends, holidays', '#16A34A'],
];

function CostScopeNote() {
  return (
    <div className="scope-note" role="note">
      <Info size={16} />
      <span>Bill estimate includes configurable delivery, regulatory charges, HST, and Ontario Electricity Rebate. Utility-specific charges may differ.</span>
    </div>
  );
}

function buildReportHTML({ monthlyUsage, onPeakPercent, midPeakPercent, model, insights, showBenchmark, scenarioLabel, dayType }) {
  const offPeakPercent = model.offPeakPercent;
  const comparisonText = model.comparisonPercent >= 0 ? 'above' : 'below';
  const generatedAt = new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
  const onCost = model.onPeakKwh * OEB_TOU_RATES.onPeak;
  const midCost = model.midPeakKwh * OEB_TOU_RATES.midPeak;
  const offCost = model.offPeakKwh * OEB_TOU_RATES.offPeak;
  const applianceData = makeApplianceData(monthlyUsage, model.billingProfile);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SmartEnergy Report</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0F172A; background: #F8FAFC; }
    .report { max-width: 960px; margin: 0 auto; padding: 48px; }
    .hero { background: #FFFFFF; border: 1px solid rgba(15,23,42,.10); border-radius: 8px; padding: 34px; }
    .brand { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:38px; }
    .logo { font-weight: 800; letter-spacing: 0; font-size: 22px; }
    .date { color:#64748B; font-size: 13px; }
    .eyebrow { color:#2563EB; font-size:12px; text-transform:uppercase; letter-spacing:.28em; font-weight:800; }
    h1 { font-size: 48px; line-height: 1; letter-spacing: 0; margin: 12px 0 14px; }
    h2 { font-size: 26px; letter-spacing: 0; margin: 0 0 16px; }
    h3 { margin: 0 0 6px; font-size: 16px; }
    p { color:#475569; line-height:1.6; }
    .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin:22px 0; }
    .card { background: rgba(255,255,255,.82); border:1px solid rgba(15,23,42,.08); border-radius:8px; padding:22px; box-shadow: 0 18px 60px rgba(15,23,42,.06); }
    .label { color:#64748B; font-size:11px; text-transform:uppercase; letter-spacing:.22em; font-weight:800; margin:0 0 12px; }
    .num { font-size:34px; font-weight:850; letter-spacing:0; color:#0F172A; }
    .section { margin-top: 26px; }
    table { width:100%; border-collapse: collapse; overflow:hidden; border-radius:20px; background:white; border:1px solid rgba(15,23,42,.08); }
    th, td { padding:16px; text-align:left; border-bottom:1px solid rgba(15,23,42,.06); }
    th { color:#64748B; font-size:11px; text-transform:uppercase; letter-spacing:.2em; }
    td:last-child, th:last-child { text-align:right; font-weight:800; }
    .insight { display:flex; gap:14px; align-items:flex-start; margin-bottom:12px; }
    .dot { width:10px; height:10px; border-radius:999px; background:#22C55E; margin-top:7px; flex:none; }
    .bar { height:12px; border-radius:999px; background:#E2E8F0; overflow:hidden; margin-top:12px; }
    .bar span { display:block; height:100%; width:${Math.min(100, monthlyUsage / 12)}%; background:linear-gradient(90deg,#2563EB,#22C55E); border-radius:999px; }
    .scope { display:flex; gap:8px; align-items:flex-start; padding:14px 16px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; color:#92400E; font-size:13px; line-height:1.5; }
    .sources { display:grid; gap:10px; }
    .sources a { color:#2563EB; font-weight:800; text-decoration:none; }
    .actions { margin: 26px 0; display:flex; gap:12px; }
    button { border:0; border-radius:999px; padding:12px 18px; background:#2563EB; color:white; font-weight:800; cursor:pointer; }
    button.secondary { background:white; color:#0F172A; border:1px solid rgba(15,23,42,.1); }
    @media print { .actions { display:none; } body { background:white; } .report { padding: 20px; } .card, .hero, table { box-shadow:none; } }
  </style>
</head>
<body>
  <main class="report">
    <section class="hero">
      <div class="brand"><div class="logo">⚡ SmartEnergy</div><div class="date">Generated ${generatedAt}</div></div>
      <div class="eyebrow">Ontario Energy Report</div>
      <h1>Household Energy Summary</h1>
      <p>This report estimates monthly electricity cost using Ontario Time-of-Use rates plus configurable delivery, regulatory, HST, and Ontario Electricity Rebate assumptions.</p>
      <div class="scope">Scenario: ${scenarioLabel || model.profile.label} · ${dayType === 'weekend' ? 'Weekend' : 'Weekday'} mode. Estimate only; delivery and fixed charges vary by local utility.</div>
      <div class="actions"><button onclick="window.print()">Print / Save PDF</button></div>
    </section>

    <section class="grid">
      <div class="card"><p class="label">Monthly Usage</p><div class="num">${monthlyUsage}</div><p>kWh</p></div>
      <div class="card"><p class="label">Estimated Bill</p><div class="num">${formatMoney(model.estimatedBill)}</div><p>after HST + OER</p></div>
      <div class="card"><p class="label">Ontario Average</p><div class="num">${showBenchmark ? '746' : 'Off'}</div><p>${showBenchmark ? 'kWh/month' : 'benchmark hidden'}</p></div>
      <div class="card"><p class="label">Efficiency Score</p><div class="num">${model.efficiencyScore}</div><p>${Math.abs(model.comparisonPercent).toFixed(1)}% ${comparisonText} average</p></div>
    </section>

    <section class="section card">
      <h2>TOU Energy Breakdown</h2>
      <table>
        <thead><tr><th>Period</th><th>Share</th><th>Usage</th><th>Rate</th><th>Cost</th></tr></thead>
        <tbody>
          <tr><td>On-Peak</td><td>${model.onPeakPercent}%</td><td>${model.onPeakKwh.toFixed(0)} kWh</td><td>20.3¢ / kWh</td><td>${formatMoney(onCost)}</td></tr>
          <tr><td>Mid-Peak</td><td>${model.midPeakPercent}%</td><td>${model.midPeakKwh.toFixed(0)} kWh</td><td>15.7¢ / kWh</td><td>${formatMoney(midCost)}</td></tr>
          <tr><td>Off-Peak</td><td>${offPeakPercent}%</td><td>${model.offPeakKwh.toFixed(0)} kWh</td><td>9.8¢ / kWh</td><td>${formatMoney(offCost)}</td></tr>
        </tbody>
      </table>
      <div class="bar"><span></span></div>
    </section>

    <section class="section card">
      <h2>Estimated Bill Stack</h2>
      <table>
        <tbody>
          <tr><td>Electricity charge</td><td>${formatMoney(model.electricityCharge)}</td></tr>
          <tr><td>Delivery + fixed charge</td><td>${formatMoney(model.deliveryCharge)}</td></tr>
          <tr><td>Regulatory charge</td><td>${formatMoney(model.regulatoryCharge)}</td></tr>
          <tr><td>HST</td><td>${formatMoney(model.hst)}</td></tr>
          <tr><td>Ontario Electricity Rebate</td><td>-${formatMoney(model.oerCredit)}</td></tr>
          <tr><td><strong>Estimated total</strong></td><td><strong>${formatMoney(model.estimatedBill)}</strong></td></tr>
        </tbody>
      </table>
    </section>

    <section class="section card">
      <h2>Appliance Breakdown</h2>
      <table>
        <tbody>
          ${applianceData.map(item => `<tr><td>${item.name}</td><td>${Math.round(item.share * 100)}%</td><td>${item.value} kWh</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section class="section card">
      <h2>Smart Recommendations</h2>
      ${insights.map(([title, text]) => `<div class="insight"><span class="dot"></span><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}
      <p><strong>Potential savings:</strong> ${formatMoney(model.potentialSavings)} / month by shifting 15% of on-peak usage to off-peak.</p>
    </section>

    <section class="section card">
      <h2>Data Sources</h2>
      <p><strong>Last verified:</strong> ${LAST_VERIFIED}</p>
      <table>
        <thead><tr><th>Rate</th><th>Price</th><th>Source note</th></tr></thead>
        <tbody>
          <tr><td>Off-Peak</td><td>9.8¢ / kWh</td><td>OEB RPP TOU price</td></tr>
          <tr><td>Mid-Peak</td><td>15.7¢ / kWh</td><td>OEB RPP TOU price</td></tr>
          <tr><td>On-Peak</td><td>20.3¢ / kWh</td><td>OEB RPP TOU price</td></tr>
          <tr><td>Ontario Electricity Rebate</td><td>23.5%</td><td>Applied as a pre-tax credit in this model</td></tr>
        </tbody>
      </table>
      <div class="sources">
        <a href="${OEB_RATES_URL}">Ontario Energy Board electricity rates</a>
        <a href="${OEB_ANNOUNCEMENT_URL}">OEB November 2025 rate announcement</a>
        <a href="${ONTARIO_OER_URL}">Ontario energy cost and OER information</a>
      </div>
    </section>
  </main>
  <script>
</script>
</body>
</html>`;
}

function exportEnergyReport(reportData) {
  const html = buildReportHTML(reportData);
  const reportWindow = window.open('', '_blank');
  if (reportWindow) {
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
  } else {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartenergy-report.html';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function EnergyBackground() {
  const nodes = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: `${8 + ((i * 37) % 84)}%`,
    top: `${10 + ((i * 53) % 78)}%`,
    delay: (i % 7) * 0.4,
  })), []);

  return (
    <div className="energy-bg">
      <div className="grid-bg" />
      <motion.div className="blur-orb blue" animate={{ y: [0, 24, 0], scale: [1, 1.06, 1] }} transition={{ duration: 12, repeat: Infinity }} />
      <motion.div className="blur-orb green" animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }} transition={{ duration: 14, repeat: Infinity }} />
      {nodes.map(node => (
        <motion.span key={node.id} className="node" style={{ left: node.left, top: node.top }} animate={{ opacity: [0.12, 0.62, 0.12], scale: [1, 1.7, 1] }} transition={{ duration: 5, delay: node.delay, repeat: Infinity }} />
      ))}
    </div>
  );
}

function Button({ children, secondary, onClick, ariaLabel }) {
  return <motion.button aria-label={ariaLabel} onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className={secondary ? 'btn secondary' : 'btn'}>{children}</motion.button>;
}

function Card({ children, className = '' }) {
  return <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} whileHover={{ y: -3 }} className={`card ${className}`}>{children}</motion.div>;
}

function EnergyNetwork({ model }) {
  return (
    <div className="network-card">
      <div className="network-glow" />
      <svg className="network-svg" viewBox="0 0 620 520" fill="none">
        <defs>
          <linearGradient id="line" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#2563EB" stopOpacity="0.08" />
            <stop offset="0.55" stopColor="#2563EB" stopOpacity="0.55" />
            <stop offset="1" stopColor="#22C55E" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <motion.path d="M64 292 C158 140 244 396 348 226 C430 92 500 180 556 120" stroke="url(#line)" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 5, repeat: Infinity, repeatType: 'reverse' }} />
        <motion.path d="M84 390 C184 280 272 300 366 348 C458 396 510 300 566 334" stroke="url(#line)" strokeWidth="1.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 7, repeat: Infinity, repeatType: 'reverse' }} />
        {[80, 184, 300, 418, 538].map((x, i) => (
          <motion.circle key={x} cx={x} cy={[292, 210, 314, 190, 332][i]} r="5" fill={i % 2 ? '#22C55E' : '#2563EB'} opacity="0.7" animate={{ r: [4, 8, 4], opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 4, delay: i * 0.4, repeat: Infinity }} />
        ))}
      </svg>
      <motion.div className="ring ring-one" animate={{ rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="ring ring-two" animate={{ rotate: -360 }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} />
      <div className="live-card">
        <p className="eyebrow">MVP Data Model</p>
        <div className="live-row">
          <div><h3>{formatMoney(model.estimatedBill)}</h3><p>Estimated monthly bill</p></div>
          <Sparkles color="#2563EB" />
        </div>
      </div>
    </div>
  );
}

function LandingPage({ openDashboard, model }) {
  const stats = [
    ['OEB Off-Peak Rate', '9.8¢', '/ kWh'],
    ['OEB On-Peak Rate', '20.3¢', '/ kWh'],
    ['Ontario Average', '746', 'kWh/month'],
    ['Potential Savings', formatMoney(model.potentialSavings), 'monthly'],
  ];

  return (
    <div className="page">
      <EnergyBackground />
      <nav className="navbar">
        <div className="logo"><span><Zap size={16} /></span>SmartEnergy</div>
        <div className="nav-links"><a href="#features">Features</a><button onClick={openDashboard}>Dashboard</button><a href="#data">Data Sources</a><a href="#insights">Insights</a><a href="#project-line">Project Line</a></div>
        <Button onClick={openDashboard}>Start Tracking</Button>
      </nav>

      <section className="hero">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="badge">Ontario home energy intelligence</div>
          <h1>Track Your Home Energy Smarter</h1>
          <p>Estimate electricity costs with Ontario TOU rates, compare against typical residential usage, and discover smarter energy habits.</p>
          <div className="button-row"><Button onClick={openDashboard}>Start Dashboard</Button><Button secondary onClick={() => document.getElementById('insights')?.scrollIntoView({ behavior: 'smooth' })}>View Insights</Button></div>
        </motion.div>
        <EnergyNetwork model={model} />
      </section>

      <section className="stats-grid">
        {stats.map(([label, value, unit]) => <Card key={label}><p className="label">{label}</p><h2>{value}</h2><p className="muted">{unit}</p></Card>)}
      </section>

      <section id="data" className="section data-section">
        <p className="eyebrow blue-text">Core MVP Data Sources</p>
        <h2 className="section-title">Only two data sources. Still a complete SaaS concept.</h2>
        <div className="data-grid">
          <Card className="source-card"><Database color="#2563EB" /><h3>Ontario Energy Board</h3><p>Used for Time-of-Use electricity pricing and bill calculation.</p><div className="rate-row"><span>Off</span><b>9.8¢</b><span>Mid</span><b>15.7¢</b><span>On</span><b>20.3¢</b></div></Card>
          <Card className="source-card"><ShieldCheck color="#22C55E" /><h3>Ontario Average Household Usage</h3><p>Used as the benchmark for comparison, analytics, and scoring.</p><div className="benchmark">746 kWh/month</div></Card>
        </div>
      </section>

      <section id="features" className="section">
        <p className="eyebrow blue-text">Features</p>
        <h2 className="section-title">Calculator becomes analytics</h2>
        <div className="feature-grid">
          {features.map(([Icon, title, text]) => <Card key={title} className="feature-card"><Icon color="#2563EB" /><h3>{title}</h3><p>{text}</p></Card>)}
        </div>
      </section>

      <section className="section narrow">
        <Card className="timeline-card">
          <p className="eyebrow blue-text">How it works</p>
          <div className="timeline">
            {['Input Usage', 'Calculate Bill', 'Compare + Recommend'].map((step, i) => <div className="step" key={step}><span>{i + 1}</span><h3>{step}</h3></div>)}
          </div>
        </Card>
      </section>

      <section id="insights" className="section comparison">
        <Card><p className="label">Your Home</p><h2>820 kWh</h2></Card>
        <Card><p className="label">Ontario Average</p><h2>746 kWh</h2></Card>
        <div className="compare-line"><span className="avg-dot" /><span className="home-dot" /></div>
      </section>

      <section id="project-line" className="section project-line">
        <p className="eyebrow blue-text">Connected portfolio system</p>
        <h2 className="section-title">From energy behavior to adaptive city infrastructure</h2>
        <div className="project-line-grid">
          <a className="line-card archive-link" href={POWER_IN_PRACTICE_URL}>
            <span>Research archive</span>
            <h3>Power in Practice</h3>
            <p>Frames the question: where does wasted energy show up in daily life and urban space?</p>
          </a>
          <a className="line-card dashboard-link" href="#top" onClick={(event) => { event.preventDefault(); openDashboard(); }}>
            <span>Data dashboard</span>
            <h3>SmartEnergy</h3>
            <p>Turns home electricity use, Ontario TOU rates, and behavior into measurable decisions.</p>
          </a>
          <a className="line-card lumen-link" href={LUMEN_SHIFT_URL}>
            <span>Urban solution</span>
            <h3>Lumen Shift</h3>
            <p>Applies the same energy logic to public lighting, photography, and sensor-based control.</p>
          </a>
        </div>
      </section>

      <section className="cta">
        <h2>Start Optimizing Your Energy Usage</h2>
        <Button onClick={openDashboard}>Open Dashboard</Button>
      </section>

      <footer><p>© 2026 SmartEnergy</p><div><span>Privacy</span><span>Terms</span><span>Contact</span></div></footer>
    </div>
  );
}

function InputSlider({ label, value, min, max, step = 1, suffix, onChange }) {
  return (
    <label className="input-card">
      <div><p className="label">{label}</p><strong>{value}{suffix}</strong></div>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function ChartFallback() {
  return <div className="chart-fallback">Loading chart...</div>;
}

const PERIOD_COLORS = {
  onPeak: '#EF4444',
  midPeak: '#F59E0B',
  offPeak: '#16A34A',
};

const APPLIANCE_COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#EF4444', '#7C3AED', '#64748B'];

function BillStack({ model }) {
  const rows = [
    ['Electricity', model.electricityCharge],
    ['Delivery + fixed', model.deliveryCharge],
    ['Regulatory', model.regulatoryCharge],
    ['HST', model.hst],
    ['OER credit', -model.oerCredit],
  ];

  return (
    <div className="bill-breakdown">
      {rows.map(([label, value]) => <span key={label}>{label} <b>{value < 0 ? '-' : ''}{formatMoney(Math.abs(value))}</b></span>)}
    </div>
  );
}

function ScenarioPresets({ activeScenario, applyScenario }) {
  return (
    <div className="scenario-strip" aria-label="Scenario presets">
      {Object.entries(SCENARIOS).map(([key, scenario]) => (
        <button key={key} className={activeScenario === key ? 'active' : ''} onClick={() => applyScenario(key)}>
          <span>{scenario.label}</span>
          <b>{scenario.monthlyUsage} kWh</b>
        </button>
      ))}
    </div>
  );
}

function OverviewScreen({ monthlyUsage, onPeakPercent, model, dayType, showBenchmark }) {
  const usageData = makeHourlyUsageData(monthlyUsage, dayType, model.billingProfile);
  const applianceData = makeApplianceData(monthlyUsage, model.billingProfile);
  const insights = buildInsights(monthlyUsage, onPeakPercent, model);
  const comparisonText = model.comparisonPercent >= 0 ? 'above average' : 'below average';

  return (
    <>
      <div className="metric-grid">
        {[
          ['Monthly Usage', monthlyUsage, 'kWh'],
          ['Estimated Bill', formatMoney(model.estimatedBill), 'after HST + OER'],
          ['Electricity Line', formatMoney(model.electricityCharge), 'TOU energy charge'],
          ['Efficiency Score', model.efficiencyScore, comparisonText],
        ].map(([l, v, u]) => <Card key={l}><p className="label">{l}</p><h2>{v}</h2><p className="muted">{u}</p></Card>)}
      </div>

      <div className="dash-grid">
        <Card className="chart-card">
          <div className="chart-head"><div><p className="label">24-Hour Usage</p><h3>{dayType === 'weekday' ? 'Weekday' : 'Weekend'} demand curve</h3></div><p className="muted">coloured by TOU period</p></div>
          <Suspense fallback={<ChartFallback />}>
            <HourlyUsageChart data={usageData} colors={PERIOD_COLORS} />
          </Suspense>
        </Card>

        <Card className="bill-card">
          <p className="label">Full Bill Estimate</p><h2>{formatMoney(model.estimatedBill)}</h2><p className="muted">{model.profile.label} billing profile</p>
          <BillStack model={model} />
          <div className="bill-bar"><span style={{ width: `${Math.min(100, monthlyUsage / 12)}%` }} /></div>
          <p className="bill-note">Your usage is {Math.abs(model.comparisonPercent).toFixed(1)}% {comparisonText}.</p>
          <CostScopeNote />
        </Card>
      </div>

      <div className="dash-grid lower">
        {showBenchmark && <Card className="comparison-card"><p className="label">Ontario Comparison</p><h3>Your Home vs Average Household</h3><div className="large-compare-line"><span className="avg-marker" style={{ left: '54%' }}>746</span><span className="home-marker" style={{ left: `${Math.min(92, Math.max(12, (monthlyUsage / 1200) * 100))}%` }}>{monthlyUsage}</span></div></Card>}
        <Card className="savings-card"><p className="label">Appliance Breakdown</p><h2>{applianceData[0].value} kWh</h2><p>{applianceData[0].name} is the largest modeled load in this profile.</p></Card>
      </div>

      <Card className="appliance-card">
        <div className="chart-head"><div><p className="label">Appliance Loads</p><h3>Monthly kWh by category</h3></div><p className="muted">{model.profile.label}</p></div>
        <div className="appliance-layout">
          <Suspense fallback={<ChartFallback />}>
            <ApplianceBreakdownChart data={applianceData} colors={APPLIANCE_COLORS} />
          </Suspense>
          <div className="appliance-list">
            {applianceData.map((item, index) => <span key={item.name}><i style={{ background: APPLIANCE_COLORS[index % APPLIANCE_COLORS.length] }} />{item.name}<b>{item.value} kWh</b></span>)}
          </div>
        </div>
      </Card>

      <div className="recommendations">
        {insights.map(([title, text]) => <Card key={title} className="rec-card"><Lightbulb color="#22C55E" /><div><h3>{title}</h3><p>{text}</p></div></Card>)}
      </div>
    </>
  );
}

function UsageScreen({ monthlyUsage, model, dayType }) {
  const usageData = makeHourlyUsageData(monthlyUsage, dayType, model.billingProfile);
  const touData = [
    { name: 'On-Peak', kwh: +model.onPeakKwh.toFixed(0), rate: `${formatRate(OEB_TOU_RATES.onPeak)} / kWh`, cost: formatMoney(model.onPeakKwh * OEB_TOU_RATES.onPeak) },
    { name: 'Mid-Peak', kwh: +model.midPeakKwh.toFixed(0), rate: `${formatRate(OEB_TOU_RATES.midPeak)} / kWh`, cost: formatMoney(model.midPeakKwh * OEB_TOU_RATES.midPeak) },
    { name: 'Off-Peak', kwh: +model.offPeakKwh.toFixed(0), rate: `${formatRate(OEB_TOU_RATES.offPeak)} / kWh`, cost: formatMoney(model.offPeakKwh * OEB_TOU_RATES.offPeak) },
  ];
  return (
    <div className="usage-layout">
      <Card className="chart-card">
        <div className="chart-head"><div><p className="label">24-Hour Usage</p><h3>{dayType === 'weekday' ? 'Weekday' : 'Weekend'} hourly curve</h3></div><p className="muted">kWh by hour</p></div>
        <Suspense fallback={<ChartFallback />}>
          <HourlyUsageChart data={usageData} colors={PERIOD_COLORS} height={380} interval={1} />
        </Suspense>
      </Card>
      <div className="stack">
        <Card className="tou-card"><p className="label">TOU Breakdown</p><h3>{monthlyUsage} kWh monthly</h3>{touData.map(row => <div className="tou-row" key={row.name}><div><b>{row.name}</b><p className="muted">{row.kwh} kWh · {row.rate}</p></div><span className="tou-pill">{row.cost}</span></div>)}<CostScopeNote /></Card>
        <Card className="source-detail"><p className="label">Bill Stack</p><h2>{formatMoney(model.estimatedBill)}</h2><BillStack model={model} /></Card>
      </div>
    </div>
  );
}

function InsightsScreen({ monthlyUsage, onPeakPercent, model }) {
  const insights = buildInsights(monthlyUsage, onPeakPercent, model);
  return (
    <div className="insights-layout">
      <Card className="insight-hero"><p className="label">Rule-Based AI Insights</p><h2>{formatMoney(model.potentialSavings)}</h2><p>Estimated monthly savings if 15% of on-peak usage shifts to off-peak hours.</p></Card>
      <div className="rec-list">{insights.map(([title, text]) => <Card key={title} className="rec-card"><Sparkles color="#22C55E" /><div><h3>{title}</h3><p>{text}</p></div></Card>)}</div>
    </div>
  );
}

function ComparisonScreen({ monthlyUsage, model, showBenchmark }) {
  const userLeft = Math.min(94, Math.max(8, (monthlyUsage / 1200) * 100));
  return (
    <div className="comparison-layout">
      {showBenchmark ? <Card className="comparison-card"><p className="label">Ontario Household Benchmark</p><h3>Your home compared with 746 kWh/month</h3><div className="comparison-meter"><span className="fill" style={{ width: `${userLeft}%` }} /><span className="meter-label" style={{ left: '62%' }}>Ontario Average · 746</span><span className="meter-label" style={{ left: `${userLeft}%` }}>Your Home · {monthlyUsage}</span></div><p className="bill-note">You are {Math.abs(model.comparisonPercent).toFixed(1)}% {model.comparisonPercent >= 0 ? 'above' : 'below'} the Ontario average household.</p></Card> : <Card className="comparison-card"><p className="label">Benchmark Hidden</p><h3>Ontario comparison is turned off</h3><p className="bill-note">Use Settings to bring the benchmark back into the dashboard.</p></Card>}
      <div className="mini-grid"><Card><p className="label">Your Usage</p><h2>{monthlyUsage}</h2><p className="muted">kWh/month</p></Card><Card><p className="label">Estimated Bill</p><h2>{formatMoney(model.estimatedBill)}</h2><p className="muted">after credits and tax</p></Card><Card><p className="label">Score</p><h2>{model.efficiencyScore}</h2><p className="muted">efficiency</p></Card></div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return <button type="button" className={checked ? 'toggle on' : 'toggle'} aria-pressed={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

function SettingsScreen({ monthlyUsage, model, showBenchmark, setShowBenchmark, billingProfile, setBillingProfile, dayType, setDayType, resetScenario }) {
  return (
    <div className="settings-layout">
      <Card className="settings-card">
        <p className="label">Settings</p>
        <h3>Dashboard preferences</h3>
        <p>These controls change the scenario and are saved on this browser.</p>
        <label className="field-row"><span>Billing profile</span><select value={billingProfile} onChange={(event) => setBillingProfile(event.target.value)}>{Object.entries(BILLING_PROFILES).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></label>
        <label className="field-row"><span>Usage mode</span><select value={dayType} onChange={(event) => setDayType(event.target.value)}><option value="weekday">Weekday</option><option value="weekend">Weekend</option></select></label>
        <div className="settings-row"><span>Show Ontario benchmark</span><Toggle checked={showBenchmark} onChange={setShowBenchmark} label="Show Ontario benchmark" /></div>
        <div className="settings-row"><span>Use OEB TOU pricing</span><Toggle checked={true} onChange={() => {}} label="Use OEB TOU pricing" /></div>
        <Button secondary onClick={resetScenario}>Reset Scenario</Button>
      </Card>
      <div className="export-box"><p className="label">Current Scenario</p><h3>{monthlyUsage} kWh</h3><p className="muted">On-Peak {model.onPeakPercent}% · Mid-Peak {model.midPeakPercent}% · Off-Peak {model.offPeakPercent}%</p><BillStack model={model} /><CostScopeNote /></div>
    </div>
  );
}

function DataAssumptions({ model }) {
  return (
    <Card className="assumption-card">
      <div className="assumption-head"><div><p className="label">Data assumptions</p><h3>Sources and model notes</h3></div><p className="muted">Last verified {LAST_VERIFIED}</p></div>
      <div className="rate-table">
        <span><b>Off-Peak</b>{formatRate(OEB_TOU_RATES.offPeak)}</span>
        <span><b>Mid-Peak</b>{formatRate(OEB_TOU_RATES.midPeak)}</span>
        <span><b>On-Peak</b>{formatRate(OEB_TOU_RATES.onPeak)}</span>
        <span><b>OER</b>{(ONTARIO_ELECTRICITY_REBATE * 100).toFixed(1)}%</span>
      </div>
      <div className="assumption-grid">
        <div><b>OEB TOU prices</b><span>Effective Nov 1, 2025. Off {formatRate(OEB_TOU_RATES.offPeak)}, Mid {formatRate(OEB_TOU_RATES.midPeak)}, On {formatRate(OEB_TOU_RATES.onPeak)}.</span></div>
        <div><b>Summer periods</b><span>May 1 to Oct 31: on-peak weekdays 11 AM-5 PM; weekends and holidays off-peak.</span></div>
        <div><b>Benchmark</b><span>746 kWh/month is used only as a product comparison benchmark.</span></div>
        <div><b>Bill model</b><span>{model.profile.label}: delivery {formatRate(model.profile.deliveryRate)}/kWh plus {formatMoney(model.profile.fixedCharge)} fixed charge before HST/OER.</span></div>
      </div>
      <div className="source-links">
        <a href={OEB_RATES_URL} target="_blank" rel="noreferrer">OEB electricity rates</a>
        <a href={OEB_ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">Nov 2025 rate announcement</a>
        <a href={ONTARIO_OER_URL} target="_blank" rel="noreferrer">Ontario OER information</a>
      </div>
    </Card>
  );
}

function Dashboard({ backHome, monthlyUsage, setMonthlyUsage, onPeakPercent, setOnPeakPercent, midPeakPercent, setMidPeakPercent, model, showBenchmark, setShowBenchmark, billingProfile, setBillingProfile, dayType, setDayType, resetScenario, activeScenario, applyScenario, scenarioLabel }) {
  const [active, setActive] = useState('Overview');
  const reportInsights = buildInsights(monthlyUsage, onPeakPercent, model);
  const menu = [[Home, 'Overview'], [LineChart, 'Usage'], [Lightbulb, 'Insights'], [BarChart3, 'Comparison'], [Settings, 'Settings']];
  const descriptions = {
    Overview: 'Energy overview with bill estimate, comparison, savings, and recommendations.',
    Usage: 'Detailed Time-of-Use usage breakdown and OEB cost model.',
    Insights: 'Rule-based smart recommendations based on your usage pattern.',
    Comparison: 'Ontario average household benchmark and efficiency score.',
    Settings: 'Prototype preferences and current scenario summary.',
  };

  return (
    <div className="dashboard-page">
      <EnergyBackground />
      <aside className="sidebar">
        <button className="logo sidebar-logo" onClick={backHome}><span><Zap size={16} /></span>SmartEnergy</button>
        {menu.map(([Icon, label]) => <button key={label} onClick={() => setActive(label)} className={active === label ? 'side-item active' : 'side-item'} aria-current={active === label ? 'page' : undefined}><Icon size={18} />{label}</button>)}
        <div className="sidebar-note"><p>Data Sources</p><span>OEB TOU Rates</span><span>Ontario 746 kWh Benchmark</span></div>
      </aside>

      <main className="dash-main">
        <div className="mobile-topbar"><Button secondary onClick={backHome} ariaLabel="Back to home"><ArrowLeft size={16} /> Home</Button><Button onClick={() => exportEnergyReport({ monthlyUsage, onPeakPercent, midPeakPercent, model, insights: reportInsights, showBenchmark, scenarioLabel, dayType })} ariaLabel="Export report"><FileText size={16} /> Export</Button></div>
        <div className="mobile-tabs" aria-label="Dashboard sections">{menu.map(([Icon, label]) => <button key={label} onClick={() => setActive(label)} className={active === label ? 'active' : ''} aria-current={active === label ? 'page' : undefined}><Icon size={16} /><span>{label}</span></button>)}</div>
        <div className="page-title-row"><div><p className="eyebrow blue-text">{active}</p><h1>{active === 'Overview' ? 'Energy Overview' : active}</h1><p className="muted">{descriptions[active]}</p></div><Button onClick={() => exportEnergyReport({ monthlyUsage, onPeakPercent, midPeakPercent, model, insights: reportInsights, showBenchmark, scenarioLabel, dayType })}><FileText size={16} /> Export Report</Button></div>

        <div className="tariff-strip" aria-label="Ontario time-of-use rates">
          {tariffRows.map(([period, rate, detail, color]) => <span key={period}><i style={{ background: color }} /> <b>{period}</b> {rate} <em>{detail}</em></span>)}
        </div>

        <ScenarioPresets activeScenario={activeScenario} applyScenario={applyScenario} />

        <div className="input-grid">
          <InputSlider label="Monthly Usage" value={monthlyUsage} min={300} max={1400} suffix=" kWh" onChange={setMonthlyUsage} />
          <InputSlider label="On-Peak Usage" value={model.onPeakPercent} min={5} max={70} suffix="%" onChange={(value) => {
            setOnPeakPercent(value);
            setMidPeakPercent(Math.min(midPeakPercent, 100 - value));
          }} />
          <InputSlider label="Mid-Peak Usage" value={model.midPeakPercent} min={0} max={Math.max(0, 100 - model.onPeakPercent)} suffix="%" onChange={setMidPeakPercent} />
        </div>

        {active === 'Overview' && <OverviewScreen monthlyUsage={monthlyUsage} onPeakPercent={onPeakPercent} model={model} dayType={dayType} showBenchmark={showBenchmark} />}
        {active === 'Usage' && <UsageScreen monthlyUsage={monthlyUsage} model={model} dayType={dayType} />}
        {active === 'Insights' && <InsightsScreen monthlyUsage={monthlyUsage} onPeakPercent={onPeakPercent} model={model} />}
        {active === 'Comparison' && <ComparisonScreen monthlyUsage={monthlyUsage} model={model} showBenchmark={showBenchmark} />}
        {active === 'Settings' && <SettingsScreen monthlyUsage={monthlyUsage} model={model} showBenchmark={showBenchmark} setShowBenchmark={setShowBenchmark} billingProfile={billingProfile} setBillingProfile={setBillingProfile} dayType={dayType} setDayType={setDayType} resetScenario={resetScenario} />}
        <DataAssumptions model={model} />
      </main>
    </div>
  );
}

function App() {
  const defaultState = {
    monthlyUsage: 820,
    onPeakPercent: 35,
    midPeakPercent: 0,
    billingProfile: 'detached',
    dayType: 'weekday',
    showBenchmark: true,
    activeScenario: 'detached',
  };
  const [savedState, setSavedState] = useState(() => {
    try {
      return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return defaultState;
    }
  });
  const [view, setView] = useState('dashboard');
  const [monthlyUsage, setMonthlyUsage] = useState(savedState.monthlyUsage);
  const [onPeakPercent, setOnPeakPercent] = useState(savedState.onPeakPercent);
  const [midPeakPercent, setMidPeakPercent] = useState(savedState.midPeakPercent);
  const [billingProfile, setBillingProfile] = useState(savedState.billingProfile);
  const [dayType, setDayType] = useState(savedState.dayType);
  const [showBenchmark, setShowBenchmark] = useState(savedState.showBenchmark);
  const [activeScenario, setActiveScenario] = useState(savedState.activeScenario);
  const model = calculateEnergyModel(monthlyUsage, onPeakPercent, midPeakPercent, billingProfile);

  useEffect(() => {
    const nextState = { monthlyUsage, onPeakPercent, midPeakPercent: model.midPeakPercent, billingProfile, dayType, showBenchmark, activeScenario };
    setSavedState(nextState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }, [monthlyUsage, onPeakPercent, model.midPeakPercent, billingProfile, dayType, showBenchmark, activeScenario]);

  function applyScenario(key) {
    const scenario = SCENARIOS[key];
    if (!scenario) return;
    setActiveScenario(key);
    setMonthlyUsage(scenario.monthlyUsage);
    setOnPeakPercent(scenario.onPeakPercent);
    setMidPeakPercent(scenario.midPeakPercent);
    setBillingProfile(scenario.billingProfile);
    setDayType(scenario.dayType);
  }

  function resetScenario() {
    setMonthlyUsage(defaultState.monthlyUsage);
    setOnPeakPercent(defaultState.onPeakPercent);
    setMidPeakPercent(defaultState.midPeakPercent);
    setBillingProfile(defaultState.billingProfile);
    setDayType(defaultState.dayType);
    setShowBenchmark(defaultState.showBenchmark);
    setActiveScenario(defaultState.activeScenario);
  }

  return view === 'landing'
    ? <LandingPage openDashboard={() => setView('dashboard')} model={model} />
    : <Dashboard backHome={() => setView('landing')} monthlyUsage={monthlyUsage} setMonthlyUsage={(value) => { setActiveScenario('custom'); setMonthlyUsage(value); }} onPeakPercent={onPeakPercent} setOnPeakPercent={(value) => { setActiveScenario('custom'); setOnPeakPercent(value); }} midPeakPercent={midPeakPercent} setMidPeakPercent={(value) => { setActiveScenario('custom'); setMidPeakPercent(value); }} model={model} showBenchmark={showBenchmark} setShowBenchmark={setShowBenchmark} billingProfile={billingProfile} setBillingProfile={(value) => { setActiveScenario('custom'); setBillingProfile(value); }} dayType={dayType} setDayType={(value) => { setActiveScenario('custom'); setDayType(value); }} resetScenario={resetScenario} activeScenario={activeScenario} applyScenario={applyScenario} scenarioLabel={SCENARIOS[activeScenario]?.label || 'Custom Scenario'} />;
}

createRoot(document.getElementById('root')).render(<App />);
