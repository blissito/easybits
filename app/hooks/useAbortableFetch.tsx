import { useEffect, useRef, useState } from "react";

export const useAbortableFetch = (url: string, init?: RequestInit) => {
  const controller = useRef<AbortController>(new AbortController()).current;
  const [data, setData] = useState(null);

  const fetchData = async () => {
    const rsp = await fetch(url, { ...init, signal: controller.signal });
    // const contentTypeHeader = rsp.headers.get('content-type');
    setData(await rsp.json());
  };

  // @todo could be json or text
  useEffect(() => {
    fetchData();
  }, []);
  return {
    data,
    abort: (reason?: string) => controller.abort(reason),
  };
};
