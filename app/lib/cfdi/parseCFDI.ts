import { XMLParser } from "fast-xml-parser";
import {
  REGIMEN_FISCAL,
  FORMA_PAGO,
  METODO_PAGO,
  USO_CFDI,
  TIPO_COMPROBANTE,
  MONEDA,
} from "./catalogos";

export interface CFDIEmisor {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  regimenFiscalDesc: string;
}

export interface CFDIReceptor {
  rfc: string;
  nombre: string;
  usoCFDI: string;
  usoCFDIDesc: string;
  regimenFiscal?: string;
  regimenFiscalDesc?: string;
  domicilioFiscal?: string;
}

export interface CFDIConcepto {
  claveProdServ: string;
  cantidad: number;
  claveUnidad: string;
  unidad?: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento?: number;
  objetoImp?: string;
  traslados?: CFDIImpuesto[];
  retenciones?: CFDIImpuesto[];
}

export interface CFDIImpuesto {
  base: number;
  impuesto: string; // 002 = IVA, 001 = ISR, 003 = IEPS
  impuestoDesc: string;
  tipoFactor: string;
  tasaOCuota: number;
  importe: number;
}

export interface CFDIPago {
  fechaPago: string;
  formaPago: string;
  formaPagoDesc: string;
  moneda: string;
  monedaDesc: string;
  monto: number;
  numOperacion?: string;
  rfcBeneficiario?: string;
  nomBancoOrdExt?: string;
  docRelacionados: CFDIDocRelacionado[];
}

export interface CFDIDocRelacionado {
  idDocumento: string;
  serie?: string;
  folio?: string;
  moneda: string;
  numParcialidad?: number;
  impSaldoAnt?: number;
  impPagado?: number;
  impSaldoInsoluto?: number;
  objetoImp?: string;
  impuestos?: {
    traslados?: CFDIImpuesto[];
    retenciones?: CFDIImpuesto[];
  };
}

export interface CFDITimbre {
  uuid: string;
  fechaTimbrado: string;
  noCertificadoSAT: string;
  selloCFD: string;
  selloSAT: string;
  version: string;
  rfcProvCertif?: string;
}

export interface CFDIData {
  version: string;
  tipo: string;
  tipoDesc: string;
  serie?: string;
  folio?: string;
  fecha: string;
  formaPago?: string;
  formaPagoDesc?: string;
  metodoPago?: string;
  metodoPagoDesc?: string;
  moneda: string;
  monedaDesc: string;
  subTotal: number;
  descuento?: number;
  total: number;
  lugarExpedicion?: string;
  exportacion?: string;
  noCertificado?: string;
  emisor: CFDIEmisor;
  receptor: CFDIReceptor;
  conceptos: CFDIConcepto[];
  pagos: CFDIPago[];
  timbre?: CFDITimbre;
  impuestos?: {
    totalTraslados?: number;
    totalRetenciones?: number;
    traslados?: CFDIImpuesto[];
    retenciones?: CFDIImpuesto[];
  };
  qrUrl?: string;
}

const IMPUESTO_DESC: Record<string, string> = {
  "001": "ISR",
  "002": "IVA",
  "003": "IEPS",
};

function attr(node: any, key: string): any {
  // fast-xml-parser with attributeNamePrefix="@_"
  return node?.[`@_${key}`] ?? node?.[key];
}

function num(val: any): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseImpuestos(node: any): CFDIImpuesto[] {
  if (!node) return [];
  const items = Array.isArray(node) ? node : [node];
  return items.map((t) => ({
    base: num(attr(t, "BaseDR") ?? attr(t, "Base")),
    impuesto: attr(t, "ImpuestoDR") ?? attr(t, "Impuesto") ?? "",
    impuestoDesc: IMPUESTO_DESC[attr(t, "ImpuestoDR") ?? attr(t, "Impuesto")] ?? "",
    tipoFactor: attr(t, "TipoFactorDR") ?? attr(t, "TipoFactor") ?? "",
    tasaOCuota: num(attr(t, "TasaOCuotaDR") ?? attr(t, "TasaOCuota")),
    importe: num(attr(t, "ImporteDR") ?? attr(t, "Importe")),
  }));
}

function ensureArray(val: any): any[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

export function parseCFDI(xmlString: string): CFDIData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });
  const parsed = parser.parse(xmlString);

  // Navigate to Comprobante — could be nested under xml declaration
  const comp =
    parsed.Comprobante ??
    parsed["cfdi:Comprobante"] ??
    Object.values(parsed).find((v: any) => v?.Comprobante)?.Comprobante ??
    parsed;

  const tipo = attr(comp, "TipoDeComprobante") ?? "";
  const moneda = attr(comp, "Moneda") ?? "MXN";
  const formaPago = attr(comp, "FormaPago");
  const metodoPago = attr(comp, "MetodoPago");

  // Emisor
  const em = comp.Emisor ?? {};
  const emisor: CFDIEmisor = {
    rfc: attr(em, "Rfc") ?? "",
    nombre: attr(em, "Nombre") ?? "",
    regimenFiscal: attr(em, "RegimenFiscal") ?? "",
    regimenFiscalDesc: REGIMEN_FISCAL[attr(em, "RegimenFiscal")] ?? "",
  };

  // Receptor
  const re = comp.Receptor ?? {};
  const receptor: CFDIReceptor = {
    rfc: attr(re, "Rfc") ?? "",
    nombre: attr(re, "Nombre") ?? "",
    usoCFDI: attr(re, "UsoCFDI") ?? "",
    usoCFDIDesc: USO_CFDI[attr(re, "UsoCFDI")] ?? "",
    regimenFiscal: attr(re, "RegimenFiscalReceptor"),
    regimenFiscalDesc: REGIMEN_FISCAL[attr(re, "RegimenFiscalReceptor")] ?? "",
    domicilioFiscal: attr(re, "DomicilioFiscalReceptor"),
  };

  // Conceptos
  const conceptosNode = comp.Conceptos?.Concepto;
  const conceptos: CFDIConcepto[] = ensureArray(conceptosNode).map((c: any) => {
    const trasladosNode = c.Impuestos?.Traslados?.Traslado;
    const retencionesNode = c.Impuestos?.Retenciones?.Retencion;
    return {
      claveProdServ: attr(c, "ClaveProdServ") ?? "",
      cantidad: num(attr(c, "Cantidad")),
      claveUnidad: attr(c, "ClaveUnidad") ?? "",
      unidad: attr(c, "Unidad"),
      descripcion: attr(c, "Descripcion") ?? "",
      valorUnitario: num(attr(c, "ValorUnitario")),
      importe: num(attr(c, "Importe")),
      descuento: attr(c, "Descuento") ? num(attr(c, "Descuento")) : undefined,
      objetoImp: attr(c, "ObjetoImp"),
      traslados: parseImpuestos(trasladosNode),
      retenciones: parseImpuestos(retencionesNode),
    };
  });

  // Complemento de Pagos
  const pagos: CFDIPago[] = [];
  const complemento = comp.Complemento;
  if (complemento) {
    const pagosNode = complemento.Pagos ?? complemento["pago20:Pagos"];
    if (pagosNode) {
      const pagoItems = ensureArray(pagosNode.Pago ?? pagosNode["pago20:Pago"]);
      for (const p of pagoItems) {
        const fp = attr(p, "FormaDePagoP") ?? "";
        const mon = attr(p, "MonedaP") ?? "MXN";
        const docRels = ensureArray(
          p.DoctoRelacionado ?? p["pago20:DoctoRelacionado"]
        );
        pagos.push({
          fechaPago: attr(p, "FechaPago") ?? "",
          formaPago: fp,
          formaPagoDesc: FORMA_PAGO[fp] ?? "",
          moneda: mon,
          monedaDesc: MONEDA[mon] ?? mon,
          monto: num(attr(p, "Monto")),
          numOperacion: attr(p, "NumOperacion"),
          rfcBeneficiario: attr(p, "RfcEmisorCtaBen"),
          nomBancoOrdExt: attr(p, "NomBancoOrdExt"),
          docRelacionados: docRels.map((d: any) => {
            const impNode = d.ImpuestosDR ?? d["pago20:ImpuestosDR"];
            return {
              idDocumento: attr(d, "IdDocumento") ?? "",
              serie: attr(d, "Serie"),
              folio: attr(d, "Folio"),
              moneda: attr(d, "MonedaDR") ?? mon,
              numParcialidad: attr(d, "NumParcialidad")
                ? num(attr(d, "NumParcialidad"))
                : undefined,
              impSaldoAnt: attr(d, "ImpSaldoAnt")
                ? num(attr(d, "ImpSaldoAnt"))
                : undefined,
              impPagado: attr(d, "ImpPagado")
                ? num(attr(d, "ImpPagado"))
                : undefined,
              impSaldoInsoluto: attr(d, "ImpSaldoInsoluto")
                ? num(attr(d, "ImpSaldoInsoluto"))
                : undefined,
              objetoImp: attr(d, "ObjetoImpDR"),
              impuestos: impNode
                ? {
                    traslados: parseImpuestos(
                      impNode.TrasladosDR?.TrasladoDR ??
                        impNode["pago20:TrasladosDR"]?.["pago20:TrasladoDR"]
                    ),
                    retenciones: parseImpuestos(
                      impNode.RetencionesDR?.RetencionDR ??
                        impNode["pago20:RetencionesDR"]?.["pago20:RetencionDR"]
                    ),
                  }
                : undefined,
            };
          }),
        });
      }
    }
  }

  // Timbre fiscal
  let timbre: CFDITimbre | undefined;
  if (complemento) {
    const tfd =
      complemento.TimbreFiscalDigital ??
      complemento["tfd:TimbreFiscalDigital"];
    if (tfd) {
      const selloCFD = attr(tfd, "SelloCFD") ?? "";
      timbre = {
        uuid: attr(tfd, "UUID") ?? "",
        fechaTimbrado: attr(tfd, "FechaTimbrado") ?? "",
        noCertificadoSAT: attr(tfd, "NoCertificadoSAT") ?? "",
        selloCFD,
        selloSAT: attr(tfd, "SelloSAT") ?? "",
        version: attr(tfd, "Version") ?? "",
        rfcProvCertif: attr(tfd, "RfcProvCertif"),
      };
    }
  }

  // Global impuestos
  const impNode = comp.Impuestos;
  const impuestos = impNode
    ? {
        totalTraslados: attr(impNode, "TotalImpuestosTrasladados")
          ? num(attr(impNode, "TotalImpuestosTrasladados"))
          : undefined,
        totalRetenciones: attr(impNode, "TotalImpuestosRetenidos")
          ? num(attr(impNode, "TotalImpuestosRetenidos"))
          : undefined,
        traslados: parseImpuestos(impNode.Traslados?.Traslado),
        retenciones: parseImpuestos(impNode.Retenciones?.Retencion),
      }
    : undefined;

  // QR URL
  const total = num(attr(comp, "Total"));
  const selloLast8 = timbre?.selloCFD?.slice(-8) ?? "";
  const qrUrl =
    timbre?.uuid
      ? `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${timbre.uuid}&re=${emisor.rfc}&rr=${receptor.rfc}&tt=${total.toFixed(6)}&fe=${selloLast8}`
      : undefined;

  return {
    version: attr(comp, "Version") ?? "4.0",
    tipo,
    tipoDesc: TIPO_COMPROBANTE[tipo] ?? tipo,
    serie: attr(comp, "Serie"),
    folio: attr(comp, "Folio"),
    fecha: attr(comp, "Fecha") ?? "",
    formaPago: formaPago,
    formaPagoDesc: formaPago ? FORMA_PAGO[formaPago] ?? "" : undefined,
    metodoPago: metodoPago,
    metodoPagoDesc: metodoPago ? METODO_PAGO[metodoPago] ?? "" : undefined,
    moneda,
    monedaDesc: MONEDA[moneda] ?? moneda,
    subTotal: num(attr(comp, "SubTotal")),
    descuento: attr(comp, "Descuento") ? num(attr(comp, "Descuento")) : undefined,
    total,
    lugarExpedicion: attr(comp, "LugarExpedicion"),
    exportacion: attr(comp, "Exportacion"),
    noCertificado: attr(comp, "NoCertificado"),
    emisor,
    receptor,
    conceptos,
    pagos,
    timbre,
    impuestos,
    qrUrl,
  };
}
