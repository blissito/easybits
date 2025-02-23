import { nanoid } from "nanoid";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
// @ts-ignore
import { useUploadMultipart } from "react-hook-multipart/react";

export type UploadManager = {
  addFiles: (arg0: File[]) => void;
  getFiles: () => File[];
  tasks: Task[];
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

export const useUploadManager = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  taskMap.set("files", []);
  const [tasks, setTasks] = useState<Task[]>([]);
  console.log("Local Tasks: ", tasks);
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
    console.log("Tasks? ", o);
    setTasks(Object.values(o));
  };

  const addFiles = (
    newFiles: File[],
    localConfig: LocalConfig = { access: "private" | "public-read" }
  ) => {
    const { access } = localConfig;
    console.info("ACCESS", access);
    taskMap.set("files", taskMap.get("files").concat(newFiles));
    const newTasks = newFiles.map((file) => createTask(file));
    newTasks.forEach((task) => {
      taskMap.set(task.id, task);
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

  // upload stuff
  //   const { upload: put } = useUploadMultipart({
  //     access, // public or private
  //   });

  //   const putFile = async () => {
  //     await put(task.id, task.file, handleLocalProgress);
  //     submit(null); // refresh list
  //     setTimeout(() => onClose?.(task.id), 3000);
  //   };

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
  } as UploadManager;
};
