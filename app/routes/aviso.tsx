import { useEffect, type ReactNode } from "react";
import { Footer } from "~/components/common/Footer";
import { AuthNav } from "~/components/login/auth-nav";
import getBasicMetaTags from "~/utils/getBasicMetaTags";

export const meta = () =>
  getBasicMetaTags({
    title: "Aviso de Privacidad | EasyBits",
    description:
      "Aviso de privacidad y protección de datos personales de EasyBits Cloud.",
  });

export default function Index() {
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, []);
  return (
    <main className="bg-brand_dark">
      <AuthNav />
      <Content />
      <Footer />
    </main>
  );
}

const Content = () => {
  return (
    <section className="py-32 lg:py-40 max-w-7xl mx-auto px-4 md:px-[5%] 2xl:px-0">
      <div className="bg-coverInfo bg-center  h-56 rounded-xl border-2 border-black p-6 flex flex-col justify-center items-start">
        <h2 className=" text-4xl lg:text-6xl font-bold text-brand_dark leading-tight flex flex-wrap items-center justify-start ">
          Aviso de Privacidad
        </h2>
        <p className="mt-4">Última actualización: 29 de Mayo 2025</p>{" "}
      </div>
      <div className="mt-10 lg:mt-20">
        <p>
          EasyBits Cloud, en cumplimiento con lo dispuesto por la Ley Federal de
          Protección de Datos Personales en Posesión de los Particulares, hace
          de su conocimiento el presente Aviso de Privacidad, a fin de
          informarle sobre el tratamiento que se dará a los datos personales que
          usted nos proporciona a través de nuestro sitio web
          https://www.easybits.cloud (en adelante, el “Sitio”).
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          1. Identidad del Responsable
        </h3>
        <p className="mt-4">
          El responsable del tratamiento de sus datos personales es EasyBits
          Cloud (en adelante, “EasyBits”), quien los utilizará conforme a las
          finalidades establecidas en este Aviso.
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          2. Datos personales que se recaban
        </h3>
        <p className="mt-4">
          Los datos personales que podremos recabar directamente de usted o a
          través del uso del Sitio son:
        </p>
        <ul className="mt-4">
          <li>&bull; Nombre completo</li>
          <li>&bull; Dirección de correo electrónico</li>
          <li>&bull; Empresa u organización</li>
        </ul>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          3. Finalidades del tratamiento
        </h3>
        <p className="my-4">
          Sus datos personales serán tratados para las siguientes finalidades:
        </p>
        <p>Finalidades primarias: :</p>
        <ul className="mt-4">
          <li>&bull; Proveer los productos y servicios solicitados.</li>
          <li>&bull; Dar cumplimiento a obligaciones contractuales.</li>
          <li>
            &bull; Contactarlo para dar seguimiento a servicios, soporte técnico
            o aclaraciones.
          </li>
          <li>&bull; Facturación y cobro de servicios.</li>
          <li>
            &bull; Envío de actualizaciones o avisos importantes sobre el
            servicio.
          </li>
        </ul>
        <p>Finalidades secundarias:</p>
        <ul className="mt-4">
          <li>
            &bull; Envío de promociones, boletines informativos y comunicaciones
            de marketing.
          </li>
          <li>
            &bull; Realización de encuestas de satisfacción y estudios de
            mercado.
          </li>
        </ul>
        <p className="mt-4">
          Si no desea que sus datos se utilicen para finalidades secundarias,
          puede manifestarlo enviando un correo a: soporte@easybits.cloud.
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          4. Uso de cookies y tecnologías de rastreo
        </h3>
        <p className="my-4">
          Nuestro Sitio no utiliza cookies, web beacons u otras tecnologías
          similares para monitorear su comportamiento como usuario de Internet.
          La única cookie que utilizamos es para verificar al usuario y mantener
          su sesión abierta en el navegador.
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          5. Transferencias de datos
        </h3>
        <p className="my-4">
          Sus datos personales no serán transferidos a terceros sin su
          consentimiento, salvo en los casos permitidos por la ley, como a
          proveedores que prestan servicios en nuestro nombre bajo cláusulas de
          confidencialidad.
        </p>
        <h3
          id="aplicaciones-conectadas"
          className="font-title font-bold text-2xl text-brand_dark mt-6"
        >
          5 bis. Aplicaciones conectadas (Claude, ChatGPT y otros clientes
          MCP) / Connected apps (Claude, ChatGPT and other MCP clients)
        </h3>
        <p className="my-4">
          <strong>Qué ve el conector.</strong> Cuando usted conecta una
          aplicación externa (por ejemplo Claude, de Anthropic, o ChatGPT, de
          OpenAI) a su cuenta mediante el conector MCP de EasyBits, la autoriza
          expresamente en una pantalla de consentimiento. La aplicación sólo
          puede leer y modificar, en su nombre, los recursos de la cuenta que la
          autorizó (archivos, documentos, bases de datos, sitios, cajas de
          cómputo), nunca los de otros usuarios. EasyBits sólo le entrega el
          resultado de cada herramienta que invoca; no le envía su contraseña ni
          sus llaves de API.
        </p>
        <p className="my-4">
          <strong>Qué guardamos y qué no.</strong> EasyBits no recibe ni guarda
          el contenido de sus conversaciones con el asistente externo: sólo
          recibe las llamadas a herramientas que el asistente decide hacer. Lo
          que esas llamadas crean o modifican (un archivo, un documento, una
          fila) se guarda en su cuenta como cualquier otro recurso suyo. Para
          cobrar y medir el uso registramos, por cada operación con costo, el
          tipo de operación, las fichas consumidas, el modelo, los tokens y la
          duración, sin el contenido. De la conexión guardamos el nombre de la
          aplicación, sus direcciones de retorno y un hash de cada token de
          renovación (nunca el token en claro). Las llaves de proveedor que se
          pasen en la URL del conector no se guardan: viven sólo durante la
          petición.
        </p>
        <p className="my-4">
          <strong>Retención.</strong> Los tokens de acceso caducan en una hora;
          los de renovación, en 90 días, y se reemplazan por uno nuevo en cada
          uso. Los registros de la conexión y de uso se conservan mientras su
          cuenta exista, o hasta que usted pida su eliminación.
        </p>
        <p className="my-4">
          <strong>Sus controles.</strong> Puede retirar el acceso en cualquier
          momento desde su panel (Developer → Claude.ai → Apps conectadas),
          desconectando la aplicación; el acceso se corta al instante, incluido
          el token que estuviera en uso. Para eliminar su cuenta o los datos
          asociados, escriba a soporte@easybits.cloud (ver Derechos ARCO). El
          tratamiento que la aplicación externa haga de la información se rige
          por su propio aviso de privacidad.
        </p>
        <p className="my-4">
          <strong>What the connector sees.</strong> When you connect an external
          app (for example Claude, by Anthropic, or ChatGPT, by OpenAI) to your
          account through the EasyBits MCP connector, you explicitly authorize
          it on a consent screen. The app can only read and change, on your
          behalf, the resources of the account that authorized it (files,
          documents, databases, sites, compute sandboxes), never other
          users&apos;. EasyBits only returns the result of each tool it calls;
          it never shares your password or API keys.
        </p>
        <p className="my-4">
          <strong>What we store and what we don&apos;t.</strong> EasyBits does
          not receive or store the content of your conversations with the
          external assistant; it only receives the tool calls the assistant
          chooses to make. Whatever those calls create or change (a file, a
          document, a row) is stored in your account like any other resource.
          For billing and usage metering we log, for each billable operation,
          the operation type, credits used, model, token counts and duration,
          without the content. For the connection itself we keep the app name,
          its redirect URLs and a hash of each refresh token (never the token in
          clear). Provider keys passed in the connector URL are not stored; they
          only live for the duration of the request.
        </p>
        <p className="my-4">
          <strong>Retention.</strong> Access tokens expire after one hour;
          refresh tokens after 90 days and are rotated on every use. Connection
          and usage records are kept while your account exists, or until you
          ask us to delete them.
        </p>
        <p className="my-4">
          <strong>Your controls.</strong> You can revoke access at any time from
          your dashboard (Developer → Claude.ai → Connected apps) by
          disconnecting the app; access stops immediately, including any token
          in use. To delete your account or its data, write to
          soporte@easybits.cloud (see ARCO rights). The external app&apos;s own
          handling of that data is governed by its privacy policy.
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          6. Derechos ARCO
        </h3>
        <p className="my-4">Usted tiene derecho a:</p>
        <ul className="mt-4">
          <li>&bull; Acceder a sus datos personales.</li>
          <li>&bull; Rectificarlos si son inexactos o incompletos.</li>
          <li>
            &bull; Cancelarlos cuando considere que no se requieren para las
            finalidades señaladas.
          </li>
          <li>
            &bull; Oponerse al tratamiento de los mismos para fines específicos.
          </li>
        </ul>
        <p className="mt-4">
          Puede ejercer sus derechos ARCO enviando un correo electrónico a
          soporte@easybits.cloud, indicando su nombre completo, la relación que
          tiene con nosotros, el derecho que desea ejercer y una descripción
          clara de su solicitud.
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          7. Cambios al Aviso de Privacidad
        </h3>
        <p className="my-4">
          Nos reservamos el derecho de modificar este Aviso de Privacidad en
          cualquier momento. Las modificaciones estarán disponibles en el Sitio
          en la sección correspondiente. Se recomienda revisarlo periódicamente.
        </p>
        <h3 className="font-title font-bold text-2xl text-brand_dark mt-6">
          8. Contacto
        </h3>
        <p className="my-4">
          Para cualquier duda, comentario o solicitud relacionada con el
          presente Aviso de Privacidad, puede contactarnos en:
        </p>
        <p>
          📧 Correo electrónico:{" "}
          <a
            href="mailto:soporte@easybits.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 transition-all underline"
          >
            soporte@easybits.cloud
          </a>
        </p>
        <p>
          🌐 Sitio web:{" "}
          <a
            href="https://www.easybits.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 transition-all underline"
          >
            https://www.easybits.cloud
          </a>
        </p>
        <p></p>
      </div>
    </section>
  );
};
