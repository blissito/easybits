export const confirmation = ({ link }: { link: string }) => `
<div style="padding:80px 16px;font-family:sans-serif;font-size:18px;max-width:420px;margin:0 auto;color:#0E1317;">
   <img alt="logo" style="width:160px;" src="https://i.imgur.com/mpzZhT9.png" />
  <h2 style="font-size:32px;margin-top:24px;">
    👋🏼 ¡Hola Geek! 🤓
  </h2>
  <p>
    Este es un token para confirmar que eres real. 🤖 <strong>Tú sabes que los robots poco a poco se apoderan del planeta 🌎 y necesitamos asegurarnos. 😅</strong> <br />
  </p>
  <p>
    Solo da clic en el enlace. ¡Nos vemos el Fixter para ver un curso, o compartir tutoriales y guías! 
  </p>
  <a href="${link}" style="border-radius:24px;text-decoration:none;background:#83F3D3;padding:12px 16px;font-size:18px;margin:32px 0;display:block;max-width:180px;text-align:center;cursor:pointer;color:#0E1317;">
    Confirmar mi cuenta
  </a>
</div>
`;
