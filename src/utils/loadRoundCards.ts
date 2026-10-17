import { supabase } from '../lib/supabase';
import type { Card } from '../types/database.types';

export async function loadRoundCards(
  roundId: string
): Promise<Array<Pick<Card, 'id' | 'content'>>> {
  const { data: roundCards, error: roundCardsError } = await supabase
    .from('round_cards')
    .select('card_id, position')
    .eq('round_id', roundId)
    .order('position', { ascending: true });
  if (roundCardsError) throw roundCardsError;
  if (roundCards.length === 0) {
    throw new Error('Aucune carte n’est associée à ce round.');
  }

  const cardIds = roundCards.map((roundCard) => roundCard.card_id);
  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('id, content')
    .in('id', cardIds);
  if (cardsError) throw cardsError;

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const orderedCards = cardIds
    .map((cardId) => cardsById.get(cardId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card));

  if (orderedCards.length !== cardIds.length) {
    throw new Error('Certaines cartes associées à ce round sont introuvables.');
  }

  return orderedCards;
}
