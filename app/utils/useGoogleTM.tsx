import { useEffect } from "react";

export default (id?: string): void => {
  const tag = id || "G-96ZXW099GD";
  useEffect(() => {
    const script1 = document.createElement("script");
    const script2 = document.createElement("script");
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${tag}`;
    script2.innerText = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${tag}');
        `;
    document.head.appendChild(script1);
    document.head.appendChild(script2);
  }, []);
};
