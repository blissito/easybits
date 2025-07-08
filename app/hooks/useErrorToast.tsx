import toast from "react-hot-toast";

export const useErrorToast = (text:string)=>()=>{
  toast.error(text, {
    style: {
      border: "2px solid #000000",
      padding: "16px",
      color: "#000000",
    },
  });
}