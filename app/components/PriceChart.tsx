'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  TooltipContentProps,
  TooltipPayloadEntry,
  TooltipValueType,
} from 'recharts';

interface PricePoint {
  date: string;
  price: number;
  ema8?: number;
  ema20?: number;
  ema50?: number;
  volume?: number;
}

interface PriceChartProps {
  data?: PricePoint[];
}

function formatTooltipValue(value: TooltipValueType | undefined) {
  if (Array.isArray(value)) {
    return value.map(formatNumericValue).join(', ');
  }

  return formatNumericValue(value);
}

function formatNumericValue(value: TooltipValueType | undefined) {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }

  return value ?? '';
}

function formatAxisLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatTooltipLabel(value: string | number | undefined) {
  if (typeof value !== 'string') {
    return value ?? '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatCurrencyTick(value: string | number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return `$${value}`;
  }

  return `$${numeric.toFixed(2)}`;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: TooltipContentProps<TooltipValueType, string | number>) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: 'var(--color-bg-panel)',
          border: '2px solid var(--color-border-dark)',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '4px 4px 0px var(--color-border-dark)',
          color: 'var(--color-text-main)',
        }}
      >
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>{formatTooltipLabel(label)}</p>
        {payload.map((entry, index: number) => {
          const item = entry as TooltipPayloadEntry;
          return (
            <div
              key={index}
              style={{ color: item.color, fontSize: '0.9rem', marginBottom: '4px' }}
            >
              {item.name}: ${formatTooltipValue(item.value)}
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

export default function PriceChart({ data }: PriceChartProps) {
  const safeData = data ?? [];

  if (safeData.length === 0) {
    return (
      <div className="chart-empty-state">
        <strong>No price data yet</strong>
        <span>Run ingestion a few times over time to build a usable chart.</span>
      </div>
    );
  }

  if (safeData.length === 1) {
    return (
      <div className="chart-empty-state">
        <strong>Only one snapshot available</strong>
        <span>Historical trend lines need at least two points. Ingest again later to build history.</span>
      </div>
    );
  }

  const values = safeData.flatMap((point) =>
    [point.price, point.ema8, point.ema20, point.ema50].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    ),
  );
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue;
  const padding = spread === 0 ? Math.max(Math.abs(maxValue) * 0.08, 0.5) : spread * 0.2;
  const yDomain: [number, number] = [minValue - padding, maxValue + padding];
  const yTicks = buildTicks(yDomain[0], yDomain[1], 5);
  return (
    <div className="price-chart-frame">
      <ResponsiveContainer width="100%" height="100%" aspect={2.1} minWidth={320} minHeight={320}>
        <LineChart data={safeData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'var(--font-pixel)' }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            interval="preserveStartEnd"
            tickFormatter={formatAxisLabel}
          />
          <YAxis
            domain={yDomain}
            ticks={yTicks}
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'var(--font-pixel)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCurrencyTick}
          />
          <Tooltip content={CustomTooltip} />

          <Line
            type="monotone"
            dataKey="price"
            name="Price"
            stroke="var(--color-border-dark)"
            strokeWidth={3}
            dot={{ r: 4, fill: '#fff', stroke: 'var(--color-border-dark)', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'var(--color-accent-primary)' }}
          />
          <Line type="monotone" dataKey="ema8" name="8 EMA" stroke="var(--color-accent-gold)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          <Line type="monotone" dataKey="ema20" name="20 EMA" stroke="var(--color-accent-cyan)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          <Line type="monotone" dataKey="ema50" name="50 EMA" stroke="var(--color-accent-magenta)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildTicks(min: number, max: number, count: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count <= 1) {
    return [min, max].filter(Number.isFinite);
  }

  if (min === max) {
    return [Number(min.toFixed(2))];
  }

  const step = (max - min) / (count - 1);
  const ticks: number[] = [];

  for (let index = 0; index < count; index += 1) {
    ticks.push(Number((min + step * index).toFixed(2)));
  }

  return Array.from(new Set(ticks));
}
