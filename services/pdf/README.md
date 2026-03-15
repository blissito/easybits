# PDF Service (Gotenberg)

Generates PDFs from document print URLs using Gotenberg (Chromium-based HTML→PDF).

## Deploy

```bash
cd services/pdf
fly launch --copy-config --no-deploy
fly deploy
```

## Usage

The main app calls Gotenberg's URL conversion endpoint:

```
POST https://easybits-pdf.fly.dev/forms/chromium/convert/url
Content-Type: multipart/form-data

url=https://slug.easybits.cloud/print.html
printBackground=true
paperWidth=8.5
paperHeight=11
marginTop=0
marginBottom=0
marginLeft=0
marginRight=0
```

## Environment

- `PDF_SERVICE_URL` in main app = `https://easybits-pdf.fly.dev/forms/chromium/convert/url`
- `PDF_SERVICE_SECRET` — not needed for Gotenberg (use Fly private networking or IP allowlist)
