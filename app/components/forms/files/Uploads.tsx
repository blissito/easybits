import { useEffect, useRef, useState } from "react";
import { useUploadMultipart } from "react-hook-multipart/react";
import { motion } from "motion/react";
import { FaCloudArrowUp } from "react-icons/fa6";
import { FaRegCheckCircle } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import { cn } from "~/utils/cn";

export type Task = {
  id: string;
  file: File;
  index: number;
  progress: number; // 0-1
};

export const ActiveUploads = ({
  files,
  access,
}: {
  access?: "public-read" | "private";
  files: File[];
}) => {
  const [tasks, setTasks] = useState({});
  const length = Object.keys(tasks).length;
  const iterable: Task[] = Object.values(tasks);

  useEffect(() => {
    const ts: Record<string, Task> = {};
    files.forEach((file, index) => {
      ts[file.name] = {
        id: file.name,
        file,
        progress: 0,
        index,
      };
    });
    setTasks(ts);
  }, [files]);

  const updateProgress = (id: string, progress: number) => {
    const updated: Record<string, Task> = { ...tasks };
    updated[id] = { ...updated[id], progress };
    setTasks(updated);
  };

  if (length < 1) return null;
  return (
    <motion.section layoutId="FilesFormModal">
      {iterable.map((task, i) => (
        <Upload
          key={i}
          access={access}
          task={task}
          onProgress={(progress) => updateProgress(task.id, progress)}
        />
      ))}
    </motion.section>
  );
};

const Upload = ({
  access = "public-read",
  task,
  onProgress,
}: {
  access?: "public-read" | "private";
  onProgress?: (arg0: number) => void;
  task: Task;
}) => {
  const mounted = useRef(false);
  const [isHovered, setIsHovered] = useState(false);

  const { upload: put } = useUploadMultipart({
    access, // public or private
    onUploadProgress({ percentage }: { percentage: number }) {
      onProgress?.(percentage);
    },
  });

  const putFile = async () => {
    await put(task.id, task.file);
  };

  useEffect(() => {
    if (!mounted.current) {
      putFile();
    }
    mounted.current = true;
  }, []);

  return (
    <div className="border-b-2 border-dashed py-3 border-black">
      <nav className="flex items-center justify-between">
        <p className="font-medium truncate pr-1">{task.file.name}</p>
        <button
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="mr-1 text-xl animate-pulse hover:animate-none hover:scale-105 active:scale-100 transition-all"
        >
          {isHovered ? (
            <IoMdCloseCircle />
          ) : task.progress > 99 ? (
            <span className="text-green-700">
              <FaRegCheckCircle />
            </span>
          ) : (
            <FaCloudArrowUp />
          )}
        </button>
      </nav>
      <div className="h-4 bg-black rounded-full border-2 border-black relative mt-1">
        <div
          style={{ maxWidth: `${task.progress}%` }}
          className={cn(
            "bg-brand-500 absolute inset-0 rounded-full transition-all",
            {
              "bg-green-600": task.progress > 99,
            }
          )}
        />
      </div>
    </div>
  );
};
