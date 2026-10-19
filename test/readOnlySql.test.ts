import { describe, expect, it } from "vitest";
import { assertReadOnlySql } from "~/.server/core/databaseOperations";

// La llave del copiloto (Bittor) sólo lee bases: esto es lo que la separa de escribir.
describe("assertReadOnlySql", () => {
  it.each([
    "SELECT count(*) FROM users",
    "select name, sql from sqlite_master where type in ('table','view');",
    "WITH t AS (SELECT 1 AS n) SELECT n FROM t",
    "PRAGMA table_info(users)",
  ])("deja leer: %s", (sql) => expect(() => assertReadOnlySql(sql)).not.toThrow());

  it.each([
    "DELETE FROM users",
    "UPDATE users SET admin = 1",
    "INSERT INTO users VALUES (1)",
    "DROP TABLE users",
    "WITH x AS (SELECT 1) DELETE FROM users",
    "SELECT 1; DELETE FROM users",
    "PRAGMA writable_schema = 1",
    "ATTACH DATABASE 'x' AS y",
  ])("rechaza: %s", (sql) => expect(() => assertReadOnlySql(sql)).toThrow());
});
