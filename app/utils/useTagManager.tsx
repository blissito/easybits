import { useEffect } from "react";

export const useTagManager = () => {
  useEffect(() => {
    const script1 = document.createElement("script");
    const noscript = document.createElement("noscript");
    script1.async = true;
    script1.innerText = `
       (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','GTM-W9JM63Z3');
        `;
    noscript.innerHTML = `
     <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W9JM63Z3"
height="0" width="0" style="display:none;visibility:hidden"></iframe>
        `;
    document.head.appendChild(script1);
    document.body.appendChild(noscript);
  }, []);
};
