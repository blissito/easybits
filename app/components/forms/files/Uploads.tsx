import { useState } from "react";
import { motion } from "motion/react";
import { FaCloudArrowUp } from "react-icons/fa6";
import { FaPause, FaRegCheckCircle } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import { cn } from "~/utils/cn";
import type { Task } from "~/hooks/useUploadManager";

export const ActiveUploads = ({ tasks }: { tasks: Task[] }) => {
  const length = Object.keys(tasks).length;
  const iterable = Object.values(tasks);

  if (length < 1) return null;
  return (
    <motion.section layoutId="FilesFormModal">
      {iterable.map((task) => (
        <Upload
          key={task.id}
          task={task}
          // onClose={removeDone} // @todo cancel (abort)
        />
      ))}
    </motion.section>
  );
};

const Upload = ({
  task,
}: {
  task: Task;
  onClose?: (arg0: string) => void;
  access?: "public-read" | "private";
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="border-b-2 border-dashed py-3 border-black">
      <nav className="flex items-center justify-between">
        <p className="font-medium truncate pr-1">{task.file.name}</p>
        <span className="text-xs px-1 text-brand-gray">
          {task.percentage < 1
            ? "Puesto en espera por el navegador"
            : task.percentage < 5
            ? "Separando en pedacitos"
            : `${task.percentage.toFixed(0)}%`}
        </span>
        <button
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "mr-1 text-xl hover:animate-none hover:scale-105 active:scale-100 transition-all",
            {
              "animate-pulse": task.percentage < 100,
            }
          )}
        >
          {isHovered ? (
            <IoMdCloseCircle />
          ) : task.percentage > 99 ? (
            <span className="text-green-700">
              <FaRegCheckCircle />
            </span>
          ) : task.percentage < 1 ? (
            <FaPause />
          ) : (
            <FaCloudArrowUp />
          )}
        </button>
      </nav>
      <div className="h-4 bg-black rounded-full border-2 border-black relative mt-1">
        <div
          style={{ maxWidth: `${task.percentage}%` }}
          className={cn(
            "bg-brand-500 absolute inset-0 rounded-full transition-all",
            {
              "bg-green-600": task.percentage > 99,
            }
          )}
        />
      </div>
    </div>
  );
};
