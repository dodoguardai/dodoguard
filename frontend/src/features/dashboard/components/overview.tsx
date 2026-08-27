import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

const defaultMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const defaultData = defaultMonths.map((name) => ({ name, total: 0 }));

export interface OverviewProps {
  /** Monthly activity from dashboard stats (last 12 months). If missing, shows zeros. */
  data?: Array<{ name: string; total: number }>;
}

export function Overview({ data }: OverviewProps) {
  const chartData = data && data.length > 0 ? data : defaultData;

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          direction="ltr"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => String(value)}
        />
        <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
      </BarChart>
    </ResponsiveContainer>
  );
}
