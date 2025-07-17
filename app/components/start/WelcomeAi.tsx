import React, { useState } from "react";
import type { ReactNode } from "react";
import { FaPlus, FaGamepad, FaLightbulb } from "react-icons/fa";
import { MdLightbulbOutline, MdOutlineSell } from "react-icons/md";
import { TbReportAnalytics } from "react-icons/tb";

const whatsNew = [
  {
    title: "URL context tool",
    description: "Fetch information from web links",
    icon: "https://images.pexels.com/photos/1015568/pexels-photo-1015568.jpeg",
  },
  {
    title: "Native speech generation",
    description: "Generate high quality text to speech with Gemini",
    icon: "https://images.pexels.com/photos/1015568/pexels-photo-1015568.jpeg",
  },
  {
    title: "Live audio-to-audio dialog",
    description: "Try Gemini's natural, real-time dialog with audio and video inputs",
    icon: "https://images.pexels.com/photos/1015568/pexels-photo-1015568.jpeg",
  },
  {
    title: "Native image generation",
    description: "Interleaved text-and-image generation with Gemini 2.0 Flash",
    icon: "https://images.pexels.com/photos/1015568/pexels-photo-1015568.jpeg",
  },
];

// Chips row component
type TemplateChipsProps = {
  onSelect: (label: string) => void;
};

const templates: { label: string; icon: ReactNode }[] = [
  {
    label: "Genera un reporte de",
    icon: <TbReportAnalytics className="w-5 h-5" />,
  },
  {
    label: "Dime los assets más vendidos",
    icon: <MdOutlineSell className="w-5 h-5" />,
  },
  {
    label: "Dame consejos sobre",
    icon: <MdLightbulbOutline className="w-5 h-5" />,
  },
];

function TemplateChips({ onSelect, selected }: TemplateChipsProps & { selected: string | null }) {
  return (
    <div className="flex flex-wrap gap-3 w-full mb-10 justify-center" style={{ maxWidth: 900 }}>
      {templates.map((tpl) => {
        const isActive = selected === tpl.label;
        return (
          <button
            key={tpl.label}
            onClick={() => onSelect(tpl.label)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full font-medium text-sm shadow-sm transition border border-gray-300 ${
              isActive
                ? "bg-black text-white border-brand-500 hover:bg-black"
                : "bg-white text-gray-800 hover:bg-gray-100"
            }`}
          >
            <span>{tpl.icon}</span>
            {tpl.label}
          </button>
        );
      })}
    </div>
  );
}

export default function WelcomeAi({ user }: { user: any }) {
  const [inputValue, setInputValue] = useState("");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  const handleChipClick = (label: string) => {
    setInputValue(label);
    setSelectedChip(label);
  };

  return (
    <div className="flex flex-col items-center w-full min-h-screen px-4">
      <div className="flex flex-1 flex-col items-center justify-center w-full h-full min-h-screen ">
        <h1 className="text-4xl font-bold mb-10 text-center text-black">Bienvenid@ a ✨ EasyBits IA</h1>
        <div className="w-full  max-w-3xl flex flex-col items-center mx-auto  ">
          {/* Search bar */}
          <div className="flex min-w-full  items-center bg-white rounded-full border border-black shadow-sm px-4 py-2 mb-4 mx-auto" style={{ maxWidth: 600 }}>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder=""
              className="flex-1 bg-white border-none outline-none  focus:border-none focus:outline-none focus:ring-0 text-lg px-2 py-1"
              style={{ minWidth: 0 }}
            />
            <button className="ml-2 px-4 py-2 bg-brand-500 rounded-full text-black font-medium flex items-center gap-2">
              <span className="hidden md:inline">Enviar</span>
              <span className="text-xs md:text-base">⌘↵</span>
            </button>
          </div>
          {/* Chips row */}
          <TemplateChips onSelect={handleChipClick} selected={selectedChip} />
          {/* What's new */}
          <div className="w-full text-center mb-3 text-black font-medium text-base mx-auto" style={{maxWidth: 600}}>Qué hay de nuevo</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mx-auto">
            {whatsNew.map((item, idx) => (
              <NewsCard key={idx} title={item.title} description={item.description} icon={item.icon} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type NewsCardProps = { title: string; description: string; icon: string };
const NewsCard = ({ title, description, icon }: NewsCardProps) => {
  return (
    <div className="flex items-center gap-3 bg-brand-100 rounded-xl p-4 shadow-sm">
      <div className="!min-w-14 max-w-14 !h-14 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden">
        <img src={icon} alt={title} className="w-full h-full object-cover" />
      </div>
      <div>
        <div className="font-semibold text-gray-900 text-base mb-0">{title}</div>
        <div className="text-gray-600 text-sm leading-tight">{description}</div>
      </div>
    </div>
  );
};