import React, { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';

interface CardItem {
  id: string;
  content: string;
}

interface Props {
  cards: CardItem[];
  onSubmitRanking: (rankedIds: string[]) => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export const DragAndDropRanker: React.FC<Props> = ({
  cards,
  onSubmitRanking,
  isSubmitting = false,
  error,
}) => {
  const [items, setItems] = useState<CardItem[]>(cards);

  useEffect(() => {
    setItems(cards);
  }, [cards]);

  const handleDragEnd = (result: { destination?: { index: number } | null; source: { index: number } }) => {
    if (!result.destination) return;
    
    // Retour haptique léger si supporté par l'appareil
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);

    const reordered = Array.from(items);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    setItems(reordered);
  };

  const handleValidate = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([40, 60, 40]);
    onSubmitRanking(items.map(i => i.id));
  };

  return (
    <div className="ranking-screen flex flex-col h-full max-w-md mx-auto p-4 select-none">
      <div className="ranking-heading mb-4 text-center">
        <h2 className="text-xl font-bold text-slate-800">Classe tes priorités</h2>
        <p className="text-xs text-slate-500">Glisse de 1 (Préféré) en haut à 5 (Moins aimé) en bas</p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="rank-list">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="ranking-list flex-1 space-y-3 overflow-y-auto mb-4"
            >
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      data-dragging={snapshot.isDragging}
                      className={`ranking-item flex items-center p-4 rounded-xl shadow-sm border transition-colors ${
                        snapshot.isDragging 
                          ? 'bg-indigo-50 border-indigo-400 shadow-lg scale-105' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="ranking-position flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm mr-3">
                        {index + 1}
                      </div>
                      <div className="ranking-card-copy flex-1 text-slate-700 font-medium text-sm">
                        {item.content}
                      </div>
                      <GripVertical className="text-slate-400 w-5 h-5 ml-2" />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button
        onClick={handleValidate}
        disabled={isSubmitting || cards.length === 0}
        className="ranking-submit w-full py-4 bg-indigo-600 active:bg-indigo-700 text-white font-semibold rounded-xl shadow-md transition-transform active:scale-98 disabled:opacity-60"
      >
        {isSubmitting ? 'Enregistrement...' : 'Valider mon classement'}
      </button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
};