import { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';

interface Emotion {
  name: string;
  intensity: number;
}

interface ReflectionData {
  emotions: Emotion[];
  wisdom: {
    id: string;
    theme?: string;
    emotionalThemes?: string[];
  };
  timestamp: number;
}

interface AnalyticsProps {
  history: ReflectionData[];
  onClose: () => void;
}

const COLORS = ['#5A5A40', '#8C8C8C', '#1A1A1A', '#A0A0A0', '#D1D1C7', '#2c2c2c'];

export function Analytics({ history, onClose }: AnalyticsProps) {
  // 1. Emotion distribution (Radar Chart)
  const emotionData = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(entry => {
      entry.emotions?.forEach(e => {
        counts[e.name] = (counts[e.name] || 0) + e.intensity;
      });
    });
    return Object.entries(counts).map(([name, val]) => ({
      name,
      value: Number(val.toFixed(2))
    })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [history]);

  // 2. Category-wise volume (Pie Chart)
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(entry => {
      const themes = entry.wisdom?.emotionalThemes || [];
      themes.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [history]);

  // 3. Daily Active Reflections (Line Chart)
  const activityData = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      counts[date] = (counts[date] || 0) + 1;
    });
    return Object.entries(counts).map(([date, count]) => ({
      date,
      count
    })).reverse();
  }, [history]);

  // 4. Verse Usage (Bar Chart)
  const verseUsageData = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(entry => {
      const id = entry.wisdom?.id;
      if (id) {
        counts[id] = (counts[id] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([id, count]) => ({
      id,
      count
    })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <p className="font-serif italic text-xl opacity-40">Not enough data for analytics yet.</p>
        <button onClick={onClose} className="mt-4 text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]">Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <div className="flex justify-between items-center bg-[#fcfcf9] p-6 rounded-2xl border border-black/5">
        <div>
          <h2 className="font-serif italic text-2xl">Spiritual Analytics</h2>
          <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold">Aggregated Insights from your Path</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors text-[#5A5A40]">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Emotion Radar */}
        <div className="card p-6 min-h-[400px] flex flex-col">
          <label className="text-[11px] uppercase tracking-wider mb-6 opacity-60 font-semibold">Average Emotion Intensity</label>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={emotionData}>
                <PolarGrid stroke="#e6e6da" />
                <PolarAngleAxis dataKey="name" tick={{ fill: '#5A5A40', fontSize: 10 }} />
                <Radar
                  name="Intensity"
                  dataKey="value"
                  stroke="#5A5A40"
                  fill="#5A5A40"
                  fillOpacity={0.6}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Pie */}
        <div className="card p-6 min-h-[400px] flex flex-col">
          <label className="text-[11px] uppercase tracking-wider mb-6 opacity-60 font-semibold">Themes Explored</label>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Line */}
        <div className="card p-6 min-h-[300px] flex flex-col col-span-1 md:col-span-2">
          <label className="text-[11px] uppercase tracking-wider mb-6 opacity-60 font-semibold">Daily Active Reflections</label>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0e6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#5A5A40" 
                  strokeWidth={2} 
                  dot={{ r: 4, fill: '#5A5A40' }} 
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Verse Bar Chart */}
        <div className="card p-6 min-h-[400px] flex flex-col col-span-1 md:col-span-2">
          <label className="text-[11px] uppercase tracking-wider mb-6 opacity-60 font-semibold">Most Frequently Retrieved Wisdom</label>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={verseUsageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0e6" />
                <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} />
                <YAxis dataKey="id" type="category" tick={{ fontSize: 12, fontWeight: 'bold' }} axisLine={false} width={60} />
                <Tooltip cursor={{ fill: '#fcfcf9' }} />
                <Bar 
                  dataKey="count" 
                  fill="#5A5A40" 
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
