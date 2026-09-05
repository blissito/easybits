import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * Los workflows de GitHub Actions no se validan en ningún lado, y un YAML que
 * no parsea NO da un error útil: el run aparece en rojo con CERO jobs y la API
 * responde 404 a las anotaciones. Además GitHub deja de registrar sus triggers,
 * así que `gh workflow run` contesta "Workflow does not have 'workflow_dispatch'
 * trigger" aunque esté escrito en el archivo.
 *
 * Pasó de verdad: un `run: echo "algo: otra cosa"` de una sola línea — los dos
 * puntos seguidos de espacio abren un mapa anidado. Dentro de un `run: |` no
 * habría pasado.
 */

const DIR = join(process.cwd(), ".github/workflows");

const files = readdirSync(DIR).filter(
  (f) => f.endsWith(".yml") || f.endsWith(".yaml")
);

describe("GitHub Actions", () => {
  it("hay workflows que revisar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s es YAML válido y tiene triggers y jobs", (file) => {
    const doc = parse(readFileSync(join(DIR, file), "utf8"));
    expect(doc).toBeTypeOf("object");

    // `on` es YAML 1.1 truthy: algunos parsers lo entregan bajo la clave `true`.
    const triggers = doc.on ?? doc[true as unknown as keyof typeof doc];
    expect(triggers, `${file} no declara triggers`).toBeTruthy();

    expect(Object.keys(doc.jobs ?? {}).length, `${file} no declara jobs`)
      .toBeGreaterThan(0);
  });

  it("publish-packages solo publica desde un tag, nunca desde un push a main", () => {
    const doc = parse(
      readFileSync(join(DIR, "publish-packages.yml"), "utf8")
    );
    const triggers = doc.on ?? doc[true as unknown as keyof typeof doc];
    // Sin `tags`, un push a main publicaría a npm en cada commit.
    expect(triggers.push?.tags).toBeTruthy();
    expect(triggers.push?.branches).toBeUndefined();
  });
});
