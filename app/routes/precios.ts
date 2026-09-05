import { redirect } from "react-router";

// "Precios" es lo que la gente teclea y lo que los docs para agentes citaban
// (llms.txt apuntaba aquí y daba 404). La página vive en /planes; esto solo
// evita perder la visita. Sin `export default`: es una ruta de recurso.
export const loader = () => redirect("/planes", 301);
