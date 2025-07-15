import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Ticks,
} from "chart.js";
import { color } from "motion/react";

// Register required Chart.js components
ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

// Tipar la prop data
interface LineChartProps {
  data: any;
}

const LineChart = ({ data }: LineChartProps) => {
  // Chart Options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
      },
    },
    scales: {
      x: {
        grid: { display: false }, // Hide grid lines on X-axis
        border: {
          display: true,
          color: "black",
        },
      },
      y: {
        grid: {
          lineWidth: 2,
        },
        beginAtZero: true,
        ticks: {
          callback: (val: string | number) => String(val),
        },
      },
    },
  };

  return (
    <div className="w-full h-full">
      <Line data={data} options={options} />
    </div>
  );
};

export default LineChart;
