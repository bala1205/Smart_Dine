export type OrderIntentItem = {
  menuItemId: string;
  quantity: number;
  name: string;
  price: number;
  available: boolean;
};

export type OrderIntent = {
  items: OrderIntentItem[];
  notes: string;
  ambiguous?: Array<{ query: string; options: Array<{ id: string; name: string }> }>;
  transcript?: string;
};

export type NaturalLanguageIntent = {
  matches: OrderIntentItem[];
  noMatch: boolean;
  reason?: string;
  query?: string;
};

export type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "PROCESSING"
  | "UNDERSTANDING"
  | "CONFIRMATION"
  | "ERROR";

export type VoiceOrderResult = {
  items: Array<{ name: string; quantity: number }>;
  notes: string;
  ambiguous: Array<{ query: string; options: string[] }>;
  transcript: string;
};

export type NaturalLanguageResult = {
  matches: Array<{ name: string; quantity?: number }>;
  noMatch?: boolean;
  reason?: string;
  query: string;
};
