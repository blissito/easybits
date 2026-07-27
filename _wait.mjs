import { execSync } from "node:child_process";
for (let i=0;i<60;i++) {
  const r = JSON.parse(execSync("gh run list --limit 1 --json status,conclusion,headSha").toString())[0];
  if (r.status === "completed" && r.headSha.startsWith("705b02de")) { console.log("DEPLOY", r.conclusion, r.headSha.slice(0,8)); break; }
  await new Promise(x=>setTimeout(x,20000));
}
