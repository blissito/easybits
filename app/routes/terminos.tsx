import { useEffect, type ReactNode } from "react";
import { Footer } from "~/components/common/Footer";
import { AuthNav } from "~/components/login/auth-nav";

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
      <div className="bg-white rounded-b-[40px] pb-0 md:pb-[120px]">
        <AuthNav />
        <div className="grid grid-cols-8 max-w-[90%] xl:max-w-7xl mx-auto gap-12 pt-32 md:pt-[240px] ">
          <div className="bg-coverInfo bg-center h-56 rounded-xl border-2 border-black p-6 col-span-8 flex items-center lg:hidden">
            <div>
              <h2 className=" text-4xl lg:text-6xl	font-bold text-brand_dark leading-tight flex flex-wrap items-center justify-start ">
                Términos y condiciones
              </h2>
              <p className="mt-4">Última actualización: 21 de Abril 2025</p>{" "}
            </div>
          </div>
          <Tabs />
          <Info />
        </div>
      </div>
      <Footer />
    </main>
  );
}

const Info = () => {
  return (
    <section className="col-span-8 lg:col-span-6  ">
      <div className="bg-coverInfo hidden lg:flex bg-center h-56 rounded-xl border-2 border-black p-6  items-center">
        <div>
          <h2 className=" text-4xl lg:text-6xl	font-bold text-brand_dark leading-tight flex flex-wrap items-center justify-start ">
            Términos y condiciones
          </h2>
          <p className="mt-4">Última actualización: 21 de Abril 2025</p>{" "}
        </div>
      </div>
      <div>
        <Clause id="uno" name="1. Generalidades">
          <p>
            Por favor, lea atentamente estos Términos y Condiciones antes de
            usar la plataforma EasyBits, en adelante "la Plataforma", accesible
            a través de www.easybits.cloud. Al registrarse, acceder o utilizar
            cualquier servicio de esta plataforma, usted acepta quedar vinculado
            legalmente a estos Términos.
          </p>
          <p className="mt-4">
            {" "}
            Cualquier persona que no acepte estos Términos y Condiciones, los
            cuales tienen un carácter obligatorio y vinculante, deberá
            abstenerse de navegar o utilizar la Plataforma y/o los Servicios. No
            está permitido el uso de los Servicios por personas menores de
            dieciocho años.
          </p>
        </Clause>
        <Clause id="dos" name="2. Definiciones">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">EasyBits:</strong> el que
              entrega los Servicios.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle"> Creador:</strong> tercero,
              empresa, persona moral, persona física o público en general quien
              lleva a cabo una actividad ecónomica que utiliza los Servicios del
              la Plataforma para distribuir assets digitales a los Usuarios
              Finales.{" "}
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle"> Comisión:</strong> porcentaje
              que el Creador paga a Stripe por cobrar y percibir los pagos de
              los Usuarios finales por cuenta y orden del Creador.
            </p>
            <p>
              <strong className="font-satoMiddle">Contracargo:</strong> disputa
              que realiza un Usuario Final respecto de un cargo realizado con
              Tarjeta y que puede resultar en una devolución del pago al Usuario
              Final.
            </p>
            <p>
              <strong className="font-satoMiddle"> Cuenta:</strong> sesión
              exclusiva del Creador por medio de la cual puede gestionar la
              prestación de los servicios otorgados por EasyBits y los servicios
              otorgados a sus Usuarios finales.
            </p>
            <p>
              <strong className="font-satoMiddle">Disputa:</strong> reclamación,
              queja o irreconocimiento de cualquier cargo o transacción
              financiera realizada a través de EasyBits/Stripe cuando se le haya
              instruido cobrar y percibir los pagos de los Usuarios finales por
              cuenta y orden del Creador.
            </p>
            <p>
              <strong className="font-satoMiddle">Plan(es):</strong> Planes o
              suscripciones ofrecidas por EasyBits al Creador para el uso de la
              plataforma.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">Plataforma:</strong> sitio web
              www.easybits.cloud
            </p>

            <p>
              <strong className="font-satoMiddle"> Funcionalidades:</strong> las
              prestaciones incluidas en los Planes otorgados por EasyBits al
              Creador.
            </p>
            <p>
              <strong className="font-satoMiddle"> Usuario final:</strong>{" "}
              persona que adquiere los Productos digitaltes del Creador a través
              de la Plataforma.
            </p>
          </div>
        </Clause>
        <Clause id="tres" name="3. Servicios/funcionalades de EasyBits">
          <div className="flex flex-col gap-4">
            <p>
              EasyBits comercializa y pone a disposición de los Creadores sus
              Servicios a través de la Plataforma. Los Creadores podrán
              contratar los Servicios a través de la Plataforma, en cualquiera
              de los Planes ofrecidos por EasyBits, mediante el pago de la
              Tarifa; por su parte, EasyBits se obliga a poner a disposición la
              Plataforma durante el plazo de la contratación.
            </p>
            <p>
              El Servicio consiste en poner a disposición del Creador un
              software como servicio, por el cual el Creador podrá realizar la
              gestión administrativa integral de su contenido, incluyendo la
              base de datos de clientes, configuración de assets digitales,
              entre otros.
            </p>
            <p>
              Adicionalmente, Stripe por medio de la Plataforma brindará
              servicios de valor agregado, incluyendo la actuación por orden del
              Creador para cobrar y percibir los pagos digitales de los Usuarios
              finales, además de la conciliación, prevención del fraude, entre
              otros.
            </p>
            <p>
              <strong className="font-satoMiddle">
                3.1. Los Servicios de EasyBits consisten en la puesta a
                disposición de su tecnología bajo el modelo “Software as a
                service”, cuyos atributos y funcionalidades son los siguientes:
              </strong>
            </p>{" "}
            <ul className="ml-4">
              <li>
                a. Entorno digital donde los usuarios pueden comprar y vender
                assets digitales, incluyendo pero no limitado a: archivos de
                diseño gráfico, plantillas web o de documentos, música y efectos
                de sonido, videos y animaciones, archivos de código fuente
                fotografías y recursos ilustrativos.
              </li>
              <li>b. Servicio de integraciones API</li>
              <li>
                c. Procesamiento de la base de datos de cada Creador, para
                cálculo de análisis de estos clientes y recomendaciones.
              </li>

              <li>d. Almacenamiento público y privado de archivos.</li>
            </ul>
            <p>
              La Plataforma actúa únicamente como intermediario tecnológico y no
              como distribuidor o propietario de los productos ofertados, a
              menos que se indique lo contrario.
            </p>
          </div>
        </Clause>
        <Clause id="cuatro" name="4. Uso de la API">
          <div className="flex flex-col gap-4">
            <p>
              La Plataforma pone a disposición de ciertos usuarios autorizados
              una Interfaz de Programación de Aplicaciones (API) para acceder de
              forma programática a algunas funcionalidades y datos de la
              plataforma. El acceso a esta API está sujeto a los siguientes
              términos:
            </p>
            <p>
              <strong className="font-satoMiddle">
                4.1. Acceso y Autenticación
              </strong>{" "}
            </p>
            <ul>
              <li>
                {" "}
                &bull; Para utilizar la API, se requiere una clave de acceso
                (API Key) personal e intransferible.
              </li>
              <li>
                &bull; Usted es responsable de mantener la confidencialidad de
                dicha clave.
              </li>
              <li>
                &bull; Cualquier acción realizada con su clave será considerada
                como realizada por usted.
              </li>
            </ul>
            <p>
              <strong className="font-satoMiddle">4.2. Uso Permitido</strong>{" "}
            </p>
            <p>Usted puede usar la API exclusivamente para:</p>
            <ul>
              <li>
                {" "}
                &bull; Integrar funcionalidades de la plataforma en su propia
                aplicación, sitio web o sistema.
              </li>
              <li>
                {" "}
                &bull; Acceder a archivos multimedia disponibles desde la
                cuenta.
              </li>
            </ul>
            <p>
              <strong className="font-satoMiddle">
                4.3. Restricciones de Uso
              </strong>{" "}
            </p>
            <p>No está permitido:</p>
            <ul>
              <li>
                {" "}
                &bull; Interferir con el rendimiento, estabilidad o seguridad de
                la plataforma.
              </li>
              <li> &bull; Compartir su clave de API con terceros.</li>
              <li>
                &bull; Realizar scraping fuera de los métodos y límites
                definidos por la API.
              </li>
              <li>
                &bull; Utilizar la API para crear servicios que compitan
                directamente con EasyBits.
              </li>
            </ul>
            <p>
              <strong className="font-satoMiddle">
                4.4. Límite de Peticiones
              </strong>{" "}
            </p>
            <p>
              La Plataforma podrá aplicar límites de uso (rate limits) por
              usuario, hora o día, según su plan o nivel de acceso.
            </p>
            <p>
              <strong className="font-satoMiddle">
                4.5. Terminación del Acceso
              </strong>{" "}
            </p>
            <p>La Plataforma se reserva el derecho de:</p>
            <ul>
              <li>
                {" "}
                &bull; Revocar o suspender su acceso a la API en cualquier
                momento y sin previo aviso, por razones de seguridad, abuso o
                incumplimiento de estos términos.
              </li>
              <li>
                {" "}
                &bull; Modificar o discontinuar la API, total o parcialmente, en
                cualquier momento.
              </li>
            </ul>
            <p>
              <strong className="font-satoMiddle">
                4.6. Exención de Garantías
              </strong>{" "}
              <p>
                La API se proporciona "tal cual", sin garantías de
                disponibilidad, velocidad o precisión. Su uso es bajo su propio
                riesgo.
              </p>
            </p>
          </div>
        </Clause>
        <Clause id="cinco" name="5. Funcionalidad de Comunidad EasyBits.">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">
                a. Definición de Comunidad EasyBits
              </strong>{" "}
              "Comunidad EasyBits" se refiere al marketplace proporcionado por
              EasyBits, en el cual los creadores que utilizan los servicios de
              EasyBits pueden aparecer enlistados y obtener ventas adicionales a
              través de búsquedas y compras de usuarios externos.
            </p>
            <p>
              <strong className="font-satoMiddle">
                b. Opción de Participación:
              </strong>{" "}
              La participación de un Creador en Comunidad EasyBits es
              completamente opcional y a elección del Creador.
            </p>
            <p>
              <strong className="font-satoMiddle">
                c. Posición en Comunidad EasyBits:
              </strong>{" "}
              La posición de un Creador dentro de las búsquedas de Comunidad
              EasyBits se determinará a discreción de EasyBits. Sin garantías de
              ubicación específica.
            </p>
            <p>
              <strong className="font-satoMiddle">
                d. Inclusión en Búsquedas:
              </strong>{" "}
              EasyBits se reserva el derecho de decidir si un Creador será
              incluido o no en las búsquedas de Comunidad EasyBits, y no estamos
              obligados a proporcionar explicaciones detalladas para cada caso.
            </p>
          </div>
        </Clause>
        <Clause id="seis" name="6. Registro y cuentas de usuario">
          <div className="flex flex-col gap-4">
            <p> Para vender o comprar, el usuario debe: </p>
            <ul>
              <li> &bull; Crear una cuenta.</li>
              <li>
                &bull; Declarar que tiene al menos 18 años o que es mayor de
                edad en su país de residencia.
              </li>
              <li>
                &bull; Ser responsable de la información que proporcione y de
                mantener la seguridad de su cuenta.{" "}
              </li>
            </ul>
            <p>
              La Plataforma puede suspender o cancelar cuentas que presenten
              actividad sospechosa o que violen estos términos.
            </p>
          </div>
        </Clause>
        <Clause id="siete" name="7. Sobre los vendedores">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">7.1. Subida de Assets</strong>{" "}
            </p>
            <p> Al subir un archivo, el vendedor:</p>
            <ul>
              <li>
                &bull; Declara y garantiza que es el único propietario legal del
                contenido o que tiene derechos suficientes para venderlo.
              </li>
              <li>
                &bull; Acepta que la venta y distribución del asset no infringe
                derechos de autor, marcas registradas, patentes ni otros
                derechos de terceros.
              </li>
              <li>
                &bull; Otorga a la Plataforma una licencia no exclusiva, mundial
                y libre de regalías para alojar, mostrar, promocionar y
                distribuir dicho asset a través de su sitio web.
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-4 mt-4">
            <p>
              <strong className="font-satoMiddle">
                7.2. Revisión de contenido
              </strong>{" "}
            </p>
            <p>
              {" "}
              La Plataforma se reserva el derecho de revisar, aprobar, rechazar
              o eliminar cualquier asset sin previo aviso, especialmente si:
            </p>
            <ul>
              <li> &bull; Contiene material ofensivo, ilegal o engañoso.</li>
              <li> &bull; Viola derechos de propiedad intelectual.</li>
              <li> &bull; Incumple normas técnicas o de calidad.</li>
            </ul>
          </div>
        </Clause>
        <Clause id="ocho" name="8. Sobre los compradores">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">8.1. Licencias</strong>
            </p>
            <p>
              Al adquirir un asset, el comprador no compra el contenido en sí,
              sino una licencia de uso. El vendedor puede establecer las
              condiciones de la licencia, pero, por defecto, se aplicará la
              licencia estándar de la plataforma, que incluye:
            </p>
            <ul>
              <li>
                &bull; Uso permitido para proyectos personales y comerciales.
              </li>
              <li>
                &bull; Prohibición de revender, redistribuir o sublicenciar el
                asset.
              </li>
              <li>
                &bull; Prohibición de utilizarlo en actividades ilegales o con
                fines difamatorios.
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-4 mt-4">
            <p>
              <strong className="font-satoMiddle">
                8.2. No hay derecho a reembolso
              </strong>{" "}
            </p>
            <p>
              {" "}
              Dado que los productos son digitales y se entregan de forma
              inmediata, no se aceptan devoluciones ni reembolsos, salvo en
              casos de:
            </p>
            <ul>
              <li>&bull; Archivos corruptos o imposibles de usar.</li>
              <li>
                &bull; Contenido que claramente no coincide con la descripción.
              </li>
              <li>&bull; Doble cobro accidental.</li>
            </ul>
          </div>
        </Clause>

        <Clause id="nueve" name="9. Tarifas y Comisiones">
          <div className="flex flex-col gap-4">
            <p>
              {" "}
              La Plataforma ofrece a los Creadores distintos Planes, con una
              propuesta de valor y contenido diferenciado, los cuales se pueden
              pagar de manera mensual. El precio dependerá del Plan elegido.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">
                {" "}
                9.1. Forma de pago del Plan.{" "}
              </strong>{" "}
            </p>
            <p>
              {" "}
              El pago podrá realizarse mediante tarjeta de crédito o débito.
            </p>
            <p>
              El Creador deberá indicar los datos necesarios y veraces para la
              correcta facturación y tratamiento tributario que corresponda,
              liberando a EasyBits de las responsabilidades por la inexactitud
              en la entrega de la información. Deberá señalar el Creador un
              contacto para las gestiones de facturación correspondiente.
            </p>
            <p>
              Todos los gastos en que se incurra para la realización del pago o
              derivados de su cancelación serán a cargo del Creador.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">
                {" "}
                9.2. Cambio en los Planes, Tarifas y Comisiones.
              </strong>{" "}
            </p>
            <p>
              {" "}
              EasyBits se encuentra facultado para realizar cualquier cambio en
              los Planes, Tarifas o Comisiones con aviso previo de 30 días
              mediante correo electrónico enviado a la casilla informada por el
              Creador; en cuyo caso el Creador podrá poner término a los
              Servicios, mediante comunicación escrita a EasyBits, en cuyo caso
              será aplicable la cláusula 13 de este instrumento.
            </p>
            <p>
              El Creador puede cambiar el Plan en cualquier momento. Si como
              consecuencia de ese cambio existe un mayor (o menor) valor
              respecto de lo pagado anteriormente, éste será cobrado de
              inmediato o se verá reflejado como un descuento en el mes
              siguiente a la modificación, según corresponda.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle"> 9.3. Impuestos.</strong>
            </p>
            <p>
              El Creador es el único obligado de pagar cualquier tipo de
              impuesto derivado del uso de la Plataforma y/o la prestación de
              sus servicios a los Usuarios finales.
            </p>
          </div>
        </Clause>
        <Clause id="diez" name="10. Propiedad intelectual">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">10.1. De los usuarios</strong>
            </p>
            <p>
              {" "}
              Cada vendedor (Creador) conserva la propiedad intelectual de los
              contenidos que sube. Al usar la plataforma, el vendedor concede
              una licencia limitada para la distribución de sus assets.
            </p>
          </div>
          <div className="flex flex-col gap-4 mt-4">
            <p>
              <strong className="font-satoMiddle">
                10.2. De la plataforma
              </strong>{" "}
            </p>
            <p>
              {" "}
              Todo el contenido original de la plataforma (interfaz, código,
              diseño, textos, marca) es propiedad exclusiva de EasyBits y no
              puede ser copiado, distribuido o reutilizado sin autorización
              expresa.
            </p>
          </div>
        </Clause>
        <Clause id="once" name="11. Conducta del Usuario">
          <div className="flex flex-col gap-4">
            <p>El Creador se compromete a NO:</p>
            <ul>
              <li>&bull; Subir contenido que infrinja derechos de terceros.</li>
              <li>
                &bull; Distribuir virus, malware o cualquier archivo malicioso.
              </li>
              <li>&bull; Realizar ingeniería inversa del sitio.</li>
              <li>&bull; Crear múltiples cuentas con fines fraudulentos.</li>
              <li>
                &bull; Engañar a otros usuarios mediante reseñas falsas o
                información manipulada.
              </li>
            </ul>
            <p>
              La violación de estas reglas puede resultar en la suspensión
              inmediata de la cuenta y acciones legales.
            </p>
          </div>
        </Clause>
        <Clause id="doce" name="12. Responsabilidad">
          <div className="flex flex-col gap-4">
            <p>
              15.1. EasyBits no será responsable (i) por ninguna otra
              deficiencia ni error en, o al amparo de la prestación del Servicio
              por causas ajenas a éste; (ii) de garantizar que el Servicio esté
              disponible en todo momento y para la realización de operaciones de
              pagos; (iii) por accesos no autorizados, o por uso de la
              información de la Cuenta EasyBits almacenada en los servidores de
              EasyBits; (iv) por los enlaces externos contenidos en EasyBits ni
              de las sitios web de terceras personas o del Creador ni de la
              información proporcionada por éstos. Todo ello salvo que las leyes
              aplicables establezcan lo contrario.
            </p>
            <p>
              15.2. EasyBits no será responsable, en ninguna circunstancia, por
              daños indirectos, tales como, lucro cesante, pérdida de datos u
              otras pérdidas, resultantes del uso o de la falta de uso del
              Servicio. De acuerdo con lo anterior, EasyBits no asume ninguna
              responsabilidad por ningún acto u omisión de ningún tercero.
            </p>
            <p>
              15.3. En cualquier caso, la responsabilidad de EasyBits estará
              limitada al importe equivalente al 100% de las Comisiones pagadas
              por el Creador a EasyBits durante los últimos 3 meses.
            </p>
            <p>
              15.4. EasyBits no será responsable por perjuicios que provengan
              de:
            </p>
            <p>
              (i) La intervención por parte de terceros en que haya habido culpa
              o negligencia del Creador o del Usuario final. De esta manera,
              EasyBits no será responsable ni garantizará el cumplimiento de las
              obligaciones que hubiesen asumido y acordado el Creador y el
              Usuario final con terceros en relación con el pago y recaudación
              de los dineros realizados a través de la Plataforma.
            </p>
            <p>
              (ii) La instalación, configuración y uso de los Servicios por
              parte del Creador, que haya sido realizada en contrariedad de las
              especificaciones entregadas por EasyBits.
            </p>
            <p>
              (iii) La falta de entrega de la Información en los términos
              señalados en los Términos y Condiciones.
            </p>
            <p>
              (iv) La entrega de la Información por parte del Creador que no
              cuente con las medidas de seguridad adecuada de manera que no se
              encuentre libre de virus o no haya sido debidamente encriptada
              evitando alteraciones, modificaciones, intervenciones por parte de
              terceros, durante el tránsito desde el momento de su envío hasta
              la recepción por parte de EasyBits.
            </p>
            <p>
              (v) La falta de verificación de las causas, importe o cualquier
              otra circunstancia relativa a la orden de recaudación, así como
              respecto de la existencia, calidad, cantidad, funcionamiento,
              estado, integridad o legitimidad de los Servicios del Creador.
            </p>
            <p>
              (vi) EasyBits no asume responsabilidad alguna por el uso que haga
              el Creador de su Plataforma, los datos personales de los Usuarios
              finales, los Dispositivos, o cualquier otra consecuencia jurídica
              derivada de los actos u omisiones del Creador, así como tampoco
              respecto de actos u omisiones de los Usuarios finales.
            </p>
            <p>15.5. EasyBits será responsable de:</p>
            <p>
              {" "}
              (i) Mantener la Plataforma disponible un 99% del tiempo, medido
              mensualmente. Sin embargo, en caso de mantenciones y
              actualizaciones necesarias o en caso de que los servicios
              provistos por terceros para el funcionamiento de la Plataforma
              presenten problemas, la Plataforma podrá ser suspendida por el
              período de tiempo necesario para asegurar el correcto
              funcionamiento de ésta, sin que resulte en incumplimiento del
              compromiso de disponibilidad anterior.
            </p>
          </div>
        </Clause>

        <Clause id="trece" name="13. Vigencia y terminación del contrato">
          <p>
            <strong className="font-satoMiddle">13.1. Vigencia.</strong>{" "}
          </p>
          <p>
            {" "}
            Mediante la aceptación de estos Términos y Condiciones, el Creador
            se obliga a efectuar el pago mensual del Plan contratado hasta que
            alguna de las partes notifique su término. Para dar de baja los
            Servicios, el Creador deberá completar el formulario de cancelación
            de suscripción, el cual se puede encontrar en la sección de Perfil
            de la cuenta. Para llegar a ello, el Creador debe ingresar a su
            cuenta, ir a la sección de Perfil, luego hacer clic en Administrar
            Plan y finalmente Cancelar suscripción. Al recibir la notificación
            de que el formulario fue completado, EasyBits dará de baja el plan
            al final de su actual período de facturación.
          </p>
          <p className="mt-4">
            {" "}
            El Plan contratado estará vigente durante los días que resten del
            período de facturación actual después de la notificación del
            Creador, en la medida que no exista deuda a favor de EasyBits. La
            cancelación se debe realizar antes del nuevo periodo de facturación
            para evitar que se cobre un nuevo mes de suscripción.
          </p>
          <p className="mt-4">
            {" "}
            El Creador tendrá total acceso a todas las funcionalidades de la
            Plataforma y podrá migrar u obtener todos los datos que necesite de
            EasyBits durante toda la vigencia del contrato.
          </p>
          <p className="mt-4">
            <strong className="font-satoMiddle">
              13.2. Término anticipado por incumplimiento del Creador.{" "}
            </strong>{" "}
          </p>
          <p>
            {" "}
            EasyBits podrá dar por terminado este Contrato sin previo aviso en
            caso de que el Creador: (a) haya incumplido estos Términos y
            Condiciones o cualquier otro convenio que haya celebrado con
            EasyBits, (b) genere un riesgo de crédito o fraude, (c) proporcione
            cualquier información falsa, incompleta, inexacta o engañosa, o (d)
            realice cualquier actividad fraudulenta o ilegal, (e) haya sospecha
            de que el Creador realiza dicha actividad. En cualquier caso,
            EasyBits se reserva el derecho de reclamar los daños y perjuicios
            que tal incumplimiento le haya causado.
          </p>
          <p className="mt-4">
            <strong className="font-satoMiddle">
              13.3. Responsabilidades que sobreviven al contrato.{" "}
            </strong>{" "}
          </p>
          <p>
            {" "}
            La terminación de este Contrato no liberará al Creador de ninguna
            obligación de pago en favor de EasyBits derivado de
            contraprestaciones o cualesquiera otros cargos devengados, pero no
            pagados. EasyBits se reserva las acciones legales que sean
            procedentes al objeto de hacer efectivas las responsabilidades o
            cobros que sean pertinente.
          </p>
          <p className="mt-4">
            EasyBits no será responsable de ninguna compensación, reembolso ni
            daño derivado de cualquier suspensión o terminación de los
            Servicios.
          </p>
        </Clause>
        <Clause id="catorce" name="14. Modificaciones a los términos">
          <div className="flex flex-col gap-4">
            <p>
              EasyBits puede modificar estos Términos y Condiciones en cualquier
              momento. Los cambios serán notificados a través de la Plataforma,
              y/o a través de correos electrónicos al Creador con 30 días de
              anticipación a que el cambio entre en vigor. Si el Creador
              continúa utilizando los Servicios y la Plataforma luego del plazo
              mencionado, se considera que ha aceptado las modificaciones. El
              Creador que no acepte las modificaciones podrá dar de baja su
              Cuenta.
            </p>
          </div>
        </Clause>
        <Clause id="quince" name="15. Legislación aplicable">
          <div className="flex flex-col gap-4">
            <p>
              Estos términos se rigen por las leyes de México. Cualquier disputa
              se resolverá en los tribunales de dicha jurisdicción.
            </p>
          </div>
        </Clause>
        <Clause id="diezyseis" name="16. Varios">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">
                16.1. Cuentas Inactivas.
              </strong>{" "}
              Si no se produjera ninguna actividad en la Cuenta durante, al
              menos, 12 meses consecutivos o el plazo que la legislación
              aplicable establezca y si tuviera un saldo a favor del Creador,
              éste será notificado mediante correo electrónico y el Creador
              permitirá mantener la Cuenta activa o cerrarla y retirar cualquier
              saldo pendiente. Si EasyBits no recibe ninguna respuesta del
              Creador en el plazo de treinta días a contar de la fecha de envío,
              cerrará automáticamente la Cuenta y los fondos quedarán sujetos al
              destino que determine la ley aplicable.
            </p>
            <p>
              <strong className="font-satoMiddle">
                16.2. Pagos en Moneda Extranjera.
              </strong>{" "}
              Todos los pagos deberán ser realizados en la moneda del curso
              legal del país en que se contratan los Servicios. El tipo de
              cambio que se tomará en consideración para la conversión de
              dólares estadounidenses será el que aplique el Emisor de la
              tarjeta de crédito o la plataforma procesadora de pagos (Stripe).
              En el proceso de pago podrían existir diferencias en los montos
              como consecuencia del tipo de cambio, de las que EasyBits no
              recibe beneficio alguno y por ende no se hace responsable.
            </p>
            <p>
              <strong className="font-satoMiddle">
                16.3. Seguridad de la Información.
              </strong>{" "}
              El Creador se obliga con EasyBits a evitar la transmisión de datos
              dañinos, inexactos o incompletos, y en general a cualquier
              transmisión que pudiera representar una amenaza para la seguridad
              de los sistemas, servicios, equipos, procesos o Propiedad
              Intelectual de EasyBits o de terceros, así como también que
              pudiera infringir la legislación vigente. De este modo y en caso
              de configurarse lo anterior, EasyBits le enviará al Creador una
              notificación de esta situación, debiendo el Creador hacer todas
              las gestiones y a la brevedad posible, para resolver dicha
              contingencia. Si EasyBits determina razonablemente que dicha
              contingencia representa una amenaza de seguridad real o inminente,
              EasyBits puede suspender inmediatamente la Cuenta afectada hasta
              que se resuelva la amenaza. En cualquier caso, EasyBits puede
              rescindir en forma definitiva la Cuenta, si la contingencia
              permanece sin solución por más de cinco (5) días corridos después
              de que se notifique al Creador sobre la contingencia.
            </p>
            <p>
              <strong className="font-satoMiddle">
                16.4. Veracidad de datos y Facturación.
              </strong>{" "}
              Mediante la aceptación de estos Términos y Condiciones, el Creador
              declara que todos los datos entregados son verídicos. Asimismo, el
              Creador acepta que los datos entregados sean utilizados para
              recibir facturas de parte de EasyBits por el servicio entregado,
              aceptando recibir la facturación mensual a su nombre, durante el
              periodo que duren los Servicios. El valor facturado corresponderá
              al valor del Plan contratado y las Comisiones que deba el Creador
              por el servicio de recaudación determinadas mensualmente.
            </p>

            <p>
              <strong className="font-satoMiddle">16.5. Acuerdo total.</strong>{" "}
              Los Términos y Condiciones constituyen el acuerdo integral y
              entendimiento final entre las partes respecto de los Servicios a
              ser prestados por EasyBits. Las partes manifiestan que en la
              celebración de este contrato no ha mediado ni existe dolo, mala
              fe, error, lesión o cualquier otro vicio del consentimiento que
              pudiera invalidarlo total o parcialmente, ya que mutuamente han
              convenido sobre su objeto, Tarifas, Comisiones y sus cláusulas.
            </p>
          </div>
        </Clause>
      </div>
    </section>
  );
};

const Clause = ({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: ReactNode;
}) => {
  return (
    <section id={id} className="py-40">
      <h3 className="font-title font-bold text-2xl text-brand_dark">{name}</h3>
      <p className="mt-4 text-brand_gray">{children}</p>
    </section>
  );
};

const handleClick = (id: string) => {
  const node = document.querySelector(id);
  node?.scrollIntoView({ behavior: "smooth" });
};

const Tabs = () => {
  return (
    <section className="col-span-8 lg:col-span-2 ">
      <div className="bg-white rounded-2xl overflow-hidden sticky top-[280px] flex flex-col gap-2 text-brand_dark">
        <div
          onClick={() => {
            handleClick("#uno");
          }}
        >
          <p className="cursor-pointer hover:text-brand-500 ">
            1. Generalidades{" "}
          </p>
        </div>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#dos");
          }}
        >
          2. Intervinientes y definiciones
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#tres");
          }}
        >
          3. Servicios de Easybits
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#cuatro");
          }}
        >
          4. Uso de la API
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#cinco");
          }}
        >
          5. Funcionalidad de comunidad EasyBits
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#seis");
          }}
        >
          6. Registro y cuentas de usuario
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#siete");
          }}
        >
          7. Sobre los vendedores
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#ocho");
          }}
        >
          8. Sobre los compradores
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#nueve");
          }}
        >
          9. Tarifas y Comisiones
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#diez");
          }}
        >
          10. Propiedad intelectual
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#once");
          }}
        >
          11. Conducta del Usuario
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#doce");
          }}
        >
          12. Responsabilidad
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#trece");
          }}
        >
          13. Vigencia y terminación del contrato
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#catorce");
          }}
        >
          14. Modificaciones a los términos
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#quince");
          }}
        >
          15. Legislación aplicable
        </p>
        <p
          className="cursor-pointer hover:text-brand-500"
          onClick={() => {
            handleClick("#diezyseis");
          }}
        >
          16. Varios
        </p>
      </div>
    </section>
  );
};
