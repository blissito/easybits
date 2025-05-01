export const magic_link = ({
  link,
  displayName,
}: {
  link: string;
  displayName?: string;
}) => `
  <div style="padding:80px 16px;font-family:sans-serif;font-size:18px;max-width:420px;margin:0 auto;color:#0E1317;">
     <img alt="logo" style="width:160px;" src="https://i.imgur.com/mpzZhT9.png" />
    <h2 style="font-size:32px;margin-top:24px;">
      👋🏼 ¡Hola ${displayName ? displayName : "EasyBiter"}! 🤓
    </h2>
    <p>
      Esta es una llave 🔑 para que puedas entrar.
      <br/>
      <strong>
        Así, no tienes que recordar constraseñas. 🤭
      </strong> 
    </p>
    <br />
    <p>
      Solo da clic en el enlace.
    </p>
    <a rel="noreferer" target="_blank" href="${link}" style="border-radius:24px;text-decoration:none;background:#83F3D3;padding:12px 16px;font-size:18px;margin:32px 0;display:block;max-width:180px;text-align:center;cursor:pointer;color:#0E1317;">
      Abrir mi cuenta
    </a>
  </div>