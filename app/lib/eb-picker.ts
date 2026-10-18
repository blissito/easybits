import { elementPickerJs } from "@ghostystudio/pointer/picked"

/**
 * El picker de la vista previa del creador de sitios (/dash/sitios), armado con el de
 * `@ghostystudio/pointer` en modo EasyBits: sólo `data-eb-id` (el parche depende de él), prendido
 * al cargar, avisa que está listo (llega después del `onLoad` del iframe), tema en vivo y el morado
 * de la marca. Más una capa de COMPATIBILIDAD con el protocolo viejo `eb-*`, porque las apps de los
 * usuarios cargan este archivo por URL y puede haber editores abiertos con la versión anterior:
 *   sale   {type:"eb-picker-ready" | "eb-selected"{id,tag} | "eb-deselected"} además de `gaPick`
 *   entra  {type:"eb-pointing"{on} | "eb-deselect" | "eb-theme"{colors}} además de `gaPick`
 */
export function ebPickerJs(): string {
  const pre =
    `(function(){if(window.top===window)return;window.__gaPickOnPost=function(m){var p=window.parent;` +
    `if(m.ready)p.postMessage({type:"eb-picker-ready"},"*");` +
    `else if(m.picked)p.postMessage({type:"eb-selected",id:m.picked.id,tag:m.picked.tag},"*");` +
    `else if("picked" in m)p.postMessage({type:"eb-deselected"},"*")}})();`
  const picker = elementPickerJs({
    idAttrs: ["data-eb-id"],
    requireId: true,
    startOn: true,
    announceReady: true,
    liveTheme: true,
    color: "#7c3aed",
    blockAll: false,
    expose: true,
  })
  const post =
    `(function(){var api=window.__gaPickApi;if(!api)return;addEventListener("message",function(e){` +
    `if(e.source!==parent)return;var d=e.data;if(!d||!d.type)return;` +
    `if(d.type==="eb-pointing")api.mode(d.on?"on":"off");else if(d.type==="eb-deselect")api.mode("clear");` +
    `else if(d.type==="eb-theme"&&d.colors)api.theme(d.colors)})})();`
  return (
    `// GENERADO por scripts/eb-picker.mts desde @ghostystudio/pointer — no editar a mano.\n` +
    `// Picker de la vista previa de /dash/sitios (y de las apps por URL). Ver app/lib/eb-picker.ts.\n` +
    `${pre}\n${picker}\n${post}\n`
  )
}
