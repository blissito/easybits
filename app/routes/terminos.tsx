import { useEffect, type ReactNode } from "react";
import { Footer } from "~/components/common/Footer";

import { Rocket } from "~/components/icons/rocket";
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
      <div className="bg-white rounded-b-[40px] pb-[120px]">
        <AuthNav />

        <div className="grid grid-cols-8 max-w-[90%] xl:max-w-7xl mx-auto gap-12 pt-[240px] ">
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
    <section className="col-span-6  ">
      <h2 className="group text-4xl lg:text-6xl	font-bold text-brand_dark leading-tight flex flex-wrap items-center justify-start ">
        <span className="mr-4">Términos </span>
        <Rocket className="group-hover:animate-vibration-effect cursor-pointer" />{" "}
        <span className="ml-4 mr-4"> y condiciones </span>
      </h2>
      <div>
        <Clause id="uno" name="1. Generalidades">
          <p>
            Las relaciones contractuales con Deník se regirán exclusivamente por
            los siguientes Términos y Condiciones y constituyen un contrato con
            cualquier persona que navegue, desee acceder y/o usar la Plataforma
            o los Servicios de Deník, debiendo sujetarse a ellos.
          </p>
          <p className="mt-4">
            {" "}
            Cualquier persona que no acepte estos Términos y Condiciones, los
            cuales tienen un carácter obligatorio y vinculante, deberá
            abstenerse de navegar o utilizar la Plataforma y/o los Servicios. No
            está permitido el uso de los Servicios por personas incapaces ni
            menores de dieciocho años. Los Términos y Condiciones hacen
            referencia a la Política de Privacidad que son parte integrante de
            los mismos.
          </p>
        </Clause>
        <Clause id="dos" name="2. Definiciones">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">Deník:</strong> el que entrega
              los Servicios.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle"> Negocio:</strong> tercero,
              empresa, persona moral, persona física o público en general quien
              lleva a cabo una actividad ecónomica por la que brinda los
              Servicios del Negocio a los Usuarios Finales según su giro de
              Negocio, y utiliza los Servicios de Deník.{" "}
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle"> Comisión:</strong> porcentaje
              que el Negocio paga a Stripe por cobrar y percibir los pagos de
              los Usuarios finales por cuenta y orden del Negocio.
            </p>
            <p>
              <strong className="font-satoMiddle">Contracargo:</strong> Disputa
              que realiza un Usuario Final respecto de un cargo realizado con
              Tarjeta y que puede resultar en una devolución del pago al Usuario
              Final.
            </p>
            <p>
              <strong className="font-satoMiddle"> Cuenta:</strong> sesión
              exclusiva del Negocio por medio de la cual puede gestionar la
              prestación de los servicios otorgados por Deník y los servicios
              otorgados a sus Usuarios finales.
            </p>
            <p>
              <strong className="font-satoMiddle">Disputa:</strong> reclamación,
              queja o irreconocimiento de cualquier cargo o transacción
              financiera realizada a través de Deník/Stripe cuando se le haya
              instruido cobrar y percibir los pagos de los Usuarios finales por
              cuenta y orden del Negocio.
            </p>
            <p>
              <strong className="font-satoMiddle"> Staff:</strong> trabajadores,
              asociados o cualquier otra persona relacionada al Negocio.
            </p>
            <p>
              <strong className="font-satoMiddle">Plan(es):</strong> Planes o
              suscripciones ofrecidas por Deník al Negocio para el uso de la
              plataforma.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">Plataforma:</strong> sitio web
              www.denik.me
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">
                {" "}
                Cita o reservación:{" "}
              </strong>{" "}
              reservación en la agenda virtual del Negocio, consistente en el
              agendamiento de un lapso de tiempo determinado para la prestación
              de un servicio específico y que será prestado o proveído por el
              Negocio al Usuario final.
            </p>
            <p>
              <strong className="font-satoMiddle"> Servicios:</strong> actividad
              que el Negocio realiza, en su carácter de Proveedor o Prestador
              conforme las normativas de protección de consumidores y usuarios
              aplicables, en forma habitual y profesional, con los Usuarios
              finales.
            </p>
            <p>
              <strong className="font-satoMiddle"> Funcionalidades:</strong> las
              prestaciones incluidas en los Planes otorgados por Deník al
              Negocio.
            </p>
            {/* <p>
            Tarjeta de regalo: precio unitario fijado por Deník por los servicios
            ofrecidos.
          </p> */}
            <p>
              <strong className="font-satoMiddle"> Tarifa:</strong> precio
              unitario fijado por Deník por los servicios ofrecidos.
            </p>
            <p>
              <strong className="font-satoMiddle"> Usuario final:</strong>{" "}
              persona que consume los Servicios del Negocio y realiza la
              Reservación a través de la Plataforma, y puede realizar el pago, a
              través de la misma Plataforma.
            </p>
          </div>
        </Clause>
        <Clause id="tres" name="3. Servicios/funcionalades de Deník">
          <div className="flex flex-col gap-4">
            <p>
              Deník comercializa y pone a disposición de los Negocios sus
              Servicios a través de la Plataforma. Los Negocios podrán contratar
              los Servicios a través de la Plataforma, en cualquiera de los
              Planes ofrecidos por Deník, mediante el pago de la Tarifa; por su
              parte, Deník se obliga a poner a disposición la Plataforma durante
              el plazo de la contratación.
            </p>
            <p>
              El Servicio consiste en poner a disposición del Negocio un
              software como servicio, por el cual el Negocio podrá realizar la
              gestión administrativa integral de su negocio, incluyendo la base
              de datos de clientes, base de datos de profesionales, gestión de
              citas, herramientas de gestión financiera, entre otros, operando
              en todos los casos como un sistema de planificación de recursos
              (ERP). Asimismo, los Servicios incluyen el envío de notificaciones
              a los Usuarios finales, y herramientas de medición de satisfacción
              del Usuario Final.
            </p>
            <p>
              Adicionalmente, Stripe por medio de la Plataforma brendará
              servicios de valor agregado, incluyendo la actuación por orden del
              Negocio para cobrar y percibir los pagos digitales de los Usuarios
              finales,además de la conciliación, prevención del fraude, entre
              otros.
            </p>
            <p>
              <strong className="font-satoMiddle">
                3.1. Los Servicios de Deník consisten en la puesta a disposición
                de su tecnología bajo el modelo “Software as a service”, cuyos
                atributos y funcionalidades son los siguientes:
              </strong>
            </p>{" "}
            <ul className="ml-4">
              <li>
                a. Integraciones/API, la información de Deník a la disposición
                de los desarrolladores del Negocio.
              </li>
              <li>
                b. Integración con redes sociales mediante un link proporcionado
                por Deník para que los Usuarios Finales tengan la facilidad de
                realizar una Reserva en el Negocio.
              </li>
              <li>
                c. Procesamiento de la base de datos de cada Negocio, para
                cálculo de análisis de estos clientes y recomendaciones.
              </li>
              <li>
                d. Envío de notificaciones a los usuarios finales y
                profesionales del Negocio, por medio de correo electrónico, SMS,
                o WhatsApp.
              </li>
              <li>
                e. Almacenamiento privado de toda la información que cada
                Negocio ingresa a la Plataforma.
              </li>
            </ul>
            <p>
              <strong className="font-satoMiddle">
                {" "}
                3.1.2. Sistema de reserva:
              </strong>
            </p>
            <ul className="ml-4">
              <li>
                a. Agenda Online, por medio de un sistema automatizado de
                Reserva, en que el Negocio podrá manejar su agenda por medio de
                cualquier dispositivo con conexión a Internet, manteniendo el
                orden de la agenda del Negocio, el control de las Reservas y la
                información de los Usuarios Finales.
              </li>
              <li>
                b. Reserva Online, Deník entrega el link o dirección URL para
                que el Usuario Final del Negocio se dirija de forma inmediata al
                sistema de reservas de su cuenta, pudiendo reservar las horas
                del Servicio del Negocio que el Usuario Final señale y guarde.
              </li>
              <li>
                c. App personalizada de Deník para el Negocio exclusiva para los
                Usuarios Finales.
              </li>
              <li>
                d. Recordatorio automático de Reservas, en virtud del cual el
                Negocio podrá enviar recordatorios automáticos a los Usuarios
                Finales de la Reserva, a través de whatsapp, email o mensajes de
                textos, pudiendo confirmar o cancelar.
              </li>
            </ul>
            <p>
              {" "}
              <strong className="font-satoMiddle">
                3.1.3. Gestión financiera, de inventario y facturación:
              </strong>
              <ul className="ml-4">
                <li>
                  a. Sistema de caja: comisiones, caja diaria, recaudación,
                  controlando los ingresos y egresos del Negocio.
                </li>
                <li>
                  b. Facturación electrónica, mediante el envío de facturas
                  digitales de forma automática.
                </li>
                <li>
                  c. Control de inventario, por el cual el Negocio podrá ver su
                  capacidad de productos en tiempo real y tomar decisiones a
                  partir de ello.
                </li>
                <li>
                  d. Reporte de gestión online, acerca de las ventas,
                  inventario, comisiones, Reservas.
                </li>
              </ul>
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">
                3.1.4. Base de datos de usuarios
              </strong>
            </p>{" "}
            <p>
              Gestión de clientes/Usuarios Finales, en virtud de lo cual el
              Negocio podrá mantener en su Cuenta los clientes de manera
              organizada, con sus datos personales, para segmentarlos,
              fidelizarlos y analizar su comportamiento.
            </p>
          </div>
        </Clause>
        <Clause
          id="cuatro"
          name="4. Condiciones para acceder a los Servicios de Deník por parte del Negocio"
        >
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">
                4.1. Condiciones técnicas.
              </strong>{" "}
              Sin perjuicio de las condiciones de funcionamiento de la
              Plataforma y de los Servicios de Deník, es requisito del Negocio
              contar con las condiciones técnicas mínimas para su uso, las que
              consisten en contar con una computadora de escritorio o pórtatil,
              u otro equipo con un sistema operativo, un software de navegación
              por Internet, conexión a Internet y cualquier otra que sea
              necesaria para el correcto uso de un software proporcionado a
              través de Internet o Dispositivo. Deník no se responsabiliza por
              las carencias de licenciamiento del Negocio en sus computadoras,
              así como tampoco de las deficiencias en la red de internet, las
              que no son imputables a Deník.
            </p>
            <p>
              <strong className="font-satoMiddle">
                4.2. Acceso a la Plataforma.
              </strong>{" "}
              La prestación de los Servicios de Deník requiere la previa
              suscripción del Negocio en la Plataforma. El que actúa en
              representación del Negocio deberá complementar los datos del
              Negocio: nombre, email, país, teléfono, tipo de negocio, número de
              profesionales y servicios, creando una Cuenta propia para el
              Negocio.
            </p>
            <p>
              Sólo podrán tener acceso a la Cuenta aquellos Negocios que (i)
              estén debidamente registrados en la Plataforma; y (ii) que no
              hayan sido suspendidos o inhabilitados, temporal o
              definitivamente.
            </p>
            <p>
              El Negocio accederá a su Cuenta mediante el inicio de sesión
              integrado con los servicios de Google o Microsoft, o el ingreso de
              su dirección de correo electrónico (e-mail). Deníl se obliga a
              mantener la confidencialidad de la información del Negocio. En
              virtud de ello, el Negocio será el único y exclusivo responsable
              por todas las operaciones efectuadas en la Plataforma con sus
              credenciales de acceso.
            </p>
            <p>
              El Usuario final tiene la obligación de completar fidedignamente
              la información solicitada por Deník para realizar la Reservacióny
              el pago con la opción de crear una cuenta en la Plataforma.
            </p>
            <p>
              <strong className="font-satoMiddle">
                4.3. Información del Negocio.
              </strong>{" "}
              La Información del Negocio debe contener datos válidos e
              información exacta, precisa y veraz. El Negocio se obliga a
              actualizar su Información conforme resulte necesario. De acuerdo
              con lo anterior Deník NO se responsabilizará por la veracidad de
              la Información entregada. El Negocio garantiza y responde, en
              cualquier caso, de la veracidad, exactitud, integridad, vigencia y
              autenticidad de la Información, eximiendo de toda responsabilidad
              a Deník de los perjuicios que pudieran derivar del incumplimiento
              de la obligación antes descrita por parte del Negocio. Para mayor
              claridad, el Negocio será el único y exclusivo responsable de las
              manifestaciones falsas o inexactas que realice y de los perjuicios
              que cause a sí mismo, a Deník o a terceros, incluyendo los
              Usuarios finales, por la Información que faciliten.
            </p>
            <p>
              Deník se reserva el derecho de solicitar comprobantes y/o
              antecedentes adicionales a efectos de corroborar la Información
              entregada por el Negocio, pero no asume la obligación de hacerlo.
            </p>
            <p>
              Deník se reserva el derecho de rechazar una solicitud de registro
              o de cancelar o suspender, temporal o definitivamente una Cuenta,
              en caso de detectar datos falsos, incongruencias o inconsistencias
              en la Información provista por el Negocio o en caso de detectar
              actividades sospechosas, sin que tal decisión genere para el
              Negocio derechos de indemnización de ningún tipo.
            </p>
          </div>
        </Clause>
        <Clause id="cinco" name="5. Planes y forma de pago">
          <div className="flex flex-col gap-4">
            <p>
              La Plataforma ofrece a los Negocios distintos Planes, con una
              propuesta de valor y contenido diferenciado, los cuales se pueden
              pagar de manera mensual y anual. El precio dependerá del Plan
              elegido y del plazo de pago, accediendo a un descuento cuando se
              escoge la alternativa anual.
            </p>
            <p>
              La Suscripción Mensual se descuenta mes a mes desde una Tarjeta de
              crédito o débito provista por el Negocio.
            </p>
            <p>
              La Suscripción Anual considera el pago de 12 meses por adelantado.
              El Negocio podrá dar de baja su Cuenta antes de transcurrido el
              año contado desde la fecha en que se aplique el pago al Plan anual
              sin que esto implique reembolso alguno, según lo permita la ley
              aplicable.
            </p>
          </div>
        </Clause>
        <Clause id="seis" name="6. Tarifas y Comisiones">
          <div className="flex flex-col gap-4">
            <p>
              {" "}
              <strong className="font-satoMiddle">
                {" "}
                6.1. Forma de pago del Plan.{" "}
              </strong>{" "}
              El pago podrá realizarse mediante tarjeta de crédito o débito.
            </p>
            <p>
              El Negocio deberá indicar los datos necesarios y veraces para la
              correcta facturación y tratamiento tributario que corresponda,
              liberando a Deník de las responsabilidades por la inexactitud en
              la entrega de la información. Deberá señalar el Negocio un
              contacto para las gestiones de facturación correspondiente.
            </p>
            <p>
              Todos los gastos en que se incurra para la realización del pago o
              derivados de su cancelación serán a cargo del correspondiente
              Negocio.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle">
                {" "}
                6.2. Cambio en los Planes, Tarifas y Comisiones.
              </strong>{" "}
              Deník se encuentra facultado para realizar cualquier cambio en los
              Planes, Tarifas o Comisiones con aviso previo de 30 días mediante
              correo electrónico enviado a la casilla informada por el Negocio;
              en cuyo caso el Negocio podrá poner término a los Servicios,
              mediante comunicación escrita a Deník, en cuyo caso será aplicable
              la cláusula 13 de este instrumento
            </p>
            <p>
              El Negocio puede cambiar el Plan en cualquier momento. Si como
              consecuencia de ese cambio existe un mayor (o menor) valor
              respecto de lo pagado anteriormente, éste será cobrado de
              inmediato o se verá reflejado como un descuento en el mes
              siguiente a la modificación, según corresponda.
            </p>
            <p>
              {" "}
              <strong className="font-satoMiddle"> 6.3. Impuestos.</strong> El
              Negocio es el único obligado de pagar cualquier tipo de impuesto
              derivado del uso de la Plataforma y/o la prestación de sus
              servicios a los Usuarios finales.
            </p>
          </div>
        </Clause>
        <Clause id="siete" name="7. Funcionalidad de Reservación de citas">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">7.1. Descripción.</strong> A
              través de esta funcionalidad, el Negocio activo podrá direccionar
              a su Usuario final desde su página web para la realizar la
              Reservación.
            </p>
            <p>
              El tiempo de duración de cada servicio y el horario de
              funcionamiento serán determinados libremente por el Negocio a
              través de su Cuenta. Reservada la hora por el Usuario final, se
              notificará al Negocio a través de su Cuenta, quien deberá respetar
              la hora una vez reservada por el Usuario final.
            </p>
            <p>
              <strong className="font-satoMiddle">
                7.2. Otros Servicios asociados.{" "}
              </strong>{" "}
              Asimismo, el Negocio puede solicitar los siguientes Servicios:
            </p>
            <ul className="pl-4">
              <li>
                A. Proceso de Reservación en pasos por medio de página web
                personal.
              </li>
              <li>B. Bloqueo de horas por parte del Personal del Negocio.</li>
              <li>
                C. Establecer Disponibilidad horaria del Negocio o del Personal
                del mismo.
              </li>
              <li>
                D. Confirmación, edición y cancelación de Reservas vía e-mail
                por parte del Usuario final.
              </li>
              <li>
                E. Servicios Individuales para pequeñas empresas o negocios.
              </li>
              <li>
                F. Servicios grupales, mediante la suscripción Empresarial.
              </li>
              <li>
                G. Gestión y creación de Sucursales, Usuarios finales, Personal
                y servicios en función del plan de suscripción.
              </li>
              <li>
                H. Reservación y administración de Reservaciones desde la
                plataforma por el staff del Negocio.
              </li>
              <li>I. Dashboard de visualización de resumen de Reservación.</li>
              <li>J. Recordatorios al Usuario Final vía correo electrónico.</li>
            </ul>
          </div>
        </Clause>
        <Clause id="ocho" name="8. Funcionalidad de Comunidad Deník.">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">
                a. Definición de Comunidad Deník
              </strong>{" "}
              "Comunidad Deník" se refiere al marketplace proporcionado por
              Deník, en el cual los negocios que utilizan los servicios de Deník
              pueden aparecer en listados y recibir citas adicionales a través
              de búsquedas y solicitudes de usuarios externos.
            </p>
            <p>
              <strong className="font-satoMiddle">
                b. Opción de Participación:
              </strong>{" "}
              La participación de un Negocio en Comunidad Deník es completamente
              opcional y a elección del Negocio.
            </p>
            <p>
              <strong className="font-satoMiddle">
                c. Posición en Comunidad Deník:
              </strong>{" "}
              La posición de un Negocio dentro de las búsquedas de Comunidad
              Deník se determinará a discreción de Deník. Sin garantías de
              ubicación específica.
            </p>
            <p>
              <strong className="font-satoMiddle">
                d. Inclusión en Búsquedas:
              </strong>{" "}
              Dneík se reserva el derecho de decidir si un Negocio será incluido
              o no en las búsquedas de Comunidad Deník, y no estamos obligados a
              proporcionar explicaciones detalladas para cada caso.
            </p>
          </div>
        </Clause>
        <Clause id="nueve" name="9. Responsabilidades del Negocio">
          <div className="flex flex-col gap-4">
            <p>
              El Negocio asume las siguientes obligaciones y responsabilidades:
            </p>
            <ul className="pl-4 flex flex-col gap-4">
              <li>
                A. Pagar el valor del Plan escogido a su fecha de vencimiento, y
                no más de 20 días después de la emisión de factura
                correspondiente.
              </li>
              <li>
                B. Prestar a sus Usuarios finales el servicio ofrecido a través
                de la Plataforma, en las horas reservadas por éstos.
              </li>
              <li>
                C. Devolver el dinero percibido por pagos que realicen los
                Usuarios finales a través de la Plataforma por Servicios que el
                Negocio no haya podido otorgar, aun cuando la no prestación del
                servicio sea atribuible a una acción u omisión del Usuario final
                de acuerdo a las Políticas de cancelación o reagendamiento de
                citas vigentes. En caso de que el pago haya sido realizado por
                cualquier otro medio, el Negocio será el responsable de devolver
                directamente el dinero al Usuario.
              </li>
              <li>
                D. Contar con las autorizaciones, habilitaciones,
                infraestructura y títulos profesionales que sean requeridos para
                prestar los Servicios del Negocio, de acuerdo con la legislación
                local.
              </li>
              <li>
                E. Contar con la factibilidad técnica, material y de Personal
                para prestar los Servicios del Negocio ofrecidos.
              </li>
              <li>
                F. Crear cuentas de usuario para su Personal, así como asignar
                los permisos que corresponda a éstos. El Negocio será el único
                responsable del correcto uso de la Cuenta por parte de su
                Personal. Cualquier uso realizado por el Personal será imputable
                al Negocio sin posibilidad de aportar pruebas en contrario.
              </li>
              <li>
                G. Responder por los reclamos realizados por sus Usuarios
                finales en contra de Deník por los servicios que el Negocio
                ofreció y no prestó, o prestó de manera insatisfactoria para el
                Usuario final.
              </li>
              <li>
                H. Verificar y dar cumplimiento a la normativa aplicable a su
                jurisdicción respecto de los Servicios que contrata con Deník,
                incluyendo aquéllas regulaciones relativas a expediente clínico
                electrónico, consultas vía telemedicina y/o relacionados a la
                emisión de cupones, créditos por pago anticipado por los
                Servicios del Negocio y/o giftcards.
              </li>
            </ul>
            <p>
              Asimismo, se deja expresamente establecido que para la adecuada
              prestación de los servicios señalados en los Términos y
              Condiciones, el Negocio, debidamente representado, le encarga a
              Deník el tratamiento Datos Personales de sus Usuarios finales. El
              Negocio es responsable de cumplir con todas las obligaciones que
              emanan de la respectiva normativa aplicable a la protección de
              datos personas de sus Usuarios finales. El Negocio se obliga a
              indemnizar a Deník de cualquier daño o perjuicio que ésta sufra
              como consecuencia de cualquier incumplimiento por parte del
              Negocio.
            </p>
          </div>
        </Clause>
        <Clause id="diez" name="10. Responsabilidad de Deník por los Servicios">
          <div className="flex flex-col gap-4">
            <p>
              Deník asume las siguientes obligaciones y limita su
              responsabilidad conforme lo siguiente:
            </p>
            <ul className="pl-4 flex flex-col gap-4">
              <li>
                A. Deník asume el compromiso de mantener la Plataforma
                disponible un 99% del tiempo, medido mensualmente. Sin embargo,
                en caso de mantenciones y actualizaciones necesarias o en caso
                de que los servicios provistos por terceros para el
                funcionamiento de la Plataforma presenten problemas, la
                Plataforma podrá ser suspendida por el período de tiempo
                necesario para asegurar el correcto funcionamiento de ésta, sin
                que resulte en incumplimiento del compromiso de disponibilidad
                anterior.
              </li>
              <li>
                B. En ningún caso Deník es la encargada de prestar ni se hace
                responsable por los Servicios del Negocio. Deník no responde por
                el Servicio del Negocio ofrecido, de su calidad o puntualidad,
                lo cual dependen únicamente del Negocio y de su Personal, sin
                que Deník intervenga directa o indirectamente en su prestación.
              </li>
              <li>
                C. Deník no responde por la inasistencia del Usuario final a la
                hora señalada en su Reserva.
              </li>
              <li>
                D. Deník no responderá en caso de uso incorrecto de la
                Plataforma o el Dispositivo por parte del Negocio, ni del
                computador, dispositivo móvil o similar, ni en caso de error o
                excesiva demora en la transmisión de los datos de la Reserva por
                parte del servidor de Internet.
              </li>
              <li>
                E. Deník no se responsabiliza por información vertida por parte
                del Negocio o su Personal.
              </li>
              <li>
                F. Deník no asume responsabilidad alguna por el uso que haga el
                Negocio de sus Servicios, su Plataforma, los datos personales de
                los Usuarios finales, los Dispositivos, o cualquier otra
                consecuencia jurídica derivada de los actos u omisiones del
                Negocio, así como tampoco respecto de actos u omisiones de los
                Usuarios finales.
              </li>
              <li>
                G. Deník no asume responsabilidad respecto de terceros por
                quienes no tiene obligación de responder, incluyendo los
                fabricantes y/o comercializadores mayoristas de los
                Dispositivos, las entidades financieras o no financieras
                involucradas en el Sistema de Pagos del país de que se trate,
                operador de tarjetas de pago o procesador de servicios de pago,
                los proveedores de servicios que resulten críticos para el
                funcionamiento de la Plataforma, y/o cualquier otro tercero.
              </li>
            </ul>
          </div>
        </Clause>
        <Clause id="once" name="11. Servicio de intermediación en pagos">
          <p>
            El procesamiento de pagos se lleva a cabo por medio de Stripe, por
            lo que los procesos de verificación y validación de pagos son
            realizados por Stripe de forma directa. Deník no se responsabiliza
            por los procesos y validación de pagos, devoluciones,
          </p>
        </Clause>
        <Clause id="doce" name="12. Auditoría">
          <p>
            El Negocio se obliga a colaborar para que Deník lleve a cabo una
            auditoría del negocio, ya sea por sí mismo o a través de un tercero
            designado por Deník (incluyendo análisis o estudios acerca de la
            ubicación y establecimiento del negocio), en la medida que Deník
            considere necesario para garantizar el cumplimento de las leyes
            aplicables, las reglas de las Redes y/o el presente Contrato.
          </p>
        </Clause>
        <Clause id="trece" name="13. Prohibiciones del Negocio">
          <div className="flex flex-col gap-4">
            <p>
              A. La utilización de la Plataforma para realizar servicios que:
              (i) tengan contenido o permitan o realicen cualquier actividad
              contraria a las disposiciones legales y administrativas, la moral
              y las buenas costumbres; o (ii) promuevan o tengan contenidos de
              sexo en el que participen menores de 18 años, relacionados con
              pedofilia, pornografía, desnudos de menores, ya sean reales o
              simulados, o se trate de películas o fotografías que hayan sido
              tomadas de forma ilegal de menores de 18 años o sin el
              consentimiento de las personas que en ellas aparecen; o (iii)
              promuevan la violencia de cualquier tipo, la discriminación de
              cualquier tipo, prostitución, lavado de dinero, tráfico de armas,
              de personas o de animales, u otras actividades ilegales; y/u (iv)
              ofrezcan contenidos que violen cualquier legislación vigente, en
              especial aquellas referidas a la protección de derechos de
              propiedad intelectual, piratería de software, etc.
            </p>
            <p>
              B. La utilización del servicio de Pagos (cobro por cuenta y orden
              del Negocio por parte de Deník para cualquiera de los rubros
              mencionados en el punto A. anterior.)
            </p>
            <p>
              C. Ceder, sub-licenciar, copiar, publicar o distribuir el
              Servicio; (ii) permitir que ningún tercero utilice el Servicio
              prestado; (iii) ceder los derechos adquiridos al amparo del
              Servicio; o (iv) manipular ninguna de las limitaciones técnicas
              del Servicio, ni descompilar o reconstruir de otra forma el
              Servicio.
            </p>
          </div>
        </Clause>
        <Clause id="catorce" name="14. Vigencia y terminación del contrato">
          <p>
            <strong className="font-satoMiddle">14.1. Vigencia.</strong>{" "}
            Mediante la aceptación de estos Términos y Condiciones, el Negocio
            se obliga a efectuar el pago mensual del Plan contratado hasta que
            alguna de las partes notifique su término. Para dar de baja los
            Servicios, el Negocio deberá completar el formulario de cancelación
            de suscripción, el cual se puede encontrar en la sección de Perfil
            de la cuenta. Para llegar a ello, el Negocio debe ingresar a su
            cuenta, ir a la sección de Perfil, luego hacer clic en Administrar
            Plan y finalmente Cancelar suscripción. Al recibir la notificación
            de que el formulario fue completado, Deník dará de baja el plan al
            final de su actual período de facturación.
          </p>
          <p className="mt-4">
            {" "}
            El Plan contratado estará vigente durante los días que resten del
            período de facturación actual después de la notificación del
            Negocio, en la medida que no exista deuda a favor de Deník. La
            cancelación se debe realizar antes del nuevo periodo de facturación
            para evitar que se cobre un nuevo mes de suscripción.
          </p>
          <p className="mt-4">
            {" "}
            El Negocio tendrá total acceso a todas las funcionalidades de la
            Plataforma y podrá migrar u obtener todos los datos que necesite de
            Deník durante toda la vigencia del contrato.
          </p>
          <p className="mt-4">
            <strong className="font-satoMiddle">
              14.2. Término anticipado por incumplimiento del Negocio.{" "}
            </strong>{" "}
            Deník podrá dar por terminado este Contrato sin previo aviso en caso
            de que el Negocio: (a) haya incumplido estos Términos y Condiciones
            o cualquier otro convenio que haya celebrado con Deník, (b) genere
            un riesgo de crédito o fraude, (c) proporcione cualquier información
            falsa, incompleta, inexacta o engañosa, o (d) realice cualquier
            actividad fraudulenta o ilegal, (e) haya sospecha de que el Negocio
            realiza dicha actividad. En cualquier caso, Deník se reserva el
            derecho de reclamar los daños y perjuicios que tal incumplimiento le
            haya causado.
          </p>
          <p className="mt-4">
            <strong className="font-satoMiddle">
              14.3. Responsabilidades que sobreviven al contrato.{" "}
            </strong>{" "}
            La terminación de este Contrato no liberará al Negocio de ninguna
            obligación de pago en favor de Deník derivado de contraprestaciones
            o cualesquiera otros cargos devengados, pero no pagados. Deník se
            reserva las acciones legales que sean procedentes al objeto de hacer
            efectivas las responsabilidades o cobros que sean pertinente.
          </p>
          <p className="mt-4">
            Deník no será responsable de ninguna compensación, reembolso ni daño
            derivado de cualquier suspensión o terminación de los Servicios.
          </p>
        </Clause>
        <Clause id="quince" name="15. Responsabilidad">
          <div className="flex flex-col gap-4">
            <p>
              15.1. Deník no será responsable (i) por ninguna otra deficiencia
              ni error en, o al amparo de la prestación del Servicio por causas
              ajenas a éste; (ii) de garantizar que el Servicio esté disponible
              en todo momento y para la realización de operaciones de pagos;
              (iii) por accesos no autorizados a, o por uso de la información de
              la Cuenta Deník almacenada en los servidores de Deník; (iv) por
              los enlaces externos contenidos en Deník ni de las sitios web de
              terceras personas o del Negocio ni de la información proporcionada
              por éstos. Todo ello salvo que las leyes aplicables establezcan lo
              contrario.
            </p>
            <p>
              15.2. Deník no será responsable, en ninguna circunstancia, por
              daños indirectos, tales como, lucro cesante, pérdida de datos u
              otras pérdidas, resultantes del uso o de la falta de uso del
              Servicio. De acuerdo con lo anterior, Deník no asume ninguna
              responsabilidad por ningún acto u omisión de ningún tercero.
            </p>
            <p>
              15.3. En cualquier caso, la responsabilidad de Deník estará
              limitada al importe equivalente al 100% de las Comisiones pagadas
              por el Negocio a Deník durante los últimos 3 meses.
            </p>
            <p>
              15.4. Deník no será responsable por perjuicios que provengan de:
            </p>
            <p>
              (i) La intervención por parte de terceros en que haya habido culpa
              o negligencia del Negocio o del Usuario final. De esta manera,
              Deník no será responsable ni garantizará el cumplimiento de las
              obligaciones que hubiesen asumido y acordado el Negocio y el
              Usuario final con terceros en relación con el pago y recaudación
              de los dineros realizados a través de la Plataforma.
            </p>
            <p>
              (ii) La instalación, configuración y uso de los Servicios por
              parte del Negocio, que haya sido realizada en contrariedad de las
              especificaciones entregadas por Deník.
            </p>
            <p>
              (iii) La falta de entrega de la Información en los términos
              señalados en los Términos y Condiciones.
            </p>
            <p>
              (iv) La entrega de la Información por parte del Negocio que no
              cuente con las medidas de seguridad adecuada de manera que no se
              encuentre libre de virus o no haya sido debidamente encriptada
              evitando alteraciones, modificaciones, intervenciones por parte de
              terceros, durante el tránsito desde el momento de su envío hasta
              la recepción por parte de Deník.
            </p>
            <p>
              (v) La falta de verificación de las causas, importe o cualquier
              otra circunstancia relativa a la orden de recaudación, así como
              respecto de la existencia, calidad, cantidad, funcionamiento,
              estado, integridad o legitimidad de los Servicios del Negocio.
            </p>
          </div>
        </Clause>
        <Clause id="diezyseis" name="16. Propiedad Intelectual">
          <p>
            El Software, los contenidos de las pantallas relativas a los
            servicios de Deník, como así también los programas, bases de datos,
            redes y archivos son de propiedad de Deník y están protegidas por
            las leyes y los tratados internacionales de derecho de autor,
            marcas, patentes, modelos y diseños industriales. El uso indebido y
            la reproducción total o parcial de dichos contenidos quedan
            prohibidos, salvo autorización expresa y por escrito de Deník.
          </p>
          <p className="mt-4">
            {" "}
            El Negocio se compromete a comunicar a su base de usuarios en su
            sitio web, que la Plataforma es provista por Deník.
          </p>
          <p className="mt-4">
            {" "}
            Finalmente, y una vez terminado el vínculo determinado por los
            presentes Términos y Condiciones, el Negocio deberá interrumpir
            inmediatamente cualquier uso del nombre, logotipo, marcas
            comerciales, nombres comerciales, marcas de servicio, nombres de
            servicio o lemas y otras marcas de Deník, así como el uso de la
            Plataforma.
          </p>
        </Clause>
        <Clause id="diezysiete" name="17. Varios">
          <div className="flex flex-col gap-4">
            <p>
              <strong className="font-satoMiddle">
                17.1. Cuentas Inactivas.
              </strong>{" "}
              Si no se produjera ninguna actividad en la Cuenta durante, al
              menos, 12 meses consecutivos o el plazo que la legislación
              aplicable establezca y si tuviera un saldo a favor del Negocio,
              éste será notificado mediante correo electrónico y Negocio
              permitirá mantener la Cuenta activa o cerrarla y retirar cualquier
              saldo pendiente. Si Dneík no recibe ninguna respuesta del Negocio
              en el plazo de treinta días a contar de la fecha de envío, cerrará
              automáticamente la Cuenta y los fondos quedarán sujetos al destino
              que determine la ley aplicable.
            </p>
            <p>
              <strong className="font-satoMiddle">
                17.2. Pagos en Moneda Extranjera.
              </strong>{" "}
              Todos los pagos deberán ser realizados en la moneda del curso
              legal del país en que se contratan los Servicios. El tipo de
              cambio que se tomará en consideración para la conversión de
              dólares estadounidenses será el que aplique el Emisor de la
              tarjeta de crédito o la plataforma procesadora de pagos (Stripe).
              En el proceso de pago podrían existir diferencias en los montos
              como consecuencia del tipo de cambio, de las que Deník no recibe
              beneficio alguno y por ende no se hace responsable.
            </p>
            <p>
              <strong className="font-satoMiddle">
                17.3. Seguridad de la Información.
              </strong>{" "}
              El Negocio se obliga con Deník a evitar la transmisión de datos
              dañinos, inexactos o incompletos, y en general a cualquier
              transmisión que pudiera representar una amenaza para la seguridad
              de los sistemas, servicios, equipos, procesos o Propiedad
              Intelectual de Deník o de terceros, así como también que pudiera
              infringir la legislación vigente. De este modo y en caso de
              configurarse lo anterior, Deník le enviará al Negocio una
              notificación de esta situación, debiendo el Negocio hacer todas
              las gestiones y a la brevedad posible, para resolver dicha
              contingencia. Si Deník determina razonablemente que dicha
              contingencia representa una amenaza de seguridad real o inminente,
              Deník puede suspender inmediatamente la Cuenta afectada hasta que
              se resuelva la amenaza. En cualquier caso, Deník puede rescindir
              en forma definitiva la Cuenta, si la contingencia permanece sin
              solución por más de cinco (5) días corridos después de que se
              notifique al Negocio sobre la contingencia.
            </p>
            <p>
              <strong className="font-satoMiddle">
                17.4. Veracidad de datos y Facturación.
              </strong>{" "}
              Mediante la aceptación de estos Términos y Condiciones, el Negocio
              declara que todos los datos entregados son verídicos. Asimismo, el
              Negocio acepta que los datos entregados sean utilizados para
              recibir facturas de parte de Deník por el servicio entregado,
              aceptando recibir la facturación mensual a su nombre, durante el
              periodo que duren los Servicios. El valor facturado corresponderá
              al valor del Plan contratado y las Comisiones que deba el Negocio
              por el servicio de recaudación determinadas mensualmente.
            </p>
            <p>
              <strong className="font-satoMiddle">
                17.5. Modificaciones a los Términos y Condiciones.
              </strong>{" "}
              Deník puede modificar estos Términos y Condiciones en cualquier
              momento. Los cambios serán notificados a través de la Plataforma,
              y/o a través de correos electrónicos al Negocio con 30 días de
              anticipación a que el cambio entre en vigor. Si el Negocio
              continúa utilizando los Servicios y la Plataforma luego del plazo
              mencionado, se considera que ha aceptado las modificaciones. El
              Negocio que no acepte las modificaciones podrá dar de baja su
              Cuenta.
            </p>
            <p>
              <strong className="font-satoMiddle">17.6. Acuerdo total.</strong>{" "}
              Los Términos y Condiciones constituyen el acuerdo integral y
              entendimiento final entre las partes respecto de los Servicios a
              ser prestados por Deník. Las partes manifiestan que en la
              celebración de este contrato no ha mediado ni existe dolo, mala
              fe, error, lesión o cualquier otro vicio del consentimiento que
              pudiera invalidarlo total o parcialmente, ya que mutuamente han
              convenido sobre su objeto, Tarifas, Comisiones y sus cláusulas.
            </p>
            <p>
              <strong className="font-satoMiddle">17.7. Jurisdicción.</strong>{" "}
              Este acuerdo estará regido en todos sus puntos por las leyes
              vigentes en los Estados Unidos Mexicanos.
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
      <h3 className="font-title text-xl text-brand_dark">{name}</h3>
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
    <section className="col-span-6 xl:col-span-2 ">
      <div className="bg-white rounded-2xl overflow-hidden sticky top-[280px] flex flex-col gap-2 text-brand_dark">
        <div
          onClick={() => {
            handleClick("#uno");
          }}
        >
          <p className="cursor-pointer font-satoshi">1. Generalidades </p>
        </div>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#dos");
          }}
        >
          2. Intervinientes y definiciones
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#tres");
          }}
        >
          3. Servicios de Deník
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#cuatro");
          }}
        >
          4. Condiciones para acceder a los Servicios de Deník por parte del
          Negocio
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#cinco");
          }}
        >
          5. Planes y forma de pago
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#seis");
          }}
        >
          6. Tarifas y Comisiones
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#siete");
          }}
        >
          7. Funcionalidad de Reserva de citas
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#ocho");
          }}
        >
          8. Funcionalidad de Deník Market
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#nueve");
          }}
        >
          9. Responsabilidades del Negocio
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#diez");
          }}
        >
          10. Responsabilidad de Deník por los Servicios
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#once");
          }}
        >
          11. Servicio de intermediación en pagos
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#doce");
          }}
        >
          12. Auditoría
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#trece");
          }}
        >
          13. Prohibiciones del Negocio
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#catorce");
          }}
        >
          14. Vigencia y terminación del contrato
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#quince");
          }}
        >
          15. Responsabilidad
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#diezyseis");
          }}
        >
          16. Propiedad Intelectual
        </p>
        <p
          className="cursor-pointer"
          onClick={() => {
            handleClick("#diezysiete");
          }}
        >
          17. Varios
        </p>
      </div>
    </section>
  );
};
