// Catálogos SAT más comunes — códigos → texto legible

export const REGIMEN_FISCAL: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás Ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente en México",
  "611": "Ingresos por Dividendos (Socios y Accionistas)",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por Intereses",
  "615": "Régimen de los Ingresos por Obtención de Premios",
  "616": "Sin Obligaciones Fiscales",
  "620": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625": "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
};

export const FORMA_PAGO: Record<string, string> = {
  "01": "Efectivo",
  "02": "Cheque nominativo",
  "03": "Transferencia electrónica de fondos",
  "04": "Tarjeta de crédito",
  "05": "Monedero electrónico",
  "06": "Dinero electrónico",
  "08": "Vales de despensa",
  "12": "Dación en pago",
  "13": "Pago por subrogación",
  "14": "Pago por consignación",
  "15": "Condonación",
  "17": "Compensación",
  "23": "Novación",
  "24": "Confusión",
  "25": "Remisión de deuda",
  "26": "Prescripción o caducidad",
  "27": "A satisfacción del acreedor",
  "28": "Tarjeta de débito",
  "29": "Tarjeta de servicios",
  "30": "Aplicación de anticipos",
  "31": "Intermediario pagos",
  "99": "Por definir",
};

export const METODO_PAGO: Record<string, string> = {
  PUE: "Pago en una sola exhibición",
  PPD: "Pago en parcialidades o diferido",
};

export const USO_CFDI: Record<string, string> = {
  G01: "Adquisición de mercancías",
  G02: "Devoluciones, descuentos o bonificaciones",
  G03: "Gastos en general",
  I01: "Construcciones",
  I02: "Mobiliario y equipo de oficina por inversiones",
  I03: "Equipo de transporte",
  I04: "Equipo de cómputo y accesorios",
  I05: "Dados, troqueles, moldes, matrices y herramental",
  I06: "Comunicaciones telefónicas",
  I07: "Comunicaciones satelitales",
  I08: "Otra maquinaria y equipo",
  D01: "Honorarios médicos, dentales y gastos hospitalarios",
  D02: "Gastos médicos por incapacidad o discapacidad",
  D03: "Gastos funerales",
  D04: "Donativos",
  D05: "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)",
  D06: "Aportaciones voluntarias al SAR",
  D07: "Primas por seguros de gastos médicos",
  D08: "Gastos de transportación escolar obligatoria",
  D09: "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
  D10: "Pagos por servicios educativos (colegiaturas)",
  S01: "Sin efectos fiscales",
  CP01: "Pagos",
  CN01: "Nómina",
};

export const TIPO_COMPROBANTE: Record<string, string> = {
  I: "Ingreso",
  E: "Egreso",
  T: "Traslado",
  N: "Nómina",
  P: "Pago",
};

export const MONEDA: Record<string, string> = {
  MXN: "Peso Mexicano",
  USD: "Dólar Americano",
  EUR: "Euro",
  XXX: "Los códigos asignados para transacciones en que intervenga ninguna moneda",
};

export const TIPO_RELACION: Record<string, string> = {
  "01": "Nota de crédito de los documentos relacionados",
  "02": "Nota de débito de los documentos relacionados",
  "03": "Devolución de mercancía sobre facturas o traslados previos",
  "04": "Sustitución de los CFDI previos",
  "05": "Traslados de mercancías facturados previamente",
  "06": "Factura generada por los traslados previos",
  "07": "CFDI por aplicación de anticipo",
};
