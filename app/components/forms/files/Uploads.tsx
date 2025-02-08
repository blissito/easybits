import { useEffect, useRef, useState } from "react";
import { useUploadMultipart } from "react-hook-multipart/react";
import { motion } from "motion/react";
import { FaCloudArrowUp } from "react-icons/fa6";
import { FaRegCheckCircle } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import { cn } from "~/utils/cn";
import { useSubmit } from "react-router";

export type Task = {
  id: string;
  file: File;
  index: number;
  progress: number; // 0-1
};

export const ActiveUploads = ({
  files,
  access,
  onFileComplete,
}: {
  access?: "public-read" | "private";
  files: File[];
  onFileComplete?: (arg0: string) => void;
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

  const removeDone = (id: string) => {
    const updated: Record<string, Task> = { ...tasks };
    delete updated[id];
    setTasks(updated);
    onFileComplete?.(id);
  };

  if (length < 1) return null;
  return (
    <motion.section layoutId="FilesFormModal">
      {iterable.map((task, i) => (
        <Upload key={i} access={access} task={task} onClose={removeDone} />
      ))}
    </motion.section>
  );
};

const Upload = ({
  access = "public-read",
  task,
  onClose,
}: {
  onClose?: (arg0: string) => void;
  access?: "public-read" | "private";
  task: Task;
}) => {
  const submit = useSubmit();
  const mounted = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(1);

  const handleLocalProgress = ({ percentage }) => {
    setProgress(percentage);
  };

  const { upload: put } = useUploadMultipart({
    access, // public or private
  });

  const putFile = async () => {
    await put(task.id, task.file, handleLocalProgress);
    submit(null); // refresh list
    setTimeout(() => onClose?.(task.id), 3000);
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
          ) : progress > 99 ? (
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
          style={{ maxWidth: `${progress}%` }}
          className={cn(
            "bg-brand-500 absolute inset-0 rounded-full transition-all",
            {
              "bg-green-600": progress > 99,
            }
          )}
        />
      </div>
    </div>
  );
};
