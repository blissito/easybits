export const purchase = ({
  assetName,
  date,
  price,
  link,
}: {
  link: string;
  price: number | string;
  date: string | Date;
  assetName: string;
}) => {
  return `<html>
  <head>
    <title></title>
  </head>
  <body style="font-family: Arial; background: #000000">
    <div style="background: #000000; margin: 0 auto; padding: 24px 16px">
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
            padding: 4% 4% 0px 4%;
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
            src="https://i.imgur.com/z2RnrdN.png"
          />
          <h2
            style="
              color: #000000;
              font-size: 24px;
              margin-top: 24px;
              line-height: 120%;
              text-align: left;
            "
          >
            ¡${assetName} ya es tuyo! 🎉
          </h2>
          <p
            style="
              margin-top: 12px;
              color: #323232;
              text-align: left;
              line-height: 140%;
              font-size: 16px;
            "
          >
            Da clic en el botón para visualizar el contenido.
          </p>

          <table>
            <tr>
              <td>
                <img
                  style="width: 160px; margin-right: 8px"
                  src="https://i.imgur.com/kKY4mJi.png"
                />
              </td>
              <td style="padding-left: 24px">
                <p style="color: #6a6966">
                  Asset: <strong style="color: #9870ed">
                    ${assetName}
                  </strong>
                </p>

                <p style="color: #6a6966">
                  Fecha: <strong style="color: #000000">
                    ${
                      date ||
                      new Date().toLocaleDateString("es-MX", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                      })
                    }
                  </strong>
                </p>
                <p style="color: #6a6966">
                  Precio: <strong style="color: #000000"> $${
                    price || 0
                  }</strong>
                </p>
                 <a href="https://www.formmy.app/profile" target="blank">
            <div
              style="
                background: black;
                height: 40px;
                width: 150px;
       
                border-radius: 12px;
              "
            >
              <a
              href="${link}"
                style="
                  background: #9870ed;
                  height: 40px;
                  font-weight: 500;
                  border-radius: 12px;
                  border: 2px solid black;
                  color: black;
                  width: 150px;
                  text-align: center;
                  font-size: 16px;
                  margin-left: -4px;
                  margin-top: -4px;
                "
              >
                Ver contenido
              </a>
            </div>
          </a>
              </td>
            </tr>
          </table>
          <p
            style="
              margin-top: 32px;
              color: #323232;
              text-align: justify;
              line-height: 120%;
              font-size: 16px;
            "
          >
            ¿Tienes problemas para visualizar el contenido?
            <a
              href=""
              style="text-decoration: underline; color: #9870ed !important"
              >Escríbenos</a
            >
          </p>

         

          <hr
            style="
              background: #f2f2f2;
              height: 1px;
              border: none;
              width: 100%;
              margin-top: 32px;
              margin-bottom: 0px;
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
              href="https://www.facebook.com/profile.php?id=61554028371141"
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
              href="https://www.instagram.com/_formmyapp/"
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
              href="https://www.linkedin.com/company/99530596"
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
              href="https://twitter.com/FormmyApp1"
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
              href="https://www.youtube.com/@_FormmyApp"
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
  </body>
</html>`;
};
