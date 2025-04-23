import { nanoid } from "nanoid";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

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
  file: File;
  percentage: number;
  status: "Pending" | "Working" | "Done";
  thumbnail: undefined; // get frame from encoding blob? @todo
  index?: number;
  abortController: AbortController;
};

type useUploadManagerInput = {
  onTaskEnd?: (task: Task) => void;
};

let abortController: AbortController;
const getAbortController = () => {
  // reset controller to upload other files
  if (abortController?.signal.aborted) {
    abortController = new AbortController();
    return;
  }
  return (abortController ??= new AbortController()) as AbortController;
};

export const useUploadManager = (input?: useUploadManagerInput) => {
  const { onTaskEnd } = input || {};
  const fileInputRef = useRef<HTMLInputElement>(null);
  taskMap.set("files", []);
  const [tasks, setTasks] = useState<Task[]>([]);

  const findTask = (id: string) => tasks.find((t) => t.id === id);

  const clearTask = (id: string) => {
    taskMap.delete(id);
    updateState();
  };

  const createTask = (file: File): Task => {
    const id = nanoid(3);
    // const ac = getAbortController();
    const ac = new AbortController();
    ac.signal.addEventListener("abort", () => {
      console.info("::TRYING_TO_ABORT::");
      clearTask(id);
    });
    return {
      id,
      file,
      percentage: 0,
      status: "Pending",
      thumbnail: undefined, // get frame from encoding blob? @todo
      abortController: ac, // @todo:revisit is this gonna be used for every upload?
    };
  };

  const updateState = () => {
    const o = Object.fromEntries(taskMap);
    delete o.files;
    const reversed = Object.values(o) as Task[];
    reversed.reverse();
    setTasks(reversed);
  };

  const startUpload = (taskId: string, access: "public-read" | "private") => {
    const task: Task = taskMap.get(taskId);
    const { upload } = useUploadMultipart({
      access,
      signal: task.abortController.signal,
    }); // used here because the access limitation (upload should receive access too)

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
