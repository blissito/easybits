// import { createUserKeys, getUserOrRedirect } from "~/.server/getters";
// import type { Route } from "./+types/home";
// import { CopyButton } from "~/components/common/CopyButton";
// import { useRef, useState, type ChangeEvent } from "react";
// import { db } from "~/.server/db";
// import {
//   FaCheck,
//   FaCopy,
//   FaEye,
//   FaEyeSlash,
//   FaSpinner,
//   FaTrash,
// } from "react-icons/fa";
// import { useFetcher, useSubmit } from "react-router";
// import { LuFileWarning } from "react-icons/lu";
// import { cn } from "~/utils/cn";
// import { FileUploadProgress } from "~/components/upload/FileUploadProgress";
// import { FaLockOpen } from "react-icons/fa6";
// import ProfileLayout from "~/components/ProfileLayout/ProfileLayout";
// import type { Asset } from "@prisma/client";

// const MB = 1024 * 1024;

// export function meta() {
//   return [
//     { title: "easyBits Dashboard" },
//     { name: "description", content: "All your files as easy bits" },
//   ];
// }

// // @todo this will be moved to dash maybe
// export const loader = async ({ request }: Route.LoaderArgs) => {
//   let user = await getUserOrRedirect(request);
//   if (!user.publicKey || !user.host) {
//     user = await createUserKeys(user);
//   }
//   // load assets
//   const assets = await db.asset.findMany({
//     where: { userId: user.id },
//     orderBy: { createdAt: "desc" },
//   });
//   return { user, assets };
// };

// export default function Home({ loaderData }: Route.ComponentProps) {
//   const fetcher = useFetcher();
//   const isFetching = fetcher.state !== "idle";
//   const { user = {}, assets = [] } = loaderData || {};
//   const fileInput = useRef<HTMLInputElement>(null);
//   const [files, setFiles] = useState<File[]>([]);
//   const [copied, setCopied] = useState<string | undefined>();

//   const handleAssetSelection = () => {
//     fileInput.current?.click();
//   };

//   const __experiment__handleFileInputChange = (
//     event: ChangeEvent<HTMLInputElement>
//   ) => {
//     // @todo not working 🤔
//     setFiles((fls) => fls.concat(Array.from(event.currentTarget?.files || [])));
//   };

//   const onUploadComplete = (fileName: string) => {
//     setFiles((fls) => fls.filter((f) => f.name !== fileName));
//   };

//   const handleDelete = async (storageKey: string) => {
//     if (!storageKey || !confirm("Esta acción no es reversible")) return;

//     fetcher.submit(null, {
//       method: "DELETE",
//       action: `/api/v1/uploads/${storageKey}/delete`,
//     });
//   };

//   const [showKey, setShowKey] = useState(false);

// }

// export const Table = async () => {
//   return (
//     <>
//       <FileUploadProgress files={files} onUploadComplete={onUploadComplete} />
//       <article className="py-24 flex-col flex  gap-6 min-h-screen mx-6 max-w-4xl">
//         <nav className="grid gap-4">
//           <section>
//             <h2>Secret key</h2>
//             <div className="flex gap-2">
//               <input
//                 disabled
//                 className={cn(
//                   "border p-3 rounded-2xl w-[320px]",
//                   "cursor-pointer pointer-events-none"
//                 )}
//                 type={showKey ? "text" : "password"}
//                 value={user.publicKey}
//               />
//               <button onClick={() => setShowKey((k) => !k)}>
//                 {showKey ? <FaEye /> : <FaEyeSlash />}
//               </button>
//               <CopyButton text={user.publicKey as string} />
//             </div>
//           </section>
//           <section className="grid">
//             <h2>Dominio gratis</h2>
//             <a
//               className="p-4"
//               rel="noreferrer"
//               target="_blank"
//               href={`https://${user.host}.easybits.cloud`}
//             >
//               <input
//                 disabled
//                 className={cn(
//                   "border p-3 rounded-2xl w-[320px]",
//                   "cursor-pointer pointer-events-none"
//                 )}
//                 type="text"
//                 value={`https://${user.host}.easybits.cloud`}
//               />
//             </a>
//           </section>
//         </nav>
//         <section>
//           <nav className="w-full bg-indigo-500 flex items-cente gap-2 px-4 py-2">
//             <h2>Todos tus assets</h2>
//             <button
//               disabled={isFetching}
//               onClick={handleAssetSelection}
//               className={cn(
//                 "ml-auto",
//                 "bg-indigo-800 p-3 rounded-2xl text-gray-100",
//                 "disabled:pointer-events-none disabled:bg-gray-500"
//               )}
//             >
//               {isFetching ? (
//                 <p className="animate-spin">
//                   <FaSpinner />
//                 </p>
//               ) : (
//                 "Nuevo Asset"
//               )}
//             </button>
//             <button
//               disabled
//               className={cn(
//                 "bg-indigo-800 p-3 rounded-2xl text-gray-300",
//                 "disabled:bg-gray-400",
//                 "hover:cursor-not-allowed"
//               )}
//             >
//               Nuevo asset privado
//             </button>
//             <input
//               onChange={__experiment__handleFileInputChange}
//               type="file"
//               hidden
//               ref={fileInput}
//               multiple
//             />
//           </nav>
//           <>
//             {assets.map((asset: Asset) => (
//               <div
//                 className={cn(
//                   "p-3 bg-gray-900 grid grid-cols-12 text-xs items-center gap-x-2",
//                   "relative",
//                   "group",
//                   "text-white"
//                 )}
//                 key={asset.id}
//               >
//                 <button
//                   onClick={() => handleDelete(asset.storageKey)}
//                   className="active:scale-90 invisible group-hover:visible absolute top-[30%] right-4"
//                 >
//                   <FaTrash />
//                 </button>

//                 <span className="col-span-2 truncate">{asset.storageKey}</span>

//                 <span className="col-span-3 truncate">
//                   {asset.metadata?.originalName}
//                 </span>

//                 <div className="col-span-1 flex items-center gap-2">
//                   {/* <FaRegCheckCircle /> */}
//                   <button
//                     popoverTarget="copy_text"
//                     onClick={() => {
//                       setCopied(asset.storageKey);
//                       setTimeout(() => setCopied(undefined), 1500);
//                       navigator.clipboard.writeText(
//                         asset.publicLink ||
//                           `https://${"easybits-dev"}.fly.storage.tigris.dev/${
//                             asset.storageKey
//                           }`
//                       );
//                     }}
//                   >
//                     {copied === asset.storageKey ? <FaCheck /> : <FaCopy />}
//                   </button>
//                   <span popover="auto" id="copy_text">
//                     public link copied
//                   </span>
//                 </div>

//                 <p className="flex gap-1 items-center col-span-2">
//                   {asset.isPublic ? (
//                     <div className="text-green-300 flex gap-2 items-center">
//                       <span>público</span>
//                       <span>
//                         <FaLockOpen />
//                       </span>
//                     </div>
//                   ) : (
//                     <span className="text-yellow-300 ">
//                       <LuFileWarning />
//                     </span>
//                   )}
//                 </p>

//                 <CopyButton
//                   className="col-span-2"
//                   text={`https://easybits-dev.fly.storage.tigris.dev/${asset.storageKey}`}
//                   // text={`https://www.easybits.cloud/videos/${asset.storageKey}`}
//                 >
//                   <span>{asset.contentType}</span>
//                 </CopyButton>

//                 <p className="col-span-2">
//                   {(Number(asset.size) / (1000 * 1000)).toFixed(2)} MiB
//                 </p>
//               </div>
//             ))}
//           </>
//         </section>
//       </article>
//     </>
//   );
// };
