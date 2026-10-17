import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import evaAvatar from '../assets/eva.webp';
import noeAvatar from '../assets/noe.webp';
import clementAvatar from '../assets/clement.png';

const fallbackAvatars = [evaAvatar, noeAvatar, clementAvatar];

interface PlayerCardProps {
  nickname: string;
  avatarUrl?: string;
  isHost?: boolean;
  isReady?: boolean;
  isCurrentPlayer?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  nickname,
  avatarUrl,
  isHost = false,
  isReady = false,
  isCurrentPlayer = false,
}) => {
  const normalizedNickname = nickname
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const nicknameAvatars: Record<string, string> = {
    clement: clementAvatar,
    clem: clementAvatar,
    c: clementAvatar,
    eva: evaAvatar,
    e: evaAvatar,
    luna: evaAvatar,
    noe: noeAvatar,
    n: noeAvatar,
  };
  const avatarIndex = Array.from(nickname).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0
  ) % fallbackAvatars.length;
  const fallbackAvatar = nicknameAvatars[normalizedNickname] ?? fallbackAvatars[avatarIndex];

  return (
    <div
      className={`player-card flex items-center justify-between p-3 rounded-xl border transition-all ${
        isCurrentPlayer
          ? 'player-current bg-indigo-50/90 border-indigo-300 shadow-sm'
          : ''
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="player-avatar-frame relative">
          <img
            src={avatarUrl || fallbackAvatar}
            alt={nickname}
            className="player-avatar w-10 h-10 rounded-full bg-slate-100 object-cover border border-slate-200"
            onError={(event) => {
              if (event.currentTarget.getAttribute('src') !== fallbackAvatar) {
                event.currentTarget.src = fallbackAvatar;
              }
            }}
          />
        </div>

        <div className="player-info flex flex-col">
          <span className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
            {nickname}
            {isCurrentPlayer && (
              <span className="text-[10px] font-bold uppercase bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded">
                Moi
              </span>
            )}
          </span>
          <span className="text-xs text-slate-400">
            {isHost ? 'Hôte du salon' : 'Joueur'}
          </span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="player-status">
        {isReady ? (
          <div className="flex items-center space-x-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-medium border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Prêt</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1 text-slate-400 bg-slate-100 px-2 py-1 rounded-full text-xs font-medium">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>Réfléchit...</span>
          </div>
        )}
      </div>
    </div>
  );
};