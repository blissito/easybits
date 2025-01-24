import { Form } from "react-router";
import { Input } from "~/components/common/Input";
import { AuthNav } from "~/components/login/auth-nav";

export default function DomainsRoute() {
  return (
    <>
      <AuthNav user={{}} />
      <article className="pt-24 px-4 mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold tracking-wider">
          Agrega tu propio dominio
        </h1>
        <Form className="gap-4 py-10 flex flex-col">
          <Input
            placeholder="assets.hectorbliss.com"
            name="hostName"
            label="¿Cuál es tu dominio?"
          />
          <div className="grid gap-4 flex-wrap grid-cols-2">
            <Input
              name="A"
              label="Registro A"
              disabled
              value="66.241.125.189"
              copy="66.241.125.189"
            />
            <Input
              name="AAAA"
              label="Registro AAAA"
              disabled
              value="2a09:8280:1::55:1e4e:0"
              copy="2a09:8280:1::55:1e4e:0"
            />
          </div>
          <Input
            name="challenge"
            label="Registro CNAME"
            disabled
            value="_acme-challenge.www"
          />
          <Input
            name="value"
            label="Valor del registro"
            disabled
            value="assets.hectorbliss.com.x5oq83.fixterdns.net."
          />
        </Form>
      </article>
    </>
  );
}
