export const welcomeEmail = ({
  displayName,
  link,
}: {
  link: string;
  displayName?: string;
}) => `
<div style="font-family:Arial;background-color:#000000; ">
  <div style="background: #000000; margin: 0 auto; padding: 16px">
      <div
        style="
          text-align: left;
          background-color: white;
          border-radius: 16px;
          margin: 0 auto;
          max-width: 600px;
          overflow: hidden;
        "
      >
        <div
          style="
            background-image: url(https://i.imgur.com/vt00XNp.png);
            padding: 4%;
          "
        >
          <img
            alt="logo"
            style="height: 54px; width: auto"
            src="https://i.imgur.com/CNLuhvz.png"
          />
        </div>

        <div style="padding: 0 4%">
          <img
            alt="logo"
            style="width: 100%; margin-top: 16px"
            src="https://i.imgur.com/0IavZSN.png"
          />
          <h2
            style="
              color: #000000;
              font-size: 24px;
              margin-top: 0px;
              line-height: 120%;
              text-align: left;
            "
          >
            ¡Bienvenid@ a EasyBits${
              displayName === "null" ||
              displayName === "undefined" ||
              !displayName
                ? ""
                : ` ${displayName}`
            }! 🤩
          </h2>
          <p
            style="
              margin-top: 12px;
              color: #323232;
              text-align: left;
              line-height: 140%;
              font-size:16px;
            "
          >
            Hemos diseñado nuestra plataforma para ayudar a creadores, profesionales y artistas
            como tú a vender productos digitales de forma fácil y transparente.
          </p>
          <p
            style="
              margin-top: 8px;
              color: #323232;
              text-align: left;
              line-height: 120%;
                     font-size:16px;
            "
          >
            No esperes más, y completa estos sencillos pasos para empezar a
            vender tu primer producto digital:
          </p>
          <div
            style="
              text-align: left;
              width: 100%;
              margin: 0 auto;
              margin-bottom: 24px;
            "
          >
            <table>
              <tr>
                <td>
                  <img
                    style="width: 88px;  margin-right: 8px"
                    src="https://i.imgur.com/kKY4mJi.png"
                  />
                </td>
                <td>
                  <h3 style="margin: 0px; font-size: 16px; padding-top: 16px">
                    Agrega tu primer asset digital
                  </h3>
                  <p style="margin-top: 4px; color: #323232; line-height: 120%;font-size:16px;">
                    Tu primer asset no tiene que se perfecto. Lo más importante
                    es empezar. ¡No sabrás si funciona si no lo pruebas!
                  </p>
                </td>
              </tr>
            </table>
            <table>
              <tr>
                <td>
                  <img
                    style="width: 88px;  margin-right: 8px"
                    src="https://i.imgur.com/vb8cFDe.png"
                  />
                </td>
                <td>
                  <h3 style="margin: 0px; font-size: 16px; padding-top: 16px">
                    Da de alta tu cuenta de pagos
                  </h3>
                  <p style="margin-top: 4px; color: #323232; line-height: 120%; font-size:16px;">
                    Crea tu cuenta de Stripe y vincúlala a EasyBits, usamos
                    Stripe para que tengas control de cada una de las
                    transacciones con total transparencia.
                  </p>
                </td>
              </tr>
            </table>
            <table>
              <tr>
                <td>
                  <img
                    style="width: 88px;  margin-right: 8px"
                    src="https://i.imgur.com/PtmSnrM.png"
                  />
                </td>
                <td>
                  <h3 style="margin: 0px; font-size: 16px; padding-top: 16px">
                    Comparte el link con tus seguidores o clientes
                  </h3>
                  <p style="margin-top: 4px; color: #323232; line-height: 120%; font-size:16px;">
                    Comparte el link de tu asset en todas tus redes sociales, y
                    listo. ¡Tu primer venta esta en camino!
                  </p>
                </td>
              </tr>
            </table>
          </div>
          <p
            style="
              margin-top: 16px;
              color: #323232;
              text-align: justify;
              line-height: 120%;
              font-size: 16px;
            "
          >
            Es hora de <strong>empezar tu negocio digital </strong>con el
            conjunto perfecto de herramientas ¡que hemos construido para
            ti! 🔥🚀
          </p>

          <a href="${link}" target="_blank">
            <div
              style="
                background: black;
                height: 48px;
                width: 140px;
                margin-top: 40px;
                border-radius: 12px;
              "
            >
              <button
                style="
                  background: #9870ed;
                  height: 48px;
                  font-weight: 500;
                  border-radius: 12px;
                  border: 2px solid black;
                  color: black;
                  width: 140px;
                  text-align: center;
                  font-size: 16px;
                  margin-left: -4px;
                  margin-top: -4px;
                  cursor:pointer;
                "
              >
                ¡Empezar ya!
              </button>
            </div>
          </a>
          <hr
            style="
              background: #f2f2f2;
              height: 1px;
              border: none;
              width: 100%;
              margin-top: 32px;
              margin-bottom:0px;
            "
          />
        </div>
        <div
          style="
            background-image: url(https://i.imgur.com/vt00XNp.png);
            padding: 4%;
          "
        >
          <div
            style="
              text-align: center;
              margin-bottom: 0px;
              background-image: url(https://i.imgur.com/vt00XNp.png);
            "
          >
                <a
              href="https://www.facebook.com/profile.php?id=61574014173527"
              target="blank"
              style="text-decoration: none"
            >
              <img
                alt="facebook"
                style="width: 16px; height: 16px; margin: 0 4px"
                src="https://i.imgur.com/UPZRiNu.png"
              />
            </a>
            <a
              href="https://www.instagram.com/easybits.cloud/"
              target="blank"
              style="text-decoration: none"
            >
              <img
                alt="instagram"
                style="width: 18px; height: 18px; margin: 0 4px"
                src="https://i.imgur.com/npFiXsH.png"
              />
            </a>
            <a
              href="https://www.linkedin.com/company/easybitscloud/"
              target="blank"
              style="text-decoration: none"
            >
              <img
                alt="linkedin"
                style="width: 16px; height: 16px; margin: 0 4px"
                src="https://i.imgur.com/SiJY9vZ.png"
              />
            </a>

            <a
            href="https://x.com/EasyBitsCloud"
              target="blank"
              style="text-decoration: none"
            >
              <img
                alt="twitter"
                style="width: 16px; height: 16px; margin: 0 4px"
                src="https://i.imgur.com/Ft5uWk4.png"
              />
            </a>
            <a
              href="https://www.youtube.com/@EasyBitsCloud"
              target="blank"
              style="text-decoration: none"
            >
              <img
                alt="youtube"
                style="width: 16px; height: 16px; margin: 0 4px"
                src="https://i.imgur.com/OCSq1sz.png"
              />
            </a>
            <div style="text-align: center; margin-top: 16px">
              <p style="color: #6a6966; font-size: 10px">
                EasyBits. La mejor plataforma para compartir tu trabajo.
              </p>
              <p style="color: #6a6966; font-size: 10px">
                Derechos Reservados 2025©
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
</div>
`;
