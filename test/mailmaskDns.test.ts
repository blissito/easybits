import { describe, it, expect } from "vitest";
import { easybitsDnsRecords, planDnsUndo, planDnsWrite } from "../app/.server/core/mailmaskOperations";

const want = easybitsDnsRecords("fancyfiles.app", "easybits-verify-abc", true);

describe("conector Mailmask: escribir y deshacer DNS", () => {
  it("pide TXT, comodín y (con raíz) A + www hacia el fierro", () => {
    expect(want.map((r) => `${r.type} ${r.name}`)).toEqual([
      "TXT _easybits-verify.fancyfiles.app",
      "CNAME *.fancyfiles.app",
      "A fancyfiles.app",
      "CNAME www.fancyfiles.app",
    ]);
    expect(want[2].values).toEqual(["54.38.94.14"]);
  });

  it("guarda la foto previa: el A y el www viejos, null donde no había nada; no reescribe lo idéntico", () => {
    const current = [
      { name: "fancyfiles.app", type: "A", values: ["76.76.21.21"] },
      { name: "www.fancyfiles.app", type: "CNAME", values: ["cname.vercel-dns.com"] },
      { name: "*.fancyfiles.app", type: "CNAME", values: ["cname.sandboxes.easybits.cloud."] },
    ];
    const { upserts, previous } = planDnsWrite(want, current);
    expect(previous["fancyfiles.app|A"]?.values).toEqual(["76.76.21.21"]);
    expect(previous["_easybits-verify.fancyfiles.app|TXT"]).toBeNull();
    expect(upserts.map((r) => r.type + " " + r.name)).not.toContain("CNAME *.fancyfiles.app");
  });

  it("re-configurar conserva la foto ORIGINAL, no la de nuestros propios registros", () => {
    const first = planDnsWrite(want, [{ name: "fancyfiles.app", type: "A", values: ["76.76.21.21"] }]);
    const again = planDnsWrite(want, want, first.previous);
    expect(again.previous["fancyfiles.app|A"]?.values).toEqual(["76.76.21.21"]);
  });

  it("deshacer restaura lo previo, borra lo que no existía y NO toca lo que el usuario cambió después", () => {
    const managed = {
      zoneId: "z1",
      zone: "fancyfiles.app",
      written: want,
      previous: { "fancyfiles.app|A": { name: "fancyfiles.app", type: "A", values: ["76.76.21.21"] }, "www.fancyfiles.app|CNAME": null, "_easybits-verify.fancyfiles.app|TXT": null, "*.fancyfiles.app|CNAME": null },
    };
    const current = [
      ...want.filter((r) => r.name !== "www.fancyfiles.app"),
      { name: "www.fancyfiles.app", type: "CNAME", values: ["otro.host.com"] }, // lo cambió la persona
    ];
    const { restore, remove, skipped } = planDnsUndo(managed, current);
    expect(restore.map((r) => r.values[0])).toEqual(["76.76.21.21"]);
    expect(remove.map((r) => r.name).sort()).toEqual(["*.fancyfiles.app", "_easybits-verify.fancyfiles.app"]);
    expect(skipped).toEqual(["www.fancyfiles.app|CNAME"]);
  });
});
