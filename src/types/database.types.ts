export type GameStatus = 'LOBBY' | 'RANKING' | 'GUESSING' | 'REVEAL' | 'RESULTS' | 'FINISHED';

export type AppTheme = 'nebula' | 'ocean' | 'sunset' | 'forest';

export interface Card {
  id: string;
  content: string;
  category: string;
  created_at?: string;
}

export interface Game {
  id: string;
  code: string;
  host_id?: string;
  status: GameStatus;
  round_number: number;
  created_at?: string;
}

export interface Player {
  id: string;
  game_id: string;
  nickname: string;
  avatar_url?: string;
  auth_user_id?: string;
  score?: number;
  is_host: boolean;
  created_at?: string;
}

export interface Round {
  id: string;
  game_id: string;
  round_index: number;
  created_at?: string;
}

export interface PlayerRanking {
  id: string;
  round_id: string;
  player_id: string;
  ranking: string[]; // Array trié des IDs de cartes de 1 à 5
  is_submitted: boolean;
}

export interface RoundReveal {
  round_id: string;
  controller_player_id: string;
  revealed_count: number;
  updated_at: string;
}

export interface RoundGuess {
  round_id: string;
  guesser_player_id: string;
  target_player_id: string;
  guessed_player_id: string | null;
  is_submitted: boolean;
}

export interface RoundRevealOrder {
  round_id: string;
  reveal_index: number;
  player_id: string;
}