import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Si ya está ejecutándose como PWA instalada, no mostrar
  if (isInstalled) {
    return null;
  }

  // Flujo Chromium / Android / Desktop
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="btn-collector bg-[#009045] hover:bg-[#007a3a] text-white px-3 py-1.5 text-xs sm:text-sm font-bold rounded-[8px] shadow-xs active:scale-95 transition min-h-[38px] flex items-center gap-2"
        title="Instalar AUDITORIAPLUS+ en este dispositivo"
      >
        <Download className="w-4 h-4" />
        <span>Instalar PWA</span>
      </button>
    );
  }

  // Flujo iOS Safari
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="btn-collector border border-[#E5E7EB] bg-white text-[#1F2937] hover:bg-[#F8F9FA] px-2.5 py-1.5 text-xs font-bold rounded-[8px] min-h-[38px] card-elevation flex items-center gap-1.5 transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#263988]" />
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-[12px] bg-white border border-[#E5E7EB] p-6 modal-elevation text-[#1F2937]">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
                <h3 className="text-base font-black text-[#1F2937] flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-[#009045]" />
                  Instalar en iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-[#6B7280] hover:text-[#1F2937]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-3 text-sm text-[#6B7280] leading-relaxed">
                Para instalar la PWA de auditoría en tu colector o dispositivo Apple:
              </p>
              <ol className="mt-3 text-sm space-y-2 text-[#1F2937] bg-[#F8F9FA] p-3 rounded-[8px] border border-[#E5E7EB]">
                <li className="flex gap-2">
                  <span className="font-bold text-[#009045]">1.</span>
                  <span>Toca el botón <strong>Compartir</strong> en la barra de Safari.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-[#009045]">2.</span>
                  <span>Desliza hacia abajo y pulsa <strong>"Agregar a pantalla de inicio"</strong>.</span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-[8px] bg-[#009045] hover:bg-[#007a3a] py-2.5 text-sm font-black text-white transition active:scale-95"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
