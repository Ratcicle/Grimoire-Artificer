import React from 'react';
import { CardType } from '../types';

interface CardFrameProps {
  imageUrl?: string;
  loading: boolean;
  type?: CardType;
}

const CardFrame: React.FC<CardFrameProps> = ({ imageUrl, loading, type }) => {
  
  const getBorderColor = () => {
    switch (type) {
      case CardType.Monster: return 'border-amber-600/50';
      case CardType.Spell: return 'border-teal-500/50';
      case CardType.Trap: return 'border-rose-600/50';
      default: return 'border-stone-700';
    }
  };

  const getGlowColor = () => {
    switch (type) {
      case CardType.Monster: return 'shadow-amber-900/40';
      case CardType.Spell: return 'shadow-teal-900/40';
      case CardType.Trap: return 'shadow-rose-900/40';
      default: return 'shadow-stone-900';
    }
  };

  return (
    <div className="flex items-center justify-center w-full overflow-visible p-4">
      <div className={`relative w-[300px] sm:w-[340px] aspect-[340/470] bg-stone-900 rounded-xl border-[4px] sm:border-[6px] ${getBorderColor()} shadow-2xl ${getGlowColor()} flex items-center justify-center overflow-hidden transition-all duration-500 group shrink-0`}>
        
        {/* Background Texture/Noise */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]"></div>

        {loading ? (
          <div className="flex flex-col items-center gap-4 z-10">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-t-transparent border-stone-400 rounded-full animate-spin"></div>
            <div className="text-stone-400 font-serif tracking-widest text-[10px] sm:text-sm animate-pulse uppercase">CONJURING...</div>
          </div>
        ) : imageUrl ? (
          <div className="relative w-full h-full p-1 sm:p-2">
              {/* Inner Frame */}
              <div className="w-full h-full rounded-md overflow-hidden bg-black relative">
                  <img 
                      src={imageUrl} 
                      alt="Generated Card Art" 
                      className="w-full h-full object-cover"
                  />
                  {/* Gloss Effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none"></div>
              </div>
          </div>
        ) : (
          <div className="text-stone-600 text-center p-6 sm:p-8 z-10">
            <p className="font-serif text-base sm:text-lg mb-2 text-stone-500">Grimoire Artificer</p>
            <p className="text-[10px] uppercase tracking-wider">Awaiting Incantation</p>
          </div>
        )}

        {/* Decorative Corners */}
        <div className="absolute top-2 left-2 w-3 h-3 sm:w-4 sm:h-4 border-l-2 border-t-2 border-stone-500/50"></div>
        <div className="absolute top-2 right-2 w-3 h-3 sm:w-4 sm:h-4 border-r-2 border-t-2 border-stone-500/50"></div>
        <div className="absolute bottom-2 left-2 w-3 h-3 sm:w-4 sm:h-4 border-l-2 border-b-2 border-stone-500/50"></div>
        <div className="absolute bottom-2 right-2 w-3 h-3 sm:w-4 sm:h-4 border-r-2 border-b-2 border-stone-500/50"></div>
      </div>
    </div>
  );
};

export default CardFrame;