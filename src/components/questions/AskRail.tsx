import AskPanel from './AskPanel';

export const ASK_EVENT = 'tq:ask-about-note';

/** Sidebar copy of the panel; the article island (AskAboutNote) owns the composer. */
export default function AskRail({ noteId }: { noteId: string }) {
  return <AskPanel noteId={noteId} onAsk={() => window.dispatchEvent(new CustomEvent(ASK_EVENT))} />;
}
