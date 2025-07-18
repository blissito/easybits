export const confirmation = ({
  link,
  displayName,
}: {
  link: string;
  displayName?: string;
}) => `  
<div style="font-family:Arial;background-color:#000000; ">
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
            padding: 4% 4% 16px 4%;
          "
        >
          <img
            alt="logo"
            style="height: 54px; width: auto"
            src="https://i.imgur.com/CNLuhvz.png"
          />
        </div>

        <div style="padding: 0 4%">
         
          <h2
            style="
              color: #000000;
              font-size: 24px;
              margin-top: 24px;
              line-height: 120%;
              text-align: left;
            "
          >
           👋🏼 ¡Hola ${
             displayName && displayName !== "undefined"
               ? displayName
               : "EasyBiter"
           }! Verifica tu cuenta 🤓

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
      Este es un token para confirmar que eres real. 🤖 Tú sabes que los robots poco a poco se apoderan del planeta 🌎 y necesitamos asegurarnos. 😅


           
        </p>
        <p
            style="
              margin-top: 12px;
              color: #323232;
              text-align: left;
              line-height: 140%;
              font-size: 16px;
            "
          >
       Solo da clic en el enlace.


     
        </p>
         
          <a rel="noreferer" target="_blank" href="${link}" >
            <div
              style="
                background: black;
                height: 40px;
                width: 180px;
       
                border-radius: 12px;
                     margin-top:40px;
              "
            >
              <button
                style="
                  background: #9870ed;
                  height: 40px;
                  font-weight: 550;
                  border-radius: 12px;
                  border: 2px solid black;
                  color: black;
                  width: 180px;
                  text-align: center;
                  font-size: 14px;
                  margin-left: -4px;
                  margin-top: -4px;
                "
              >
             Confirmar cuenta
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
