export default function Home() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Manage your bot&apos;s content, configuration, and conversations.</p>
      <ul>
        <li>
          <a href="/sources">Sources</a> — add and sync your content
        </li>
        <li>
          <a href="/bot">Bot</a> — persona, theme, and embed snippet
        </li>
        <li>
          <a href="/conversations">Conversations</a> — review transcripts and feedback
        </li>
      </ul>
    </div>
  );
}
