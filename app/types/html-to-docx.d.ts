// html-to-docx no trae tipos. Declaración mínima: HTML string → docx (ArrayBuffer/Buffer).
declare module "html-to-docx" {
  const HTMLtoDOCX: (
    htmlString: string,
    headerHTMLString?: string | null,
    documentOptions?: Record<string, unknown>,
    footerHTMLString?: string | null,
  ) => Promise<ArrayBuffer | Buffer | Blob>;
  export default HTMLtoDOCX;
}
