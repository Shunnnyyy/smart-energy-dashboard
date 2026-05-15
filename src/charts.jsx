import React from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart as ReBarChart, Bar, Cell, PieChart, Pie
} from 'recharts';

export function HourlyUsageChart({ data, colors, height = 290, interval = 2 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart data={data}>
        <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
        <XAxis dataKey="time" axisLine={false} tickLine={false} interval={interval} tick={{ fill: '#64748B', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid rgba(15,23,42,0.08)' }} formatter={(value, name, item) => [`${value} kWh`, item.payload.periodLabel]} />
        <Bar dataKey="usage" radius={[6, 6, 0, 0]}>
          {data.map(item => <Cell key={item.time} fill={colors[item.period]} />)}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}

export function ApplianceBreakdownChart({ data, colors }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
          {data.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
        </Pie>
        <Tooltip formatter={(value) => [`${value} kWh`, 'Monthly usage']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
