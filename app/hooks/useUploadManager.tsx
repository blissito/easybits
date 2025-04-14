import { nanoid } from "nanoid";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
// @ts-ignore
import { useUploadMultipart } from "react-hook-multipart/react";

export type UploadManager = {
  addFiles: (arg0: File[], config?: LocalConfig) => void;
  getFiles: () => File[];
  tasks: Task[];
  clearTask: (arg0: string) => void;
};

type LocalConfig = {
  access: "public-read" | "private";
};

const taskMap = new Map();

export type Task = {
  id: string;
  index?: number;
  file: File;
  percentage: number;
  status: "Pending" | "Working" | "Done";
  thumbnail: undefined; // get frame from encoding blob? @todo
};

type useUploadManagerInput = {
  onTaskEnd?: (task: Task) => void;
};

export const useUploadManager = (input?: useUploadManagerInput) => {
  const { onTaskEnd } = input || {};
  const fileInputRef = useRef<HTMLInputElement>(null);
  taskMap.set("files", []);
  const [tasks, setTasks] = useState<Task[]>([]);

  const clearTask = (id: string) => {
    if (
      taskMap.get(id).status === "Done" ||
      taskMap.get(id).status === "Error"
    ) {
      taskMap.delete(id);
      updateState();
    }
    // @todo abort
  };

  const createTask = (file: File): Task => {
    return {
      id: nanoid(3),
      file,
      percentage: 0,
      status: "Pending",
      thumbnail: undefined, // get frame from encoding blob? @todo
    };
  };

  const updateState = () => {
    const o = Object.fromEntries(taskMap);
    delete o.files;
    const reversed = Object.values(o) as Task[];
    reversed.reverse();
    setTasks(reversed);
  };

  const startUpload = (taskId: string, access: string) => {
    const { upload } = useUploadMultipart({ access }); // used here because the access limitation (upload should receive access too)
    const task: Task = taskMap.get(taskId);
    upload(task.file.name, task.file, ({ percentage }) => {
      task.percentage = percentage;
      task.status = "Working";
      taskMap.set(taskId, task); // using a closure 🌻
      updateState();
      // @todo onEnd callback should exist
      if (percentage >= 100) {
        task.status = "Done";
        onTaskEnd?.(task);
        console.info("::TASK_FINISHED::", task.file.name);
      }
    });
    console.info("::UPLOAD_STARTED_FOR::", task.file.name);
  };

  const addFiles = (newFiles: File[], localConfig?: LocalConfig) => {
    const { access = "private" } = localConfig || {};

    taskMap.set("files", taskMap.get("files").concat(newFiles));
    const newTasks = newFiles.map((file) => createTask(file));
    newTasks.forEach((task) => {
      taskMap.set(task.id, task);
      // here we need to detonate the upload
      startUpload(task.id, access);
    });
    updateState();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.currentTarget.files) return;

    const fileArray = [...event.currentTarget.files];
    fileArray.concat(taskMap.get("files"));
    taskMap.set("files", fileArray);
    updateState();
  };

  useEffect(() => {
    if (!fileInputRef.current) return;
    // @ts-expect-error
    fileInputRef.current.addEventListener("change", handleChange);
    return () => {
      // @ts-expect-error
      fileInputRef.current?.removeEventListener("change", handleChange);
    };
  }, []);

  return {
    tasks,
    addFiles,
    getFiles() {
      return taskMap.get("files");
    },
    clearTask,
  } as UploadManager;
};
