import Composer from './Composer';

/** Full-page general-question composer (/questions/new). Usable during lecture; no note needed. */
export default function NewQuestion({ userId }: { userId: string }) {
  return (
    <Composer
      mode="question"
      userId={userId}
      draftScope="question:general"
      initialSource={null}
      autoFocus
      onCancel={() => location.assign('/questions')}
      onSaved={(id) => location.assign(`/questions/${id}?saved=1`)}
    />
  );
}
