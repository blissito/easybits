import { useState, useCallback, useRef } from "react";

const MAX_STACK = 30;

export function useUndoStack<T>() {
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushUndo = useCallback((snapshot: T) => {
    undoStack.current.push(JSON.parse(JSON.stringify(snapshot)));
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback((current: T): T | null => {
    if (undoStack.current.length === 0) return null;
    redoStack.current.push(JSON.parse(JSON.stringify(current)));
    const prev = undoStack.current.pop()!;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    return prev;
  }, []);

  const redo = useCallback((current: T): T | null => {
    if (redoStack.current.length === 0) return null;
    undoStack.current.push(JSON.parse(JSON.stringify(current)));
    const next = redoStack.current.pop()!;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    return next;
  }, []);

  return { pushUndo, undo, redo, canUndo, canRedo };
}
