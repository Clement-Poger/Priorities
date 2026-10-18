import { supabase } from '../lib/supabase';

export async function ensureRoundWithCards(
  gameId: string,
  roundIndex: number,
  cardIds: string[],
  expectedCardCount: number
): Promise<string> {
  if (cardIds.length !== expectedCardCount) {
    throw new Error(`Un round doit contenir exactement ${expectedCardCount} cartes.`);
  }

  const { data: existingRound, error: existingRoundError } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_index', roundIndex)
    .maybeSingle();
  if (existingRoundError) throw existingRoundError;

  let roundId = existingRound?.id;
  if (!roundId) {
    const { data: newRound, error: roundError } = await supabase
      .from('rounds')
      .insert([{ game_id: gameId, round_index: roundIndex }])
      .select('id')
      .single();
    if (roundError) throw roundError;
    if (!newRound) throw new Error('Le round a été créé sans retourner son identifiant.');
    roundId = newRound.id;
  }

  const { data: existingRoundCards, error: roundCardsError } = await supabase
    .from('round_cards')
    .select('card_id')
    .eq('round_id', roundId);
  if (roundCardsError) throw roundCardsError;

  if (existingRoundCards.length === 0) {
    const { error: insertError } = await supabase.from('round_cards').insert(
      cardIds.map((cardId, index) => ({
        round_id: roundId,
        card_id: cardId,
        position: index + 1,
      }))
    );
    if (insertError) throw insertError;
  } else if (existingRoundCards.length !== expectedCardCount) {
    throw new Error('Le round contient un nombre incomplet de cartes associées.');
  }

  return roundId;
}
