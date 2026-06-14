/** A single chat message in a conversation turn. */
export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A source citation surfaced to the widget on the `done` SSE event. */
export interface Source {
  n: number;
  url: string;
  title: string;
}
